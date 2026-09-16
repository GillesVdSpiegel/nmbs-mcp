/**
 * The SSE contract between the chat backend and the browser. The front end
 * imports this type-only, so the two sides cannot drift.
 */

export type ToolName =
  | "find_station"
  | "plan_journey"
  | "station_board"
  | "track_train"
  | "check_disruptions"
  | "train_composition";

export type ChatEvent =
  | { type: "text"; delta: string }
  | { type: "tool_start"; id: string; name: ToolName }
  | { type: "tool_end"; id: string; name: ToolName; input: Record<string, unknown>; ok: boolean; payload: unknown }
  | { type: "done"; usage: { input: number; output: number } }
  | { type: "error"; message: string };

/** UI and content language. German station names still match; the UI has no German. */
export type UiLang = "en" | "nl" | "fr";

export interface ChatRequest {
  sessionId: string;
  message: string;
  lang: UiLang;
}

/** Station ids chosen by the user after an ambiguous match, keyed by the field they settle. */
export type QueryOverrides = Partial<Record<"from" | "to" | "station", string>>;

export interface QueryRequest {
  query: string;
  lang: UiLang;
  overrides?: QueryOverrides;
}

export interface QueryResponse {
  ok: boolean;
  interpretation: {
    intent: string;
    from?: string;
    to?: string;
    station?: string;
    trainId?: string;
    when?: string;
    direction?: string;
    /** Which field was ambiguous, so a pick can be sent back as an override. */
    field?: "from" | "to" | "station";
  };
  tool?: ToolName;
  payload?: unknown;
  unparsed?: string;
}
