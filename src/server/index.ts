import "./env.js";
import Anthropic from "@anthropic-ai/sdk";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod/v4";
import { contextFor, runChat } from "./agent.js";
import { runQuery } from "./query.js";
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
