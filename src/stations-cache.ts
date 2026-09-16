import type { IrailClient } from "./irail-client.js";
import type { Lang } from "./irail-types.js";

export interface Station {
  id: string;
  name: string;
  standardName: string;
  names: Partial<Record<Lang, string>>;
  latitude: number;
  longitude: number;
}

export interface ScoredStation extends Station {
  score: number;
}

export type ResolveResult =
  | { status: "resolved"; station: Station }
  | { status: "ambiguous"; candidates: ScoredStation[] }
  | { status: "not_found" };

const LANGS: Lang[] = ["nl", "fr", "en", "de"];
const ALL_LANGS_TTL_MS = 24 * 60 * 60 * 1000;

/** A match resolves only if it both scores well and clearly beats the runner-up. */
export const RESOLVE_SCORE = 88;
export const RESOLVE_MARGIN = 10;
/** Losers to a principal-station match land here: usable as candidates, never a winner. */
const DEMOTED_SCORE = RESOLVE_SCORE - RESOLVE_MARGIN - 2;
/** Weaker than this is noise, not a station the user might have meant. */
const CANDIDATE_SCORE = 70;

/**
 * Prefix scoring alone favours the shortest name, so a bare city name loses to
 * a minor suburban stop: "Gent" scores higher against "Gentbrugge" than against
 * "Gent-Sint-Pieters". For cities where everyday speech means one specific
 * station, name that station. Brussels is deliberately absent — locals do
 * distinguish its stations, so "Brussel" should stay ambiguous.
 */
const PRINCIPAL_STATION: Record<string, string> = {
  gent: "gent sint pieters",
  ghent: "gent sint pieters",
  gand: "gent sint pieters",
  antwerpen: "antwerpen centraal",
  antwerp: "antwerpen centraal",
  anvers: "antwerpen centraal",
  liege: "liege guillemins",
  luik: "liege guillemins",
  luttich: "liege guillemins",
  charleroi: "charleroi central",
  bergen: "mons",
  namen: "namur",
  leuven: "leuven",
  louvain: "leuven",
  brugge: "brugge",
  bruges: "brugge",
  oostende: "oostende",
  ostende: "oostende",
  ostend: "oostende",
  mechelen: "mechelen",
  malines: "mechelen",
  kortrijk: "kortrijk",
  courtrai: "kortrijk",
  hasselt: "hasselt",
  leuvain: "leuven",
};

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = curr;
  }
  return prev[b.length];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-word containment: without it "Ede" matches inside "goede". */
function containsWord(haystack: string, needle: string): boolean {
  return new RegExp(`(?:^| )${escapeRe(needle)}(?: |$)`).test(haystack);
}

function scoreAlias(query: string, alias: string): number {
  if (alias === query) return 100;
  if (alias.startsWith(query)) return 88 + (query.length / alias.length) * 7;
  if (containsWord(alias, query)) return 78 + (query.length / alias.length) * 7;
  if (containsWord(query, alias)) return 74 + (alias.length / query.length) * 7;

  // Match on individual words so "sint pieters" finds "Gent-Sint-Pieters".
  const aliasWords = alias.split(" ");
  const queryWords = query.split(" ");
  if (queryWords.length > 0 && queryWords.every((qw) => aliasWords.some((aw) => aw.startsWith(qw)))) {
    return 70 + (query.length / alias.length) * 5;
  }

  const distance = levenshtein(query, alias);
  const similarity = 1 - distance / Math.max(query.length, alias.length);
  return similarity > 0.6 ? similarity * 68 : 0;
}

export class StationsCache {
  private stations: Station[] = [];
  private aliases = new Map<string, string[]>();
  private byNumber = new Map<string, Station>();
  private fetchedAt = 0;
  private inflight: Promise<void> | null = null;

  constructor(
    private readonly client: IrailClient,
    private readonly ttlMs = ALL_LANGS_TTL_MS,
  ) {}

  async getAll(): Promise<Station[]> {
    await this.ensureLoaded();
    return this.stations;
  }

