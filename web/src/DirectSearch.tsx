import { useEffect, useRef, useState } from "react";
import type { QueryOverrides, QueryResponse } from "@server/events";
import { callTool } from "./api";
import { dateTime } from "./format";
import { useLanguage } from "./i18n";
import { ToolResult } from "./renderers";
import type { StationRef } from "./types";

interface Props {
  /** Hands an unparseable query to the chat mode. */
  onAskAssistant: (text: string) => void;
  /** Increments when the header's disruptions button is pressed. */
  disruptionsRequest: number;
}

export function DirectSearch({ onAskAssistant, disruptionsRequest }: Props) {
  const { lang, t } = useLanguage();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Answers to earlier "which station?" prompts, kept so a second ambiguity in
  // the same sentence does not undo the first.
  const [overrides, setOverrides] = useState<QueryOverrides>({});

  const run = async (query: string, nextOverrides: QueryOverrides) => {
    const trimmed = query.trim();
    if (!trimmed || busy) return;
    setText(trimmed);
    setOverrides(nextOverrides);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, lang, overrides: nextOverrides }),
      });
      if (!response.ok) throw new Error(response.status >= 500 ? t.serverUnreachable : `HTTP ${response.status}`);
      setResult((await response.json()) as QueryResponse);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error && e.message ? e.message : t.serverUnreachable);
    } finally {
      setBusy(false);
    }
  };

  /** A fresh query starts from scratch; earlier answers no longer apply. */
  const search = (query: string) => void run(query, {});

  // Driven by the header button. Calls the tool directly rather than routing a
  // synthetic sentence back through the parser.
  const seenRequest = useRef(disruptionsRequest);
  useEffect(() => {
    if (disruptionsRequest === seenRequest.current) return;
    seenRequest.current = disruptionsRequest;
    setBusy(true);
    setError(null);
    setText("");
    callTool("check_disruptions", {}, lang)
      .then((r) => setResult({ ok: r.ok, tool: r.tool, payload: r.payload, interpretation: { intent: "disruptions" } }))
      .catch(() => setError(t.serverUnreachable))
      .finally(() => setBusy(false));
  }, [disruptionsRequest, lang, t]);

  /**
   * Re-runs the same sentence with this station pinned to the field that was
   * ambiguous — replacing the query with the station name alone would throw
   * away the destination and the time.
   */
  const pick = (station: StationRef) => {
    const field = result?.interpretation.field ?? "station";
    void run(text, { ...overrides, [field]: station.id });
  };

  return (
    <div className="direct">
      <div className="direct-inner">
        <h1>{t.directTitle}</h1>
        <p className="direct-body">{t.directBody}</p>

        <form
          className="direct-form"
          onSubmit={(e) => {
            e.preventDefault();
            search(text);
          }}
        >
          <input
            type="text"
            value={text}
            placeholder={t.directPlaceholder}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
          <button type="submit" disabled={busy || !text.trim()}>
            {t.search}
          </button>
        </form>

        <div className="examples">
          {t.directExamples.map((ex) => (
            <button key={ex} className="example" onClick={() => search(ex)}>
              {ex}
            </button>
          ))}
        </div>

        {error && <div className="error-note">{error}</div>}

        {result && (
          <div className="direct-result">
            {result.unparsed !== undefined ? (
              <div className="card unparsed">
                <div className="unparsed-title">{t.notUnderstood}</div>
                <div className="unparsed-body">{t.tryExamples}</div>
                <button className="primary" onClick={() => onAskAssistant(result.unparsed!)}>
                  {t.askAssistant} ↗
                </button>
              </div>
            ) : (
              <>
                <div className="interpretation">
                  <span className="muted">{t.understood}</span> {describe(result, t)}
                </div>
                {result.tool && (
                  <ToolResult name={result.tool} ok={result.ok} payload={result.payload} onPickStation={pick} />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** One line echoing what the parser understood, so a misreading is visible. */
function describe(result: QueryResponse, t: ReturnType<typeof useLanguage>["t"]): string {
  const i = result.interpretation;
  switch (i.intent) {
    case "journey": {
      const when = i.when
        ? i.direction === "arrive"
          ? t.arrivingBy(dateTime(i.when))
          : t.leaving(dateTime(i.when))
        : t.leavingNow;
      return `${t.journey}: ${i.from} → ${i.to} · ${when}`;
    }
    case "board":
      return `${i.direction === "arrivals" ? t.arrivals : t.departures}: ${i.station}`;
    case "track":
      return `${t.toolDone.track_train}: ${i.trainId}`;
    case "composition":
      return `${t.toolDone.train_composition}: ${i.trainId}`;
    case "disruptions":
      return t.disruptionsTitle;
    case "ambiguous":
      return t.whichStation(i.station ?? "");
    default:
      return "";
  }
}
