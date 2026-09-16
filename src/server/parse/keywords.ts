import type { Lang } from "../../irail-types.js";

/** Grammar languages. German station names are still matched; German syntax is not parsed. */
export type QueryLang = Extract<Lang, "en" | "nl" | "fr">;

/**
 * Word lists are pooled across all three languages rather than selected by the
 * UI language: Belgians mix languages in one sentence ("trein naar Liège"), and
 * a Dutch speaker typing "to" should still be understood.
 */
export const TO_WORDS = ["to", "naar", "a", "vers", "jusqu a", "richting"];
export const FROM_WORDS = ["from", "van", "vanuit", "de", "depuis", "vanaf"];

export const ARRIVE_WORDS = ["before", "by", "voor", "tegen", "avant", "arrive", "aankomen", "arriver"];
export const DEPART_WORDS = ["after", "na", "apres", "depart", "vertrek", "leaving", "leave"];

export const ARRIVALS_WORDS = ["arrivals", "arriving", "aankomst", "aankomsten", "arrivees", "arrivee"];
export const DEPARTURES_WORDS = ["departures", "departing", "vertrek", "vertrekken", "departs", "departs"];

export const BOARD_WORDS = [
  "board",
  "trains",
  "treinen",
  "trein",
  "train",
  "next",
  "volgende",
  "prochains",
  "prochain",
  ...ARRIVALS_WORDS,
  ...DEPARTURES_WORDS,
];

export const COMPOSITION_WORDS = [
  "composition",
  "samenstelling",
  "carriages",
  "carriage",
  "rijtuigen",
  "rijtuig",
  "wagons",
  "wagon",
  "voitures",
  "coaches",
  "bike",
  "bikes",
  "fiets",
  "fietsen",
  "velo",
  "velos",
  "seats",
  "zitplaatsen",
  "places",
];

export const DISRUPTION_WORDS = [
  "disruption",
  "disruptions",
  "storing",
  "storingen",
  "hinder",
  "werken",
  "perturbation",
  "perturbations",
  "travaux",
  "greve",
  "greves",
  "strike",
  "strikes",
  "staking",
  "stakingen",
  "delays",
  "problems",
  "problemen",
];

/** Stripped from the edges of a station phrase: "arrivals at Leuven" -> "Leuven". */
export const PREPOSITIONS = ["at", "in", "op", "te", "aan", "aux", "au", "of", "du", "des", "voor", "pour", "for"];

export const TRACK_WORDS = ["track", "where", "waar", "volg", "ou est", "suivre", "follow", "status"];

/** Filler that carries no meaning once intent and stations are known. */
export const NOISE_WORDS = [
  "any",
  "some",
  "there",
  "enige",
  "i",
  "want",
  "need",
  "would",
  "like",
  "please",
  "the",
  "a",
  "an",
  "me",
  "my",
  "show",
  "give",
  "get",
  "take",
  "is",
  "are",
  "what",
  "whats",
  "when",
  "ik",
  "wil",
  "graag",
  "een",
  "de",
  "het",
  "hoe",
  "laat",
  "zien",
  "wat",
  "wanneer",
  "je",
  "veux",
  "voudrais",
  "le",
  "la",
  "les",
  "un",
  "une",
  "montre",
  "quel",
  "quand",
  "est",
];

export const TODAY_WORDS = ["today", "vandaag", "aujourd hui", "aujourdhui"];
export const TOMORROW_WORDS = ["tomorrow", "morgen", "demain"];
export const NOW_WORDS = ["now", "nu", "meteen", "maintenant", "tout de suite"];

/** Index 0 = Monday, matching the order used by the weekday resolver. */
export const WEEKDAYS: string[][] = [
  ["monday", "maandag", "lundi", "mon", "ma", "lun"],
  ["tuesday", "dinsdag", "mardi", "tue", "di", "mar"],
  ["wednesday", "woensdag", "mercredi", "wed", "wo", "mer"],
  ["thursday", "donderdag", "jeudi", "thu", "do", "jeu"],
  ["friday", "vrijdag", "vendredi", "fri", "vr", "ven"],
  ["saturday", "zaterdag", "samedi", "sat", "za", "sam"],
  ["sunday", "zondag", "dimanche", "sun", "zo", "dim"],
];
