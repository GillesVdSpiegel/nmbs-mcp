/**
 * Table-driven check of the lexical parser: `npm run parse-test`.
 * Hits iRail once for the station list, then parses offline.
 */
import { IrailClient } from "../../irail-client.js";
import { StationsCache } from "../../stations-cache.js";
import { parseQuery } from "./parse.js";
import type { ParsedQuery } from "./parse.js";

const stations = new StationsCache(new IrailClient());

// Fixed reference point so weekday and "tomorrow" expectations stay stable.
const NOW = new Date("2026-09-16T12:00:00+02:00");

interface Case {
  q: string;
  intent: ParsedQuery["intent"];
  overrides?: { from?: string; to?: string; station?: string };
  field?: string;
  from?: string;
  to?: string;
  station?: string;
  train?: string;
  when?: string;
  arriveBy?: boolean;
  direction?: string;
  note?: string;
}

const cases: Case[] = [
  // English
  { q: "Leuven to Ghent", intent: "journey", from: "Leuven", to: "Ghent-Sint-Pieters" },
  { q: "from Leuven to Oostende", intent: "journey", from: "Leuven", to: "Oostende" },
  // Expectations use iRail's English name, which is what Station.name holds.
  { q: "Antwerp Central to Hasselt tomorrow at 14:00", intent: "journey", from: "Antwerp-Central", to: "Hasselt", when: "2026-09-17T14:00" },
  { q: "Leuven to Bruges before 9 tomorrow", intent: "journey", from: "Leuven", to: "Brugge", when: "2026-09-17T09:00", arriveBy: true },
  { q: "trains to Ostend", intent: "board", station: "Oostende" },
  { q: "Leuven", intent: "board", station: "Leuven", direction: "departures" },
  { q: "arrivals at Leuven", intent: "board", station: "Leuven", direction: "arrivals" },
  { q: "next trains from Namur", intent: "board", station: "Namur" },
  { q: "IC 513", intent: "track", train: "IC513" },
  { q: "where is IC513", intent: "track", train: "IC513" },
  { q: "carriages of IC 513", intent: "composition", train: "IC513" },
  { q: "bike spaces on IC1832", intent: "composition", train: "IC1832" },
  { q: "disruptions", intent: "disruptions" },
  { q: "any strikes today?", intent: "disruptions" },

  // Dutch
  { q: "van Leuven naar Gent", intent: "journey", from: "Leuven", to: "Ghent-Sint-Pieters" },
  { q: "Brugge naar Oostende morgen om 14u30", intent: "journey", from: "Brugge", to: "Oostende", when: "2026-09-17T14:30" },
  { q: "trein naar Hasselt", intent: "board", station: "Hasselt" },
  { q: "vertrek Leuven", intent: "board", station: "Leuven", direction: "departures" },
  { q: "aankomsten Gent-Sint-Pieters", intent: "board", station: "Ghent-Sint-Pieters", direction: "arrivals" },
  { q: "storingen", intent: "disruptions" },
  { q: "samenstelling IC 513", intent: "composition", train: "IC513" },
  { q: "van Leuven naar Brugge tegen 9u", intent: "journey", from: "Leuven", to: "Brugge", arriveBy: true },

  // French
  { q: "de Louvain a Gand", intent: "journey", from: "Leuven", to: "Ghent-Sint-Pieters" },
  { q: "Bruxelles-Midi vers Liege", intent: "journey", from: "Brussels-South/Brussels-Midi", to: "Liège-Guillemins" },
  { q: "train vers Namur", intent: "board", station: "Namur" },
  { q: "perturbations", intent: "disruptions" },
  { q: "voitures du IC 513", intent: "composition", train: "IC513" },
  { q: "de Gand a Bruges demain a 14h30", intent: "journey", from: "Ghent-Sint-Pieters", to: "Brugge", when: "2026-09-17T14:30" },

  // Traps
  { q: "Leuven to Gent tomorrow at 14u30", intent: "journey", from: "Leuven", to: "Ghent-Sint-Pieters", when: "2026-09-17T14:30", note: "14u30 must not parse as a train" },
  { q: "Brussel to Leuven", intent: "ambiguous", note: "Brussels has many stations" },
  { q: "berchem naar knokke morgen 14:00", intent: "ambiguous", field: "from", note: "two Berchems" },
  {
    // Answering "which Berchem?" must keep the destination and the time.
    q: "berchem naar knokke morgen 14:00",
    intent: "journey",
    overrides: { from: "BE.NMBS.008821121" },
    from: "Antwerp-Berchem",
    to: "Knokke",
    when: "2026-09-17T14:00",
    note: "override resolves only the ambiguous field",
  },
  { q: "gent sint pieters", intent: "board", station: "Ghent-Sint-Pieters", note: "missing hyphens" },
  { q: "Bruxelles-Midi", intent: "board", station: "Brussels-South/Brussels-Midi", note: "French name" },
  { q: "purple monkey dishwasher", intent: "unknown" },
  { q: "waar kan ik een goede wafel eten", intent: "unknown", note: "must not match Ede inside 'goede'" },
  { q: "where can I buy a ticket", intent: "unknown" },
  { q: "", intent: "unknown" },
];

let failures = 0;

for (const c of cases) {
  const result = await parseQuery(c.q, stations, NOW, c.overrides ?? {});
  const problems: string[] = [];

  if (result.intent !== c.intent) problems.push(`intent ${result.intent} != ${c.intent}`);
  if (c.field && result.intent === "ambiguous" && result.field !== c.field) {
    problems.push(`field ${result.field} != ${c.field}`);
  }
  if (result.intent === "journey") {
    if (c.from && result.from.name !== c.from) problems.push(`from "${result.from.name}" != "${c.from}"`);
    if (c.to && result.to.name !== c.to) problems.push(`to "${result.to.name}" != "${c.to}"`);
    if (c.when && result.when !== c.when) problems.push(`when ${result.when} != ${c.when}`);
    if (c.arriveBy !== undefined && result.arriveBy !== c.arriveBy) problems.push(`arriveBy ${result.arriveBy}`);
  }
  if (result.intent === "board") {
    if (c.station && result.station.name !== c.station) problems.push(`station "${result.station.name}" != "${c.station}"`);
    if (c.direction && result.direction !== c.direction) problems.push(`direction ${result.direction}`);
  }
  if ((result.intent === "track" || result.intent === "composition") && c.train && result.trainId !== c.train) {
    problems.push(`train ${result.trainId} != ${c.train}`);
  }

  const detail =
    result.intent === "journey"
      ? `${result.from.name} -> ${result.to.name}${result.when ? ` @ ${result.when}` : ""}${result.arriveBy ? " (arrive by)" : ""}`
      : result.intent === "board"
        ? `${result.station.name} ${result.direction}`
        : result.intent === "track" || result.intent === "composition"
          ? result.trainId
          : result.intent === "ambiguous"
            ? `${result.field}="${result.query}" (${result.candidates.length})`
            : "";

  if (problems.length === 0) {
    console.log(`PASS  ${c.q.padEnd(42)} ${result.intent}${detail ? " · " + detail : ""}`);
  } else {
    failures++;
    console.log(`FAIL  ${c.q.padEnd(42)} ${problems.join("; ")}  got: ${detail}${c.note ? `  [${c.note}]` : ""}`);
  }
}

console.log(failures === 0 ? `\nAll ${cases.length} parse cases passed.` : `\n${failures} of ${cases.length} failed.`);
process.exit(failures === 0 ? 0 : 1);
