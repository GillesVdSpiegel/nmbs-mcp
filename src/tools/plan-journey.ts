import { z } from "zod/v4";
import { parseWhen } from "../datetime.js";
import {
  asArray,
  buildPlatformInfo,
  buildTimeInfo,
  formatAlerts,
  formatOccupancy,
  formatVehicle,
  irailBool,
  irailNumber,
} from "../format.js";
import type { RawConnection, RawConnectionEndpoint, RawVia } from "../irail-types.js";
import { displayName } from "../stations-cache.js";
import { ok, resolveStationOrExplain, toToolError } from "./shared.js";
import type { ToolContext, ToolResult } from "./shared.js";

function endpoint(e: RawConnectionEndpoint) {
  return {
    station: e.station,
    stationId: e.stationinfo?.id,
    platform: buildPlatformInfo(e.platform, e.platforminfo),
    time: buildTimeInfo(e.time, e.delay),
    canceled: irailBool(e.canceled),
  };
}

// Derived from the real-time stop times rather than iRail's `timeBetween`,
// which is often absent or zero.
function transferMinutes(via: RawVia): number {
  const arrive = irailNumber(via.arrival.time) + irailNumber(via.arrival.delay);
  const depart = irailNumber(via.departure.time) + irailNumber(via.departure.delay);
  return Math.max(0, Math.round((depart - arrive) / 60));
}

function buildLegs(connection: RawConnection) {
  const vias = asArray(connection.vias?.via);
  const legs = [];

  for (let i = 0; i <= vias.length; i++) {
    const from = i === 0 ? connection.departure : vias[i - 1].departure;
    const to = i === vias.length ? connection.arrival : vias[i].arrival;
    const transferStop = i === 0 ? undefined : vias[i - 1];

    legs.push({
      vehicle: formatVehicle(from.vehicle, from.vehicleinfo),
      direction: from.direction?.name,
      from: endpoint(from),
      to: endpoint(to),
      occupancy: formatOccupancy(from.occupancy),
      walking: irailBool(from.walking),
      ...(transferStop ? { transferMinutes: transferMinutes(transferStop) } : {}),
    });
  }

  return legs;
}

export const planJourneyTool = {
  name: "plan_journey" as const,
  title: "Plan a train journey",
  description:
    "Plan a train journey between two Belgian stations, with real-time delays, platforms, transfers and service alerts. Station names are matched fuzzily; if a name is ambiguous the result lists the candidates instead of guessing.",
  inputSchema: {
    from: z.string().min(1).describe("Departure station name or id, e.g. 'Brussel-Centraal' or 'BE.NMBS.008813003'."),
    to: z.string().min(1).describe("Destination station name or id."),
    when: z
      .string()
      .optional()
      .describe("'now' (default) or an ISO-8601 date-time in Belgian local time, e.g. '2026-09-20T14:30'. Natural language like 'tomorrow morning' is not supported — convert it to ISO-8601 first."),
    arrive_by: z
      .boolean()
      .optional()
      .describe("When true, `when` is the desired arrival time rather than the departure time. Default false."),
  },
  async handler(
    input: { from: string; to: string; when?: string; arrive_by?: boolean },
    ctx: ToolContext,
  ): Promise<ToolResult> {
    try {
      const from = await resolveStationOrExplain(ctx.stations, input.from, "from");
      if ("result" in from) return from.result;
      const to = await resolveStationOrExplain(ctx.stations, input.to, "to");
      if ("result" in to) return to.result;

      const { date, time } = parseWhen(input.when);
      const response = await ctx.irail.getConnections(
        {
          from: from.station.id,
          to: to.station.id,
          date,
          time,
          timesel: input.arrive_by ? "arrival" : "departure",
        },
        ctx.lang,
      );

      const connections = asArray(response.connection);
      return ok({
        from: { id: from.station.id, name: displayName(from.station, ctx.lang) },
        to: { id: to.station.id, name: displayName(to.station, ctx.lang) },
        when: input.when ?? "now",
        arriveBy: input.arrive_by ?? false,
        count: connections.length,
        journeys: connections.map((c) => ({
          departure: { ...endpoint(c.departure), direction: c.departure.direction?.name },
          arrival: endpoint(c.arrival),
          durationMinutes: Math.round(irailNumber(c.duration) / 60),
          transfers: asArray(c.vias?.via).length,
          legs: buildLegs(c),
          alerts: formatAlerts(c.alerts),
        })),
      });
    } catch (e) {
      return toToolError(e);
    }
  },
};
