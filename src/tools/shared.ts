import { DateTimeParseError } from "../datetime.js";
import { IrailError } from "../irail-client.js";
import type { IrailClient } from "../irail-client.js";
import type { Lang } from "../irail-types.js";
import type { StationsCache } from "../stations-cache.js";
import { publicStation } from "../stations-cache.js";
import type { ResolveResult, Station } from "../stations-cache.js";

export interface ToolContext {
  irail: IrailClient;
  stations: StationsCache;
  /** Language for iRail-supplied text: station names, directions, disruption copy. */
  lang: Lang;
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}

export function ok(payload: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

export function fail(kind: string, message: string): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: true, kind, message }, null, 2) }],
    isError: true,
  };
}

/** Never let a raw throw cross the MCP boundary — callers get a kind they can branch on. */
export function toToolError(e: unknown): ToolResult {
  if (e instanceof IrailError) return fail(e.kind, e.message);
  if (e instanceof DateTimeParseError) return fail("invalid_datetime", e.message);
  return fail("internal_error", e instanceof Error ? e.message : String(e));
}

/**
 * Resolves a station name for the journey/board tools. An ambiguous or unknown
 * name is a normal result, not an error: the caller should re-ask or re-call
 * with a station id rather than treat it as a failure.
 */
export async function resolveStationOrExplain(
  stations: StationsCache,
  query: string,
  field: string,
): Promise<{ station: Station } | { result: ToolResult }> {
  const resolved: ResolveResult = await stations.resolveOne(query);
  if (resolved.status === "resolved") return { station: resolved.station };

  if (resolved.status === "ambiguous") {
    return {
      result: ok({
        status: "ambiguous_station",
        field,
        query,
        message: `"${query}" matches several stations. Re-run with one of the ids or exact names below.`,
        candidates: resolved.candidates.map(publicStation),
      }),
    };
  }

  return {
    result: ok({
      status: "unknown_station",
      field,
      query,
      message: `No Belgian station matches "${query}". Try find_station to look up the right name.`,
    }),
  };
}

/** `/vehicle` wants BE.NMBS.IC513; users (and other tools' output) supply either form. */
export function normalizeVehicleId(trainId: string): string {
  const trimmed = trainId.trim().replace(/\s+/g, "").toUpperCase();
  if (trimmed.startsWith("BE.NMBS.")) return trimmed;
  return `BE.NMBS.${trimmed}`;
}

/** `/composition` wants the bare IC513 form instead. */
export function normalizeTrainNumber(trainId: string): string {
  return trainId.trim().replace(/\s+/g, "").toUpperCase().replace(/^BE\.NMBS\./, "");
}
