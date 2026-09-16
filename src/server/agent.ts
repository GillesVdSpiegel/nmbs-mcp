import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { IrailClient } from "../irail-client.js";
import { StationsCache } from "../stations-cache.js";
import { checkDisruptionsTool } from "../tools/check-disruptions.js";
import { findStationTool } from "../tools/find-station.js";
import { planJourneyTool } from "../tools/plan-journey.js";
import { stationBoardTool } from "../tools/station-board.js";
import { trackTrainTool } from "../tools/track-train.js";
import { trainCompositionTool } from "../tools/train-composition.js";
import type { ToolContext, ToolResult } from "../tools/shared.js";
import { getHistory, setHistory } from "./sessions.js";
import type { Lang } from "../irail-types.js";
import type { ChatEvent, ToolName } from "./events.js";

export const MODEL = "claude-opus-5";

// One client and one station cache for the whole process: every browser
// session shares the same iRail rate-limit budget and warm station list.
const irail = new IrailClient({ userAgent: "nmbs-mcp-web/0.1.0 (chat front end for NMBS/SNCB train info)" });
export const stations = new StationsCache(irail);

/**
 * Per-request context. The client and station cache are shared deliberately:
 * one rate-limit bucket for the whole process, and one warm station list.
 */
export const contextFor = (lang: Lang): ToolContext => ({ irail, stations, lang });

// Org-level API keys (not scoped to a workspace) must name the workspace on
// every request; workspace-scoped keys need nothing extra.
const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
const client = new Anthropic(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {});

export type Emit = (event: ChatEvent) => Promise<void> | void;

interface McpTool<Shape extends z.ZodRawShape> {
  name: ToolName;
  description: string;
  inputSchema: Shape;
  handler: (input: z.infer<z.ZodObject<Shape>>, ctx: ToolContext) => Promise<ToolResult>;
}

/** MCP tools take a raw zod shape; the SDK's tool runner wants a ZodObject. That is the whole adapter. */
function adapt<Shape extends z.ZodRawShape>(tool: McpTool<Shape>, ctx: ToolContext, emit: Emit) {
  return betaZodTool({
    name: tool.name,
    description: tool.description,
    inputSchema: z.object(tool.inputSchema),
    run: async (input, context) => {
      const result = await tool.handler(input, ctx);
      const text = result.content[0].text;
      await emit({
        type: "tool_end",
        id: context?.toolUse.id ?? "",
        name: tool.name,
        input: input as Record<string, unknown>,
        ok: !result.isError,
        payload: JSON.parse(text),
      });
      return text;
    },
  });
}

function buildTools(ctx: ToolContext, emit: Emit) {
  return [
    adapt(findStationTool, ctx, emit),
    adapt(planJourneyTool, ctx, emit),
    adapt(stationBoardTool, ctx, emit),
    adapt(trackTrainTool, ctx, emit),
    adapt(checkDisruptionsTool, ctx, emit),
    adapt(trainCompositionTool, ctx, emit),
  ];
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Brussels",
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const hourFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", hour: "2-digit", hour12: false });

// Only the date and the hour appear here, so the cached prefix survives a
// whole hour of conversation instead of being invalidated every request.
const LANGUAGE_NAMES: Record<Lang, string> = { en: "English", nl: "Dutch", fr: "French", de: "German" };

function systemPrompt(lang: Lang): string {
  const now = new Date();
  return `You are a travel assistant for the Belgian railway (NMBS/SNCB), working from live iRail data through your tools.

Today is ${dateFormatter.format(now)}, and it is around ${hourFormatter.format(now)}:00 in Belgium (Europe/Brussels). The tools use the exact current time whenever "now" is passed.

How to work:
- Convert relative times ("tomorrow at 9", "Friday evening", "in an hour") to ISO-8601 in Belgian local time before calling plan_journey. "Be there before 9" means arrive_by: true.
- Belgian stations have Dutch, French, English and German names, and Brussels alone has several stations. When a name could match more than one station, call find_station first and pass the station id. If a tool returns ambiguous_station, list the candidates in one line and ask which one.
- Train ids come from station_board or plan_journey results. Never invent one.
- Only state times, platforms, delays, cancellations and carriages that a tool returned. If a tool returns nothing, say so plainly.
- The interface renders every tool result as a card beside your reply, so do not repeat rows. Summarise, point out what matters (delays, platform changes, cancellations, a transfer that is tight), and recommend.
- iRail only holds data for dates close to today.
- Keep replies short and concrete. Write only in ${LANGUAGE_NAMES[lang]} — never pair a translation with the original, even when a station has names in several languages.`;
}

export async function runChat(sessionId: string, userMessage: string, lang: Lang, emit: Emit): Promise<void> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [...getHistory(sessionId), { role: "user", content: userMessage }];

  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 64000,
    system: systemPrompt(lang),
    tools: buildTools(contextFor(lang), emit),
    messages,
    stream: true,
    output_config: { effort: "medium" },
    cache_control: { type: "ephemeral" },
  });

  const usage = { input: 0, output: 0 };
  let finalMessage: Anthropic.Beta.BetaMessage | undefined;

  for await (const messageStream of runner) {
    for await (const event of messageStream) {
      if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
        await emit({ type: "tool_start", id: event.content_block.id, name: event.content_block.name as ToolName });
      } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        await emit({ type: "text", delta: event.delta.text });
      }
    }

    finalMessage = await messageStream.finalMessage();
    // input_tokens excludes the cached prefix; count what was actually sent.
    usage.input +=
      finalMessage.usage.input_tokens +
      (finalMessage.usage.cache_read_input_tokens ?? 0) +
      (finalMessage.usage.cache_creation_input_tokens ?? 0);
    usage.output += finalMessage.usage.output_tokens;

    if (finalMessage.stop_reason === "refusal") {
      await emit({ type: "error", message: "The assistant declined to answer that request." });
      break;
    }
    if (finalMessage.stop_reason === "max_tokens" && finalMessage.content.some((b) => b.type === "tool_use")) {
      throw new Error("A tool call was cut off by max_tokens; raise the limit.");
    }
  }

  // The runner appends each completed turn to its params; make sure the final
  // assistant turn is in the stored history whether or not it did so.
  const history = [...runner.params.messages];
  const last = history[history.length - 1];
  if (finalMessage && last?.role !== "assistant") {
    history.push({ role: "assistant", content: finalMessage.content });
  }
  setHistory(sessionId, history);

  await emit({ type: "done", usage });
}
