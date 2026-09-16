import { ARRIVE_WORDS, NOW_WORDS, TODAY_WORDS, TOMORROW_WORDS, WEEKDAYS } from "./keywords.js";

export interface WhenResult {
  /** ISO-8601 local wall-clock, or undefined for "now". */
  when?: string;
  arriveBy: boolean;
  /** The query with every time expression removed. */
  rest: string;
  /** Human-readable echo of what was understood, for the interpretation line. */
  label?: string;
}

const brussels = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Brussels",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

function todayInBrussels(now: Date): { y: number; m: number; d: number; weekday: number } {
  const parts: Record<string, string> = {};
  for (const p of brussels.formatToParts(now)) if (p.type !== "literal") parts[p.type] = p.value;
  const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    weekday: order.indexOf(parts.weekday),
  };
}

const iso = (y: number, m: number, d: number, hh: number, mm: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;

function addDays(y: number, m: number, d: number, days: number) {
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

const anyOf = (words: string[]) => words.map((w) => w.replace(/ /g, "\\s+")).join("|");

/**
 * Pulls date and time out of an already-normalised query and returns the
 * remainder. Runs before station and train-id extraction so that "14u30" is
 * never mistaken for train 30.
 */
export function extractWhen(text: string, now = new Date()): WhenResult {
  let rest = ` ${text} `;
  let arriveBy = false;
  const labels: string[] = [];

  const take = (re: RegExp, onMatch: (m: RegExpMatchArray) => void): boolean => {
    const m = rest.match(re);
    if (!m) return false;
    onMatch(m);
    rest = rest.replace(re, " ");
    return true;
  };

  // "before 9" / "tegen 9u" / "avant 14h30" — the arrival cue must be read
  // before the bare-time pattern below would consume the number.
  const arriveRe = new RegExp(`\\b(?:${anyOf(ARRIVE_WORDS)})\\s+(\\d{1,2})(?:[:.hu](\\d{2}))?\\b`);
  let hour: number | undefined;
  let minute = 0;

  if (
    take(arriveRe, (m) => {
      arriveBy = true;
      hour = Number(m[1]);
      minute = Number(m[2] ?? 0);
    })
  ) {
    labels.push("arrive by");
  } else if (new RegExp(`\\b(?:${anyOf(ARRIVE_WORDS)})\\b`).test(rest)) {
    arriveBy = true;
    rest = rest.replace(new RegExp(`\\b(?:${anyOf(ARRIVE_WORDS)})\\b`, "g"), " ");
    labels.push("arrive by");
  }

  // "at 14:00" / "om 14u30" / "à 14h30" / bare "14:00"; also bare "14u".
  if (hour === undefined) {
    take(/\b(?:at|om|a|around|rond|vers)?\s*(\d{1,2})[:.hu](\d{2})\b/, (m) => {
      hour = Number(m[1]);
      minute = Number(m[2]);
    });
  }
  if (hour === undefined) {
    take(/\b(?:at|om|a|around|rond|vers)\s+(\d{1,2})\s*(?:h|u|uur|hours?)?\b/, (m) => {
      hour = Number(m[1]);
    });
  }
  if (hour === undefined) {
    take(/\b(\d{1,2})\s*(?:h|u|uur)\b/, (m) => {
      hour = Number(m[1]);
    });
  }

  // "in 20 minutes" / "over 2 uur" / "dans 30 minutes"
  let relativeMinutes: number | undefined;
  take(/\b(?:in|over|binnen|dans)\s+(\d{1,3})\s*(min|minute|minutes|minuten|m)\b/, (m) => {
    relativeMinutes = Number(m[1]);
  });
  take(/\b(?:in|over|binnen|dans)\s+(\d{1,2})\s*(h|hour|hours|uur|heure|heures)\b/, (m) => {
    relativeMinutes = Number(m[1]) * 60;
  });

  const today = todayInBrussels(now);
  let date = { y: today.y, m: today.m, d: today.d };
  let dayLabel: string | undefined;

  if (take(new RegExp(`\\b(?:${anyOf(TOMORROW_WORDS)})\\b`), () => {})) {
    date = addDays(date.y, date.m, date.d, 1);
    dayLabel = "tomorrow";
  } else if (take(new RegExp(`\\b(?:${anyOf(TODAY_WORDS)})\\b`), () => {})) {
    dayLabel = "today";
  } else {
    for (let i = 0; i < WEEKDAYS.length; i++) {
      // Short forms like "ma"/"di" are real words in Dutch; require >=3 chars.
      const names = WEEKDAYS[i].filter((w) => w.length >= 3);
      if (take(new RegExp(`\\b(?:${anyOf(names)})\\b`), () => {})) {
        const ahead = (i - today.weekday + 7) % 7 || 7;
        date = addDays(date.y, date.m, date.d, ahead);
        dayLabel = WEEKDAYS[i][0];
        break;
      }
    }
  }

  take(new RegExp(`\\b(?:${anyOf(NOW_WORDS)})\\b`), () => {});

  rest = rest.replace(/\s+/g, " ").trim();

  if (relativeMinutes !== undefined) {
    const at = new Date(now.getTime() + relativeMinutes * 60_000);
    const p = todayInBrussels(at);
    const hhmm = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Brussels",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(at);
    const [h, mi] = hhmm.split(":").map(Number);
    return { when: iso(p.y, p.m, p.d, h, mi), arriveBy, rest, label: `in ${relativeMinutes} min` };
  }

  if (hour === undefined && dayLabel === undefined) {
    return { arriveBy, rest, label: arriveBy ? labels.join(" ") : undefined };
  }

  // A day without a time means the whole day; start at 00:00 so nothing is missed.
  const when = iso(date.y, date.m, date.d, hour ?? 0, minute);
  const timeLabel = hour === undefined ? "" : ` ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const label = `${arriveBy ? "arrive by " : ""}${dayLabel ?? "today"}${timeLabel}`.trim();

  return { when, arriveBy, rest, label };
}
