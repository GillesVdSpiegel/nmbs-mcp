import { z } from "zod/v4";
import { asArray, irailBool, irailNumber } from "../format.js";
import type { RawCompositionUnit } from "../irail-types.js";
import { normalizeTrainNumber, ok, toToolError } from "./shared.js";
import type { ToolContext, ToolResult } from "./shared.js";

function unit(u: RawCompositionUnit, index: number) {
  return {
    position: index + 1,
    materialType: [u.materialType?.parent_type, u.materialType?.sub_type].filter(Boolean).join("-"),
    materialNumber: u.materialNumber,
    tractionType: u.tractionType || undefined,
    seatsFirstClass: irailNumber(u.seatsFirstClass) + irailNumber(u.seatsCoupeFirstClass),
    seatsSecondClass: irailNumber(u.seatsSecondClass) + irailNumber(u.seatsCoupeSecondClass),
    standingPlaces: irailNumber(u.standingPlacesFirstClass) + irailNumber(u.standingPlacesSecondClass),
    lengthMeters: irailNumber(u.lengthInMeter),
    hasToilets: irailBool(u.hasToilets),
    hasBikeSection: irailBool(u.hasBikeSection),
    hasPrmSection: irailBool(u.hasPrmSection),
    hasPriorityPlaces: irailBool(u.hasPriorityPlaces),
    hasAirco: irailBool(u.hasAirco),
    hasPowerOutlets: irailBool(u.hasFirstClassOutlets) || irailBool(u.hasSecondClassOutlets),
    canPassToNextUnit: irailBool(u.canPassToNextUnit),
  };
}

export const trainCompositionTool = {
  name: "train_composition" as const,
  title: "Train composition",
  description:
    "Show how a train is physically made up: the ordered carriages with their material type, first/second class seats, toilets, bike and reduced-mobility sections. Useful for deciding where to stand on the platform or whether a bike fits.",
  inputSchema: {
    train_id: z
      .string()
      .min(2)
      .describe("Train id, either bare ('IC513', 'S51507') or fully qualified ('BE.NMBS.IC513')."),
  },
  async handler(input: { train_id: string }, ctx: ToolContext): Promise<ToolResult> {
    try {
      const id = normalizeTrainNumber(input.train_id);
      const response = await ctx.irail.getComposition({ id, data: "all" }, ctx.lang);
      const segments = asArray(response.composition?.segments?.segment);

      if (segments.length === 0) {
        return ok({
          train: id,
          segments: [],
          message: `No composition data published for ${id}. NMBS only publishes this for part of the fleet, and usually only close to departure.`,
        });
      }

      return ok({
        train: id,
        segments: segments.map((segment) => {
          const units = asArray(segment.composition?.units?.unit).map(unit);
          return {
            origin: segment.origin?.name,
            destination: segment.destination?.name,
            source: segment.composition?.source,
            carriageCount: units.length,
            totals: {
              seatsFirstClass: units.reduce((n, u) => n + u.seatsFirstClass, 0),
              seatsSecondClass: units.reduce((n, u) => n + u.seatsSecondClass, 0),
              lengthMeters: units.reduce((n, u) => n + u.lengthMeters, 0),
              bikeSections: units.filter((u) => u.hasBikeSection).length,
              prmSections: units.filter((u) => u.hasPrmSection).length,
            },
            units,
          };
        }),
      });
    } catch (e) {
      return toToolError(e);
    }
  },
};
