import { z } from "zod/v4";
import { unixToIso } from "../datetime.js";
import { asArray } from "../format.js";
import type { Lang } from "../irail-types.js";
import { ok, toToolError } from "./shared.js";
import type { ToolContext, ToolResult } from "./shared.js";

export const checkDisruptionsTool = {
  name: "check_disruptions" as const,
  title: "Check network disruptions",
  description:
    "List current and planned disruptions on the Belgian rail network: strikes, engineering works, incidents and the lines they affect.",
  inputSchema: {
    lang: z
      .enum(["nl", "fr", "en", "de"])
      .optional()
      .describe("Language for disruption text (default 'en')."),
    limit: z.number().int().min(1).max(100).optional().describe("Maximum disruptions to return (default 25)."),
  },
  async handler(input: { lang?: Lang; limit?: number }, ctx: ToolContext): Promise<ToolResult> {
    try {
      const response = await ctx.irail.getDisturbances(input.lang ?? ctx.lang);
      const all = asArray(response.disturbance);
      const limit = input.limit ?? 25;

      return ok({
        total: all.length,
        returned: Math.min(all.length, limit),
        disruptions: all.slice(0, limit).map((d) => ({
          title: d.title,
          description: d.description,
          type: d.type,
          link: d.link,
          updatedAt: unixToIso(d.timestamp),
          attachments: asArray(d.descriptionLinks?.descriptionLink).map((l) => ({ text: l.text, link: l.link })),
        })),
      });
    } catch (e) {
      return toToolError(e);
    }
  },
};
