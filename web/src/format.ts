import type { UiLang } from "@server/events";

const LOCALES: Record<UiLang, string> = { en: "en-GB", nl: "nl-BE", fr: "fr-BE" };

/**
 * Module-level rather than threaded through every component: the locale is a
 * single app-wide value, and LanguageProvider keeps it in step with the UI
 * language before React re-renders the tree.
 */
let locale = LOCALES.en;

export function setFormatLocale(lang: UiLang): void {
  locale = LOCALES[lang];
}

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(kind: "time" | "dateTime"): Intl.DateTimeFormat {
  const key = `${kind}:${locale}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(
      locale,
      kind === "time"
        ? { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit", hour12: false }
        : {
            timeZone: "Europe/Brussels",
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          },
    );
    cache.set(key, f);
  }
  return f;
}

export function hhmm(iso: string | undefined): string {
  if (!iso) return "--:--";
  return formatter("time").format(new Date(iso));
}

export function dateTime(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : formatter("dateTime").format(d);
}

export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}
