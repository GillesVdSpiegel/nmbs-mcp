import { hhmm } from "../format";
import { useT } from "../i18n";
import type { TrackTrainPayload } from "../types";
import { CardHeader, DelayBadge, Occupancy, PlatformBadge, TrainPill } from "./shared";

export function TrainTimeline({ payload }: { payload: TrackTrainPayload }) {
  const t = useT();
  const stops = payload.stops;
  const first = stops[0];
  const last = stops[stops.length - 1];
  const nextIndex = stops.findIndex((s) => !s.left && !s.canceled);

  const meta =
    nextIndex === -1 ? t.journeyCompleted : nextIndex === 0 ? t.notDeparted : t.nextStop(stops[nextIndex].station);

  return (
    <div className="card">
      <CardHeader
        title={
          <>
            <TrainPill name={payload.train.name} type={payload.train.type} />
            {first && last && (
              <span className="route">
                {first.station} <span className="arrow">→</span> {last.station}
              </span>
            )}
          </>
        }
        meta={meta}
        aside={t.stops(payload.stopCount)}
      />

      {stops.length === 0 ? (
        <div className="note">{t.noStopInfo}</div>
      ) : (
        <ol className="timeline">
          {stops.map((s, i) => {
            const isFirst = i === 0;
            const isLast = i === stops.length - 1;
            const state = s.canceled ? "canceled" : s.left ? "passed" : i === nextIndex ? "next" : "upcoming";
            const time = isFirst ? s.departure : s.arrival;
            return (
              <li key={i} className={`tl-stop ${state}`}>
                <span className="tl-rail" aria-hidden="true">
                  <i className="tl-dot" />
                  {!isLast && <i className="tl-line" />}
                </span>
                <span className="tl-time mono">{hhmm(time.actual ?? time.scheduled)}</span>
                <span className="tl-body">
                  <span className="tl-name">
                    {s.station}
                    {s.isExtraStop && <span className="badge extra">{t.extraStop}</span>}
                  </span>
                  <span className="tl-sub">
                    {!isFirst && !isLast && time.delayMinutes > 0 && (
                      <span className="muted">
                        {t.scheduledShort} {hhmm(time.scheduled)}
                      </span>
                    )}
                    {!isLast && !isFirst && s.departure.scheduled && (
                      <span className="muted">
                        {t.departureShort} {hhmm(s.departure.actual ?? s.departure.scheduled)}
                      </span>
                    )}
                    <Occupancy level={s.occupancy} />
                  </span>
                </span>
                <span className="tl-right">
                  <DelayBadge time={time} canceled={s.canceled} />
                  <PlatformBadge platform={s.platform} />
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {payload.alerts?.length ? (
        <div className="alerts">
          {payload.alerts.map((a, i) => (
            <div key={i} className="alert">
              <b>{a.header}</b>
              <span>{a.description}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
