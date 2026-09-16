import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { UiLang } from "@server/events";
import { setFormatLocale } from "../format";
import { en } from "./en";
import type { Translations } from "./en";
import { fr } from "./fr";
import { nl } from "./nl";

const BUNDLES: Record<UiLang, Translations> = { en, nl, fr };
const STORAGE_KEY = "nmbs.lang";

export const LANGUAGES: Array<{ code: UiLang; label: string }> = [
  { code: "en", label: "EN" },
  { code: "nl", label: "NL" },
  { code: "fr", label: "FR" },
];

function initialLang(): UiLang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "nl" || saved === "fr") return saved;
  } catch {
    // private mode or blocked storage — fall through to the browser's own setting
  }
  const nav = navigator.language.toLowerCase();
  if (nav.startsWith("nl")) return "nl";
  if (nav.startsWith("fr")) return "fr";
  return "en";
}

interface LanguageValue {
  lang: UiLang;
  setLang: (lang: UiLang) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<UiLang>(initialLang);

  // Set during render, not in an effect: children format dates on this same
  // pass, and an effect would leave the first render on the old locale.
  setFormatLocale(lang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: UiLang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // not being able to remember the choice is not worth failing over
    }
  }, []);

  const value = useMemo(() => ({ lang, setLang, t: BUNDLES[lang] }), [lang, setLang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside LanguageProvider");
  return ctx;
}

/** Shorthand for components that only need the strings. */
export function useT(): Translations {
  return useLanguage().t;
}