  async search(query: string, limit = 8): Promise<ScoredStation[]> {
    await this.ensureLoaded();
    const q = normalize(query);
    if (q === "") return [];

    const principal = PRINCIPAL_STATION[q];
    const scored: ScoredStation[] = [];
    for (const station of this.stations) {
      const aliases = this.aliases.get(station.id) ?? [];
      let best = 0;
      for (const alias of aliases) {
        best = Math.max(best, scoreAlias(q, alias));
        if (best === 100) break;
      }
      if (best > 0 && principal !== undefined) {
        // Demote the rest so the known answer wins by more than the margin;
        // "Gent" must not be a coin-toss between Sint-Pieters and Gentbrugge.
        best = aliases.includes(principal) ? 100 : Math.min(best, DEMOTED_SCORE);
      }
      if (best > 0) scored.push({ ...station, score: Math.round(best) });
    }

    return scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
  }

  /**
   * Used by the journey/board tools: only auto-picks when one station clearly
   * wins, so "Brussel" surfaces a choice instead of silently picking a station.
   */
  async resolveOne(query: string): Promise<ResolveResult> {
    // The tools accept an id as well as a name, and an id will never fuzzy-match
    // a name — look it up directly before falling through to the text search.
    const byId = await this.findById(query);
    if (byId) return { status: "resolved", station: byId };

    // Offering a weak fuzzy hit as a candidate is worse than admitting defeat:
    // it turns "where can I eat a waffle" into a station picker.
    const matches = (await this.search(query, 5)).filter((m) => m.score >= CANDIDATE_SCORE);
    if (matches.length === 0) return { status: "not_found" };

    const [top, runnerUp] = matches;
    if (top.score >= RESOLVE_SCORE && (runnerUp === undefined || top.score - runnerUp.score >= RESOLVE_MARGIN)) {
      return { status: "resolved", station: top };
    }
    return { status: "ambiguous", candidates: matches };
  }

  /** Accepts "BE.NMBS.008833001", the full irail.be URI, or the bare number. */
  async findById(raw: string): Promise<Station | undefined> {
    const digits = raw.trim().match(/(\d{7,9})$/)?.[1];
    if (!digits) return undefined;
    await this.ensureLoaded();
    return this.byNumber.get(digits);
  }

  private async ensureLoaded(): Promise<void> {
    if (this.stations.length > 0 && Date.now() - this.fetchedAt < this.ttlMs) return;
    this.inflight ??= this.load().finally(() => {
      this.inflight = null;
    });
    await this.inflight;
  }

  private async load(): Promise<void> {
    const byId = new Map<string, Station>();
    const aliases = new Map<string, Set<string>>();

    // iRail only returns names in the requested language, so a station is only
    // findable as "Bruxelles-Midi" if we also fetched the French list.
    const responses = await Promise.all(LANGS.map((lang) => this.client.getStations(lang).then((r) => [lang, r] as const)));

    for (const [lang, response] of responses) {
      for (const raw of response.station ?? []) {
        const existing = byId.get(raw.id);
        const station: Station = existing ?? {
          id: raw.id,
          name: raw.name,
          standardName: raw.standardname,
          names: {},
          latitude: Number(raw.locationY),
          longitude: Number(raw.locationX),
        };
        station.names[lang] = raw.name;
        if (lang === "en") station.name = raw.name;
        byId.set(raw.id, station);

        const set = aliases.get(raw.id) ?? new Set<string>();
        // "Brussel-Zuid/Bruxelles-Midi" is really two searchable names.
        for (const candidate of [raw.name, raw.standardname]) {
          for (const part of candidate.split("/")) {
            const n = normalize(part);
            if (n !== "") set.add(n);
          }
        }
        aliases.set(raw.id, set);
      }
    }

    this.stations = [...byId.values()];
    this.aliases = new Map([...aliases].map(([id, set]) => [id, [...set]]));
    this.byNumber = new Map(
      this.stations.flatMap((s) => {
        const digits = s.id.match(/(\d{7,9})$/)?.[1];
        return digits ? [[digits, s] as const] : [];
      }),
    );
    this.fetchedAt = Date.now();
  }
}

/** The station's name in the requested language, falling back to the English one. */
export function displayName(s: Station, lang: Lang): string {
  return s.names[lang] ?? s.name;
}

export function publicStation(s: Station | ScoredStation) {
  return {
    id: s.id,
    name: s.name,
    standardName: s.standardName,
    names: s.names,
    latitude: s.latitude,
    longitude: s.longitude,
    ...("score" in s ? { score: s.score } : {}),
  };
}
