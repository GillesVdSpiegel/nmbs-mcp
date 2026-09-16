/**
 * Live smoke test against the real iRail API: `npm run manual-test`.
 * Exercises each tool handler end-to-end (everything except the MCP transport).
 * Train ids are taken from a live board rather than hardcoded, so the script
 * keeps working on any future day.
 */
import { IrailClient } from "./irail-client.js";
import { StationsCache } from "./stations-cache.js";
import { checkDisruptionsTool } from "./tools/check-disruptions.js";
import { findStationTool } from "./tools/find-station.js";
import { planJourneyTool } from "./tools/plan-journey.js";
import { stationBoardTool } from "./tools/station-board.js";
import { trackTrainTool } from "./tools/track-train.js";
import { trainCompositionTool } from "./tools/train-composition.js";
import type { ToolContext, ToolResult } from "./tools/shared.js";

const irail = new IrailClient();
const ctx: ToolContext = { irail, stations: new StationsCache(irail), lang: "en" };

let failures = 0;

function payload(result: ToolResult): any {
  return JSON.parse(result.content[0].text);
}

async function check(name: string, fn: () => Promise<string | void>): Promise<void> {
  try {
    const note = await fn();
    console.log(`PASS  ${name}${note ? ` — ${note}` : ""}`);
  } catch (e) {
    failures++;
    console.log(`FAIL  ${name} — ${e instanceof Error ? e.message : String(e)}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

let sampleTrainId: string | undefined;
let boardTrainIds: string[] = [];

await check("find_station('Brussel') returns multiple Brussels stations", async () => {
  const data = payload(await findStationTool.handler({ query: "Brussel" }, ctx));
  assert(data.count >= 2, `expected >=2 matches, got ${data.count}`);
  return `${data.count} matches, top: ${data.matches[0].name}`;
});

await check("find_station matches French and English spellings", async () => {
  const fr = payload(await findStationTool.handler({ query: "Bruxelles-Midi" }, ctx));
  const en = payload(await findStationTool.handler({ query: "Brussels-South" }, ctx));
  assert(fr.matches[0]?.id === en.matches[0]?.id, `fr=${fr.matches[0]?.id} en=${en.matches[0]?.id}`);
  return `both resolve to ${fr.matches[0]?.id}`;
});

await check("station_board departures at Brussels-Central", async () => {
  const data = payload(await stationBoardTool.handler({ station: "Brussels-Central", direction: "departures" }, ctx));
  assert(Array.isArray(data.entries), "entries missing");
  boardTrainIds = data.entries.map((e: any) => e.vehicle?.id).filter(Boolean);
  sampleTrainId = boardTrainIds[0];
  return `${data.count} departures in next ${data.windowMinutes}min${sampleTrainId ? `, first: ${sampleTrainId}` : " (none — quiet hour?)"}`;
});

await check("station_board arrivals honours window_minutes", async () => {
  const wide = payload(await stationBoardTool.handler({ station: "Leuven", direction: "arrivals", window_minutes: 120 }, ctx));
  const narrow = payload(await stationBoardTool.handler({ station: "Leuven", direction: "arrivals", window_minutes: 15 }, ctx));
  assert(narrow.count <= wide.count, `15min window (${narrow.count}) should not exceed 120min (${wide.count})`);
  return `15min=${narrow.count}, 120min=${wide.count}`;
});

await check("plan_journey Brussels-Central -> Ghent-Sint-Pieters", async () => {
  const data = payload(await planJourneyTool.handler({ from: "Brussel-Centraal", to: "Gent-Sint-Pieters" }, ctx));
  // On failure, show what actually came back — an error kind or an ambiguity
  // is a very different diagnosis from an empty result.
  assert(data.count >= 1, `expected >=1 journey, got: ${JSON.stringify(data).slice(0, 200)}`);
  const first = data.journeys[0];
  assert(first.legs.length >= 1, "journey has no legs");
  return `${data.count} options, first: ${first.durationMinutes}min, ${first.transfers} transfer(s), ${first.legs[0].vehicle.name}`;
});

await check("plan_journey with arrive_by and an explicit ISO time", async () => {
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const data = payload(
    await planJourneyTool.handler(
      { from: "Antwerpen-Centraal", to: "Brussel-Centraal", when: `${tomorrow}T09:00`, arrive_by: true },
      ctx,
    ),
  );
  assert(data.count >= 1, `expected >=1 journey, got ${data.count}`);
  return `${data.count} options arriving by ${tomorrow}T09:00`;
});

await check("plan_journey surfaces ambiguous station instead of guessing", async () => {
  const data = payload(await planJourneyTool.handler({ from: "Brussel", to: "Gent-Sint-Pieters" }, ctx));
  assert(data.status === "ambiguous_station", `expected ambiguous_station, got ${data.status ?? "a journey list"}`);
  return `${data.candidates.length} candidates offered`;
});

await check("plan_journey reports unknown station cleanly", async () => {
  const data = payload(await planJourneyTool.handler({ from: "Nowhereville", to: "Leuven" }, ctx));
  assert(data.status === "unknown_station", `expected unknown_station, got ${data.status}`);
  return "unknown_station";
});

await check("check_disruptions", async () => {
  const data = payload(await checkDisruptionsTool.handler({}, ctx));
  assert(Array.isArray(data.disruptions), "disruptions missing");
  return `${data.total} active, showing ${data.returned}`;
});

await check("track_train on a live train from the board", async () => {
  assert(boardTrainIds.length > 0, "no train ids captured from the departures board");
  // iRail sometimes lists a vehicle on a board but has no journey record for
  // it, so try a few rather than asserting the first one is always trackable.
  for (const id of boardTrainIds.slice(0, 5)) {
    const result = await trackTrainTool.handler({ train_id: id }, ctx);
    if (result.isError) continue;
    const data = payload(result);
    if (data.stopCount > 0) {
      sampleTrainId = id;
      return `${data.train.name}: ${data.stopCount} stops, ${data.stops[0].station} -> ${data.stops[data.stops.length - 1].station}`;
    }
  }
  throw new Error(`none of ${boardTrainIds.slice(0, 5).join(", ")} had a journey record`);
});

await check("track_train accepts a bare train number", async () => {
  assert(sampleTrainId, "no train id captured from the departures board");
  const bare = sampleTrainId.replace("BE.NMBS.", "");
  const data = payload(await trackTrainTool.handler({ train_id: bare }, ctx));
  assert(data.stopCount > 0, `expected stops for ${bare}`);
  return `${bare} resolved`;
});

await check("track_train reports an unknown train as an error", async () => {
  const result = await trackTrainTool.handler({ train_id: "IC99999" }, ctx);
  assert(result.isError, "expected isError");
  const data = payload(result);
  assert(data.kind === "not_found", `expected kind not_found, got ${data.kind}`);
  return `${data.kind}`;
});

await check("train_composition for a live train", async () => {
  assert(sampleTrainId, "no train id captured from the departures board");
  const data = payload(await trainCompositionTool.handler({ train_id: sampleTrainId }, ctx));
  if (data.segments.length === 0) return "no composition published (acceptable)";
  const seg = data.segments[0];
  assert(seg.units.length > 0, "segment has no units");
  return `${seg.carriageCount} carriages, ${seg.totals.seatsSecondClass} 2nd-class seats, ${seg.totals.lengthMeters}m`;
});

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
