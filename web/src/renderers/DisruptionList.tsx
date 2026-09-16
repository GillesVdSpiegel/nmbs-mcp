import { useState } from "react";
import { dateTime } from "../format";
import { useT } from "../i18n";
import type { Disruption, DisruptionsPayload } from "../types";
import { CardHeader } from "./shared";

export function DisruptionList({ payload }: { payload: DisruptionsPayload }) {
  const t = useT();
  const meta =
    payload.total === 0
      ? t.noDisruptions
      : payload.returned < payload.total
        ? t.showingOf(payload.returned, payload.total)
        : t.activeCount(payload.total);

  return (
    <div className="card">
      <CardHeader title={t.disruptionsTitle} meta={meta} />
      {payload.disruptions.length > 0 && (
        <ul className="disruptions">
          {payload.disruptions.map((d, i) => (
            <DisruptionItem key={i} d={d} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DisruptionItem({ d }: { d: Disruption }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const planned = d.type?.toLowerCase().includes("planned");
  const cause = d.description.match(/(?:cause|oorzaak)\s*:\s*([^\n]+)/i)?.[1];
  const firstLine = d.description.split("\n").find((l) => l.trim()) ?? "";

  return (
    <li className={`disruption ${open ? "open" : ""}`}>
      <button className="disruption-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={`badge ${planned ? "planned" : "live"}`}>{planned ? t.planned : t.live}</span>
        <span className="disruption-title">{d.title}</span>
        <span className="chevron" aria-hidden="true" />
      </button>
      {!open && <div className="disruption-lead">{cause ?? firstLine}</div>}
      {open && (
        <div className="disruption-body">
          <p>{d.description}</p>
          <div className="disruption-foot">
            {d.updatedAt && <span className="muted">{t.updated(dateTime(d.updatedAt))}</span>}
            {d.link && (
              <a href={d.link} target="_blank" rel="noreferrer">
                {t.details} ↗
              </a>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
