import { useState } from "react";
import { callTool } from "../api";
import { dateTime, duration, hhmm } from "../format";
import { useLanguage, useT } from "../i18n";
import type { CompositionPayload, Journey, Leg, PlanJourneyPayload, Platform } from "../types";
import { CompositionStrip } from "./CompositionStrip";
import { CardHeader, DelayBadge, Occupancy, PlatformBadge, Time, TrainPill } from "./shared";

export function JourneyCard({ payload }: { payload: PlanJourneyPayload }) {
  const t = useT();
  const [showAll, setShowAll] = useState(false);
  const journeys = showAll ? payload.journeys : payload.journeys.slice(0, 3);

  // `when` is either the literal "now" or an ISO wall-clock the parser produced.
  const whenLabel = payload.when === "now" ? null : dateTime(payload.when);
  const meta = whenLabel === null ? t.leavingNow : payload.arriveBy ? t.arrivingBy(whenLabel) : t.leaving(whenLabel);

  return (
    <div className="card">
      <CardHeader
        title={
          <>
            {payload.from.name} <span className="arrow">→</span> {payload.to.name}
          </>
        }
        meta={meta}
        aside={t.options(payload.count)}
      />

      {payload.journeys.length === 0 ? (
        <div className="note">{t.noConnections}</div>
      ) : (
        <div className="journeys">
          {journeys.map((j, i) => (
            <JourneyRow key={i} journey={j} defaultOpen={i === 0} />
          ))}
        </div>
      )}

      {payload.journeys.length > 3 && (
        <button className="link" onClick={() => setShowAll((v) => !v)}>
          {showAll ? t.showFewer : t.showMore(payload.journeys.length - 3)}
        </button>
      )}
    </div>
  );
}

function JourneyRow({ journey, defaultOpen }: { journey: Journey; defaultOpen: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);
  const dep = journey.departure;
  const arr = journey.arrival;
  const canceled = dep.canceled || arr.canceled;

  return (
    <div className={`journey ${open ? "open" : ""} ${canceled ? "canceled" : ""}`}>
      <button className="journey-summary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <div className="journey-times">
          <Time time={dep.time} canceled={dep.canceled} />
          <span className="arrow">→</span>
          <Time time={arr.time} canceled={arr.canceled} />
        </div>
        <div className="journey-meta">
          <span>{duration(journey.durationMinutes)}</span>
          <span className="sep" />
          <span>{journey.transfers === 0 ? t.direct : t.changes(journey.transfers)}</span>
          <DelayBadge time={dep.time} canceled={canceled} />
        </div>
        <div className="journey-trains">
          {journey.legs.map((leg, i) => (
            <TrainPill key={i} name={leg.vehicle.name} type={leg.vehicle.type} />
          ))}
        </div>
        <span className="chevron" aria-hidden="true" />
      </button>

      {open && (
        <div className="legs">
          {journey.legs.map((leg, i) => (
            <LegView key={i} leg={leg} arrivedOn={i > 0 ? journey.legs[i - 1].to.platform : undefined} />
          ))}
          {journey.alerts?.length ? (
            <div className="alerts">
              {journey.alerts.map((a, i) => (
                <div key={i} className="alert">
                  <b>{a.header}</b>
                  <span>{a.description}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function LegView({ leg, arrivedOn }: { leg: Leg; arrivedOn?: Platform }) {
  const t = useT();
  const tight = leg.transferMinutes !== undefined && leg.transferMinutes <= 3;

  return (
    <div className="leg">
      {leg.transferMinutes !== undefined && (
        <div className={`transfer ${tight ? "tight" : ""}`}>
          <span className="transfer-line" aria-hidden="true" />
          <span>
            {t.minToChange(leg.transferMinutes)}
            {tight && ` — ${t.tight}`}
            {platformChange(arrivedOn, leg.from.platform, t.platformShort)}
          </span>
        </div>
      )}
      <div className="leg-body">
        <div className="leg-rail" aria-hidden="true">
          <i className="stop-dot" />
          <i className="stop-line" />
          <i className="stop-dot end" />
        </div>
        <div className="leg-stops">
          <div className="stop-row">
            <span className="stop-time">{hhmm(leg.from.time.actual ?? leg.from.time.scheduled)}</span>
            <span className="stop-name">{leg.from.station}</span>
            <PlatformBadge platform={leg.from.platform} />
          </div>
          <div className="leg-train">
            <TrainPill name={leg.vehicle.name} type={leg.vehicle.type} />
            {leg.direction && <span className="muted">{t.towards(leg.direction)}</span>}
            <Occupancy level={leg.occupancy} />
            <DelayBadge time={leg.from.time} canceled={leg.from.canceled} />
            <Carriages trainId={leg.vehicle.id} />
          </div>
          <div className="stop-row">
            <span className="stop-time">{hhmm(leg.to.time.actual ?? leg.to.time.scheduled)}</span>
            <span className="stop-name">{leg.to.station}</span>
            <PlatformBadge platform={leg.to.platform} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Fetches the composition for one leg on demand. It calls the tool directly
 * rather than going through the model, so expanding a train costs nothing and
 * works even without an API key.
 */
function Carriages({ trainId }: { trainId: string }) {
  const { lang, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<CompositionPayload | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  const toggle = async () => {
    if (open) return setOpen(false);
    setOpen(true);
    if (payload || state === "loading") return;
    setState("loading");
    try {
      const result = await callTool("train_composition", { train_id: trainId }, lang);
      setPayload(result.payload as CompositionPayload);
      setState("idle");
    } catch {
      setState("error");
    }
  };

  return (
    <>
      <button className="leg-action" onClick={() => void toggle()} aria-expanded={open}>
        {open ? t.hideCarriages : t.showCarriages}
      </button>
      {open && (
        <div className="leg-carriages">
          {state === "loading" && <div className="muted">{t.loadingCarriages}</div>}
          {state === "error" && <div className="note error">{t.lookupFailed}</div>}
          {payload && <CompositionStrip payload={payload} />}
        </div>
      )}
    </>
  );
}

function platformChange(arrivedOn: Platform | undefined, departFrom: Platform, label: (p: string) => string): string {
  const a = arrivedOn?.number && arrivedOn.number !== "?" ? arrivedOn.number : undefined;
  const d = departFrom.number !== "?" ? departFrom.number : undefined;
  if (a && d && a !== d) return ` · ${label(`${a} → ${d}`)}`;
  if (d) return ` · ${label(d)}`;
  return "";
}
