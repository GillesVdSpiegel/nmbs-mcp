import { z } from "zod/v4";
import { formatIrailDate, parseWhen } from "../datetime.js";
import { asArray, buildPlatformInfo, buildTimeInfo, formatAlerts, formatOccupancy, formatVehicle, irailBool } from "../format.js";
import { normalizeVehicleId, ok, toToolError } from "./shared.js";
import type { ToolContext, ToolResult } from "./shared.js";

export const trackTrainTool = {
  name: "track_train" as const,
  title: "Track a train",
  description:
    "Follow one train run stop by stop: every station it calls at, with scheduled and real-time arrival/departure, delays, platforms and cancellations. The most reliable train id is one returned by station_board or plan_journey.",
  inputSchema: {
    train_id: z
      .string()
      .min(2)
      .describe("Train id, either bare ('IC513', 'S23764') or fully qualified ('BE.NMBS.IC513')."),
    date: z
      .string()
      .optional()
      .describe("Service date as ISO 'YYYY-MM-DD' (default today). iRail only holds data for dates close to today."),
  },
  async handler(input: { train_id: string; date?: string }, ctx: ToolContext): Promise<ToolResult> {
    try {
      const id = normalizeVehicleId(input.train_id);
      const date = input.date ? parseWhen(input.date).date : formatIrailDate(new Date());

      const response = await ctx.irail.getVehicle({ id, date }, ctx.lang);
      const stops = asArray(response.stops?.stop);

      return ok({
        train: formatVehicle(response.vehicle, response.vehicleinfo),
        date,
        currentPosition:
          response.vehicleinfo && Number(response.vehicleinfo.locationY) !== 0
            ? { latitude: Number(response.vehicleinfo.locationY), longitude: Number(response.vehicleinfo.locationX) }
            : undefined,
        stopCount: stops.length,
        stops: stops.map((s) => ({
          station: s.station,
          stationId: s.stationinfo?.id,
          platform: buildPlatformInfo(s.platform, s.platforminfo),
          arrival: buildTimeInfo(s.scheduledArrivalTime, s.arrivalDelay),
          departure: buildTimeInfo(s.scheduledDepartureTime, s.departureDelay),
          canceled: irailBool(s.canceled),
          arrived: irailBool(s.arrived),
          left: irailBool(s.left),
          isExtraStop: irailBool(s.isExtraStop),
          occupancy: formatOccupancy(s.occupancy),
        })),
        alerts: formatAlerts(response.alerts),
      });
    } catch (e) {
      return toToolError(e);
    }
  },
};
