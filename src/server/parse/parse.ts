import { normalize } from "../../stations-cache.js";
import type { ScoredStation, Station, StationsCache } from "../../stations-cache.js";
import {
  ARRIVALS_WORDS,
  BOARD_WORDS,
  COMPOSITION_WORDS,
  DISRUPTION_WORDS,
  FROM_WORDS,
  NOISE_WORDS,
  PREPOSITIONS,
  TO_WORDS,
  TRACK_WORDS,
} from "./keywords.js";
import { extractWhen } from "./when.js";

export type ParsedQuery =
  | { intent: "journey"; from: Station; to: Station; when?: string; arriveBy: boolean; whenLabel?: string }
  | { intent: "board"; station: Station; direction: "departures" | "arrivals" }
  | { intent: "track"; trainId: string }
  | { intent: "composition"; trainId: string }
  | { intent: "disruptions" }
  | { intent: "ambiguous"; field: "from" | "to" | "station"; query: string; candidates: ScoredStation[] }
  | { intent: "unknown"; text: string };

type Resolution = { station: Station; candidates?: undefined } | { station?: undefined; candidates: ScoredStation[] } | null;

const EDGE_WORDS = [...FROM_WORDS, ...BOARD_WORDS, ...PREPOSITIONS];

const anyOf = (words: string[]) => words.map((w) => w.replace(/ /g, "\\s+")).join("|");
const hasWord = (text: string, words: string[]) => new RegExp(`\\b(?:${anyOf(words)})\\b`).test(text);
const dropWords = (text: string, words: string[]) =>
  text.replace(new RegExp(`\\b(?:${anyOf(words)})\\b`, "g"), " ").replace(/\s+/g, " ").trim();

/**
 * Lowercase and de-accent, but keep punctuation: `normalize()` would turn
 * "14:00" into "14 00", and the time parser needs the separator intact.
 */
function softNormalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9:.\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type Overrides = Partial<Record<"from" | "to" | "station", string>>;

export async function parseQuery(
  raw: string,
  stations: StationsCache,
  now = new Date(),
  overrides: Overrides = {},
): Promise<ParsedQuery> {
  if (!raw.trim()) return { intent: "unknown", text: raw };

  // Times first, while ":" and "h"/"u" separators still exist, so "14u30" is
  // never mistaken for a train number.
  const { when, arriveBy, rest, label } = extractWhen(softNormalize(raw), now);
  const text = normalize(rest);
  if (!text) return { intent: "unknown", text: raw };

  const wantsComposition = hasWord(text, COMPOSITION_WORDS);
  const wantsDisruptions = hasWord(text, DISRUPTION_WORDS);

  // A train id, not a bare number: a lone number is far more likely a stray digit.
  const trainMatch = text.match(/\b([a-z]{1,3})\s?(\d{2,5})\b/);
  const trainId = trainMatch ? `${trainMatch[1]}${trainMatch[2]}`.toUpperCase() : undefined;
  const withoutTrain = trainMatch ? text.replace(trainMatch[0], " ").replace(/\s+/g, " ").trim() : text;

  // Keep the connector: "a" is the French "to" as well as an English article,
  // so structure must be read before noise words are thrown away.
  const body = dropWords(withoutTrain, DISRUPTION_WORDS);

  if (trainId && (wantsComposition || hasWord(text, TRACK_WORDS) || !stripNoise(body))) {
    return wantsComposition ? { intent: "composition", trainId } : { intent: "track", trainId };
  }

  const connector = body.match(new RegExp(`\\s\\b(${anyOf(TO_WORDS)})\\b\\s`));
  if (connector?.index !== undefined) {
    const left = cleanSide(body.slice(0, connector.index));
    const right = cleanSide(body.slice(connector.index + connector[0].length));

    if (left && right) {
      const [fromPick, toPick] = await Promise.all([
        resolve(left, stations, overrides.from),
        resolve(right, stations, overrides.to),
      ]);
      if (fromPick?.candidates) return { intent: "ambiguous", field: "from", query: left, candidates: fromPick.candidates };
      if (toPick?.candidates) return { intent: "ambiguous", field: "to", query: right, candidates: toPick.candidates };
      if (fromPick?.station && toPick?.station) {
        return { intent: "journey", from: fromPick.station, to: toPick.station, when, arriveBy, whenLabel: label };
      }
    }

    // "trains to Ostend" — a destination with no origin is that station's board.
    if (!left && right) {
      const only = await resolve(right, stations, overrides.station);
      if (only?.candidates) return { intent: "ambiguous", field: "station", query: right, candidates: only.candidates };
      if (only?.station) return { intent: "board", station: only.station, direction: boardDirection(text) };
    }
  }

  const single = cleanSide(body);
  if (single) {
    const only = await resolve(single, stations, overrides.station);
    if (only?.candidates) return { intent: "ambiguous", field: "station", query: single, candidates: only.candidates };
    if (only?.station) return { intent: "board", station: only.station, direction: boardDirection(text) };
  }

  if (wantsDisruptions) return { intent: "disruptions" };
  if (trainId) return wantsComposition ? { intent: "composition", trainId } : { intent: "track", trainId };

  return { intent: "unknown", text: raw };
}

function boardDirection(text: string): "departures" | "arrivals" {
  return hasWord(text, ARRIVALS_WORDS) ? "arrivals" : "departures";
}

function stripNoise(text: string): string {
  return text
    .split(" ")
    .filter((w) => w && !NOISE_WORDS.includes(w))
    .join(" ")
    .trim();
}

/** Turn one side of a connector into a bare station phrase. */
function cleanSide(text: string): string {
  return stripLeading(stripNoise(text.trim()), EDGE_WORDS);
}

function stripLeading(text: string, words: string[]): string {
  let out = text.trim();
  for (;;) {
    // `$` matters: in "trains to Ostend" the left side is the bare word
    // "trains", with no trailing space to match.
    const m = out.match(new RegExp(`^(?:${anyOf(words)})(?:\\s+|$)`));
    if (!m) return out.trim();
    out = out.slice(m[0].length);
  }
}

/** Reuses the tools' own resolution rule so both paths agree on what is ambiguous. */
async function resolve(query: string, stations: StationsCache, overrideId?: string): Promise<Resolution> {
  if (!query) return null;
  // The user already answered this one; do not ask again.
  if (overrideId) {
    const chosen = await stations.findById(overrideId);
    if (chosen) return { station: chosen };
  }
  const result = await stations.resolveOne(query);
  if (result.status === "resolved") return { station: result.station };
  if (result.status === "ambiguous") return { candidates: result.candidates };
  return null;
}
