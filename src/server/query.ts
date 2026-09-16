import { displayName, publicStation } from "../stations-cache.js";
import type { Lang } from "../irail-types.js";
import { checkDisruptionsTool } from "../tools/check-disruptions.js";
import { planJourneyTool } from "../tools/plan-journey.js";
import { stationBoardTool } from "../tools/station-board.js";
import { trackTrainTool } from "../tools/track-train.js";
import { trainCompositionTool } from "../tools/train-composition.js";
import type { ToolContext, ToolResult } from "../tools/shared.js";
import type { ToolName } from "./events.js";
import { parseQuery } from "./parse/parse.js";
import type { Overrides } from "./parse/parse.js";

export interface QueryResult {
  ok: boolean;
  /** What the parser understood, for the interpretation line. */
  interpretation: {
    intent: string;
    from?: string;
    to?: string;
    station?: string;
    trainId?: string;
    when?: string;
    direction?: string;
    field?: "from" | "to" | "station";
  };
  tool?: ToolName;
  payload?: unknown;
  /** Set when nothing could be parsed, so the UI can offer the assistant instead. */
  unparsed?: string;
}

const unwrap = (result: ToolResult) => ({ ok: !result.isError, payload: JSON.parse(result.content[0].text) });

/**
 * Lexical path: parse the query with rules, call the one matching tool, and
 * return the same payload shape the model's tool calls produce, so the browser
 * renders it with the same components.
 */
export async function runQuery(query: string, ctx: ToolContext, overrides: Overrides = {}): Promise<QueryResult> {
  const parsed = await parseQuery(query, ctx.stations, new Date(), overrides);
  const lang: Lang = ctx.lang;

  switch (parsed.intent) {
    case "journey": {
      const { ok, payload } = unwrap(
        await planJourneyTool.handler(
          { from: parsed.from.id, to: parsed.to.id, when: parsed.when ?? "now", arrive_by: parsed.arriveBy },
          ctx,
        ),
      );
      return {
        ok,
        tool: "plan_journey",
        payload,
        // ISO, not prose: the browser formats it in the active language.
        interpretation: {
          intent: "journey",
          from: displayName(parsed.from, lang),
          to: displayName(parsed.to, lang),
          when: parsed.when,
          direction: parsed.arriveBy ? "arrive" : "depart",
        },
      };
    }

    case "board": {
      const { ok, payload } = unwrap(
        await stationBoardTool.handler({ station: parsed.station.id, direction: parsed.direction }, ctx),
      );
      return {
        ok,
        tool: "station_board",
        payload,
        interpretation: { intent: "board", station: displayName(parsed.station, lang), direction: parsed.direction },
      };
    }

    case "track": {
      const { ok, payload } = unwrap(await trackTrainTool.handler({ train_id: parsed.trainId }, ctx));
      return { ok, tool: "track_train", payload, interpretation: { intent: "track", trainId: parsed.trainId } };
    }

    case "composition": {
      const { ok, payload } = unwrap(await trainCompositionTool.handler({ train_id: parsed.trainId }, ctx));
      return {
        ok,
        tool: "train_composition",
        payload,
        interpretation: { intent: "composition", trainId: parsed.trainId },
      };
    }

    case "disruptions": {
      const { ok, payload } = unwrap(await checkDisruptionsTool.handler({ lang }, ctx));
      return { ok, tool: "check_disruptions", payload, interpretation: { intent: "disruptions" } };
    }

    case "ambiguous":
      // Reuses the tools' ambiguity shape, so the same renderer draws the picker.
      return {
        ok: true,
        tool: "find_station",
        interpretation: { intent: "ambiguous", station: parsed.query, field: parsed.field },
        payload: {
          status: "ambiguous_station",
          field: parsed.field,
          query: parsed.query,
          message: "",
          candidates: parsed.candidates.map(publicStation),
        },
      };

    case "unknown":
      return { ok: false, interpretation: { intent: "unknown" }, unparsed: parsed.text };
  }
}
