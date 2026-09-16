import "./env.js";
import Anthropic from "@anthropic-ai/sdk";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod/v4";
import { contextFor, runChat } from "./agent.js";
import { runQuery } from "./query.js";
import { checkDisruptionsTool } from "../tools/check-disruptions.js";
import { findStationTool } from "../tools/find-station.js";
import { planJourneyTool } from "../tools/plan-journey.js";
import { stationBoardTool } from "../tools/station-board.js";
import { trackTrainTool } from "../tools/track-train.js";
import { trainCompositionTool } from "../tools/train-composition.js";
import { clearHistory } from "./sessions.js";
import type { ChatEvent } from "./events.js";

const PORT = Number(process.env.PORT ?? 8787);

const lang = z.enum(["en", "nl", "fr"]).default("en");

const chatRequest = z.object({
  sessionId: z.string().min(1).max(100),
  message: z.string().trim().min(1).max(4000),
  lang,
});

const stationId = z.string().max(64);

const queryRequest = z.object({
  query: z.string().trim().min(1).max(200),
  lang,
  overrides: z
    .object({ from: stationId.optional(), to: stationId.optional(), station: stationId.optional() })
    .optional(),
});

const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true }));

app.delete("/api/session/:id", (c) => {
  clearHistory(c.req.param("id"));
  return c.body(null, 204);
});

app.post("/api/chat", async (c) => {
  const parsed = chatRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Expected { sessionId, message }." }, 400);
  }
  const { sessionId, message, lang: uiLang } = parsed.data;

  return streamSSE(c, async (stream) => {
    const emit = (event: ChatEvent) => stream.writeSSE({ data: JSON.stringify(event) });
    try {
      await runChat(sessionId, message, uiLang, emit);
    } catch (e) {
      console.error("[chat]", e);
      await emit({ type: "error", message: describeError(e) });
    }
  });
});

/**
 * Direct tool access for UI affordances that need data, not reasoning — a
 * "show the carriages" button should not cost a model call. The allowlist and
 * each tool's own Zod schema keep the surface exactly as wide as the six tools.
 */
const TOOLS = {
  find_station: findStationTool,
  plan_journey: planJourneyTool,
  station_board: stationBoardTool,
  track_train: trackTrainTool,
  check_disruptions: checkDisruptionsTool,
  train_composition: trainCompositionTool,
} as const;

const toolRequest = z.object({
  tool: z.enum(Object.keys(TOOLS) as [keyof typeof TOOLS, ...Array<keyof typeof TOOLS>]),
  input: z.record(z.string(), z.unknown()).default({}),
  lang,
});

app.post("/api/tool", async (c) => {
  const parsed = toolRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Expected { tool, input, lang }." }, 400);

  const definition = TOOLS[parsed.data.tool];
  const input = z.object(definition.inputSchema).safeParse(parsed.data.input);
  if (!input.success) return c.json({ error: `Invalid input for ${parsed.data.tool}.` }, 400);

  try {
    const result = await definition.handler(input.data as never, contextFor(parsed.data.lang));
    return c.json({
      ok: !result.isError,
      tool: parsed.data.tool,
      payload: JSON.parse(result.content[0].text),
    });
  } catch (e) {
    console.error("[tool]", e);
    return c.json({ error: describeError(e) }, 502);
  }
});

// No model, no streaming: one parse and one tool call.
app.post("/api/query", async (c) => {
  const parsed = queryRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Expected { query, lang }." }, 400);

  try {
    return c.json(await runQuery(parsed.data.query, contextFor(parsed.data.lang), parsed.data.overrides ?? {}));
  } catch (e) {
    console.error("[query]", e);
    return c.json({ error: describeError(e) }, 502);
  }
});

app.use("/*", serveStatic({ root: "./web/dist" }));
app.get("*", serveStatic({ path: "./web/dist/index.html" }));

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`nmbs chat server listening on http://localhost:${info.port}`);
});

function describeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "The server's Anthropic API key was rejected.";
  if (e instanceof Anthropic.RateLimitError) return "The Anthropic API is rate limiting us; try again in a moment.";
  if (e instanceof Anthropic.APIConnectionError) return "Could not reach the Anthropic API.";
  if (e instanceof Anthropic.APIError) {
    const body = e.error as { error?: { message?: string } } | undefined;
    return `Anthropic API error (${e.status}): ${body?.error?.message ?? e.message}`;
  }
  // A non-API AnthropicError before any request is almost always missing credentials.
  if (e instanceof Anthropic.AnthropicError) {
    return "The server has no Anthropic credentials. Add ANTHROPIC_API_KEY to .env and restart the server.";
  }
  return e instanceof Error ? e.message : "Something went wrong.";
}
