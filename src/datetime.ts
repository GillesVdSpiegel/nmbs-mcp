const BRUSSELS = "Europe/Brussels";

export class DateTimeParseError extends Error {}

const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: BRUSSELS,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function brusselsParts(d: Date): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of partsFormatter.formatToParts(d)) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  return out;
}

/** iRail wants ddmmyy, in Belgian local time. */
export function formatIrailDate(d: Date): string {
  const p = brusselsParts(d);
  return `${p.day}${p.month}${p.year.slice(2)}`;
}

/** iRail wants hhmm (24h), in Belgian local time. */
export function formatIrailTime(d: Date): string {
  const p = brusselsParts(d);
  return `${p.hour === "24" ? "00" : p.hour}${p.minute}`;
}

/**
 * Accepts "now" (or empty) and ISO-8601 date-times. Natural language ("tomorrow
 * morning") is deliberately unsupported — the tool descriptions tell callers to
 * pass ISO-8601 so we never silently guess at an ambiguous date.
 */
export function parseWhen(when: string | undefined, now = new Date()): { date: string; time: string } {
  const raw = (when ?? "now").trim();
  if (raw === "" || raw.toLowerCase() === "now") {
    return { date: formatIrailDate(now), time: formatIrailTime(now) };
  }

  // A bare "2026-09-20T14:30" has no zone; treat it as Belgian local time rather
  // than letting the host machine's timezone decide.
  const naive = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?$/);
  if (naive) {
    const [, y, mo, d, h, mi] = naive;
    return { date: `${d}${mo}${y.slice(2)}`, time: `${h}${mi}` };
  }

  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly;
    return { date: `${d}${mo}${y.slice(2)}`, time: "0000" };
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new DateTimeParseError(
      `Could not understand when="${raw}". Use "now" or an ISO-8601 date-time such as "2026-09-20T14:30".`,
    );
  }
  return { date: formatIrailDate(parsed), time: formatIrailTime(parsed) };
}

/** iRail timestamps are unix seconds (as strings). */
export function unixToIso(seconds: string | number | undefined): string | undefined {
  if (seconds === undefined) return undefined;
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return new Date(n * 1000).toISOString();
}
