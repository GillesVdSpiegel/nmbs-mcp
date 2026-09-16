import type { ReactNode } from "react";
import { useT } from "../i18n";
import type { Platform, TimeInfo } from "../types";
import { hhmm } from "../format";

export function DelayBadge({ time, canceled }: { time: TimeInfo; canceled?: boolean }) {
  const t = useT();
  if (canceled) return <span className="badge cancel">{t.cancelled}</span>;
  if (time.delayMinutes <= 0) return null;
  return <span className="badge delay">+{time.delayMinutes}</span>;
}

/** Shows the real time, and the scheduled one struck through when they differ. */
export function Time({ time, canceled }: { time: TimeInfo; canceled?: boolean }) {
  const delayed = time.delayMinutes > 0 && time.actual;
  return (
    <span className={`time ${canceled ? "canceled" : ""}`}>
      {delayed ? (
        <>
          <s>{hhmm(time.scheduled)}</s> <b>{hhmm(time.actual)}</b>
        </>
      ) : (
        <b>{hhmm(time.scheduled)}</b>
      )}
    </span>
  );
}

export function PlatformBadge({ platform }: { platform: Platform }) {
  if (!platform.number || platform.number === "?") return <span className="platform unknown">—</span>;
  return <span className={`platform ${platform.changed ? "changed" : ""}`}>{platform.number}</span>;
}

export function TrainPill({ name, type }: { name: string; type?: string }) {
  const cls = (type ?? name.split(" ")[0] ?? "").replace(/[^A-Za-z]/g, "").toLowerCase();
  return <span className={`train-pill t-${cls.slice(0, 2)}`}>{name}</span>;
}

export function Occupancy({ level }: { level?: string }) {
  if (!level || level === "unknown") return null;
  const bars = level === "high" ? 3 : level === "medium" ? 2 : 1;
  return (
    <span className={`occupancy ${level}`} aria-label={level}>
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= bars ? "on" : ""} />
      ))}
    </span>
  );
}

export function CardHeader({ title, meta, aside }: { title: ReactNode; meta?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="card-header">
      <div>
        <div className="card-title">{title}</div>
        {meta && <div className="card-meta">{meta}</div>}
      </div>
      {aside && <div className="card-aside">{aside}</div>}
    </div>
  );
}
