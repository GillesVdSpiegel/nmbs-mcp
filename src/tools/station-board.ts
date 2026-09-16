import { z } from "zod/v4";
import { asArray, buildPlatformInfo, buildTimeInfo, formatOccupancy, formatVehicle, irailBool } from "../format.js";
import { ok, resolveStationOrExplain, toToolError } from "./shared.js";
import type { ToolContext, ToolResult } from "./shared.js";

export const stationBoardTool = {
  name: "station_board" as const,
  title: "Live departure/arrival board",
  description:
    "Show the live departure or arrival board for a Belgian station: next trains with real-time delays, platforms, cancellations and occupancy. Covers the next `window_minutes` from now.",
  inputSchema: {
    station: z.string().min(1).describe("Station name or id, e.g. 'Leuven' or 'BE.NMBS.008833001'."),
    direction: z
      .enum(["departures", "arrivals"])
      .default("departures")
      .describe("Which board to show. Default 'departures'."),
    window_minutes: z
      .number()
      .int()
      .min(1)
      .max(720)
      .optional()
      .describe("Only include trains within this many minutes from now (default 60)."),
  },
  async handler(
    input: { station: string; direction?: "departures" | "arrivals"; window_minutes?: number },
    ctx: ToolContext,
  ): Promise<ToolResult> {
    try {
      const resolved = await resolveStationOrExplain(ctx.stations, input.station, "station");
      if ("result" in resolved) return resolved.result;

      const direction = input.direction ?? "departures";
      const windowMinutes = input.window_minutes ?? 60;

      const response = await ctx.irail.getLiveboard(
        {
          id: resolved.station.id,
          arrdep: direction === "departures" ? "departure" : "arrival",
        },
        ctx.lang,
      );

      const raw = direction === "departures" ? response.departures?.departure : response.arrivals?.arrival;
      const cutoff = Date.now() + windowMinutes * 60_000;

      // iRail returns everything it knows about (often several hours); the
      // window is applied here because the API has no equivalent parameter.
      const entries = asArray(raw)
        .map((e) => {
          const time = buildTimeInfo(e.time, e.delay);
          return {
            vehicle: formatVehicle(e.vehicle, e.vehicleinfo),
            // On a departures board this is the destination; on arrivals, the origin.
            [direction === "departures" ? "destination" : "origin"]: e.station,
            platform: buildPlatformInfo(e.platform, e.platforminfo),
            time,
            canceled: irailBool(e.canceled),
            isExtra: irailBool(e.isExtra),
            ...(direction === "departures" ? { left: irailBool(e.left) } : { arrived: irailBool(e.arrived) }),
            occupancy: formatOccupancy(e.occupancy),
          };
        })
        // Keep a train whose *scheduled* time is in the window even if a delay
        // pushes it past the cutoff — that is exactly the train a waiting
        // traveller cares about.
        .filter((e) => {
          const times = [e.time.scheduled, e.time.actual].filter((t): t is string => t !== undefined);
          return times.length === 0 || times.some((t) => new Date(t).getTime() <= cutoff);
        });

      return ok({
        station: response.stationinfo?.name ?? resolved.station.name,
        stationId: resolved.station.id,
        direction,
        windowMinutes,
        count: entries.length,
        entries,
      });
    } catch (e) {
      return toToolError(e);
    }
  },
};
