import { z } from "zod/v4";
import { publicStation } from "../stations-cache.js";
import { ok, toToolError } from "./shared.js";
import type { ToolContext, ToolResult } from "./shared.js";

export const findStationTool = {
  name: "find_station" as const,
  title: "Find a Belgian train station",
  description:
    "Search NMBS/SNCB stations by name. Matches Dutch, French, English and German spellings (e.g. 'Brussel-Zuid', 'Bruxelles-Midi' and 'Brussels-South' all find the same station), and tolerates partial names and typos. Use this to get the station id that the other tools accept unambiguously.",
  inputSchema: {
    query: z.string().min(1).describe("Full or partial station name, e.g. 'Gent', 'Bruxelles-Midi', 'Antwerp Central'."),
    limit: z.number().int().min(1).max(25).optional().describe("Maximum matches to return (default 8)."),
  },
  async handler(input: { query: string; limit?: number }, ctx: ToolContext): Promise<ToolResult> {
    try {
      const matches = await ctx.stations.search(input.query, input.limit ?? 8);
      return ok({ query: input.query, count: matches.length, matches: matches.map(publicStation) });
    } catch (e) {
      return toToolError(e);
    }
  },
};
