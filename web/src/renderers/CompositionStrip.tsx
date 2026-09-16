import { useT } from "../i18n";
import type { CompositionPayload, Unit } from "../types";
import { CardHeader } from "./shared";

export function CompositionStrip({ payload }: { payload: CompositionPayload }) {
  const t = useT();

  if (payload.segments.length === 0) {
    return (
      <div className="card">
        <CardHeader title={t.train(payload.train)} />
        <div className="note">{payload.message ?? t.noComposition}</div>
      </div>
    );
  }

  return (
    <div className="card">
      {payload.segments.map((seg, i) => (
        <div key={i} className="segment">
          <CardHeader
            title={
              <>
                {t.train(payload.train)}
                {seg.origin && seg.destination && (
                  <span className="route">
                    {seg.origin} <span className="arrow">→</span> {seg.destination}
                  </span>
                )}
              </>
            }
            meta={t.carriagesSummary(
              seg.carriageCount,
              seg.totals.lengthMeters,
              seg.totals.seatsSecondClass,
              seg.totals.seatsFirstClass,
            )}
          />

          <div className="strip-scroll">
            <div className="strip">
              {seg.units.map((u) => (
                <Carriage key={u.position} unit={u} />
              ))}
            </div>
          </div>

          <div className="legend">
            <span className="legend-item">
              <i className="swatch first" /> {t.firstClass}
            </span>
            <span className="legend-item">
              <i className="swatch second" /> {t.secondClass}
            </span>
            <span className="legend-item">
              <i className="swatch loco" /> {t.locomotive}
            </span>
            {seg.totals.bikeSections > 0 && (
              <span className="legend-item">
                <BikeIcon /> {t.bikesIn(seg.totals.bikeSections)}
              </span>
            )}
            {seg.totals.prmSections > 0 && (
              <span className="legend-item">
                <WheelchairIcon /> {t.prmSpace}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Carriage({ unit }: { unit: Unit }) {
  const t = useT();
  const seats = unit.seatsFirstClass + unit.seatsSecondClass;
  const isLoco = seats === 0 && unit.tractionType?.startsWith("HLE");
  const cls = isLoco
    ? "loco"
    : unit.seatsFirstClass > 0 && unit.seatsSecondClass > 0
      ? "mixed"
      : unit.seatsFirstClass > 0
        ? "first"
        : "second";

  return (
    <div className={`carriage ${cls}`} title={`${unit.materialType}${unit.materialNumber ? ` · ${unit.materialNumber}` : ""}`}>
      <div className="car-top">
        <span className="car-pos">{unit.position}</span>
        <span className="car-class">
          {isLoco ? "LOCO" : unit.seatsFirstClass > 0 && unit.seatsSecondClass > 0 ? "1 · 2" : unit.seatsFirstClass > 0 ? "1" : "2"}
        </span>
      </div>
      <div className="car-seats">{isLoco ? unit.materialType : t.seats(seats)}</div>
      <div className="car-icons">
        {unit.hasBikeSection && <BikeIcon />}
        {unit.hasPrmSection && <WheelchairIcon />}
        {unit.hasToilets && <ToiletIcon />}
        {unit.hasPowerOutlets && <PlugIcon />}
      </div>
    </div>
  );
}

export function BikeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5.5" cy="17.5" r="3.5" />
      <circle cx="18.5" cy="17.5" r="3.5" />
      <path d="M15 6h-3l-4 6h7l3.5 5.5M12 6l2 5.5M9 6h3" />
    </svg>
  );
}

export function WheelchairIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="4" r="1.5" />
      <path d="M11 7v6h5l3 6M6 12a5 5 0 1 0 8 4" />
    </svg>
  );
}

function ToiletIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 4h6v9H5zM5 13c0 4 2 6 5 6h5c3 0 4-2 4-5v-1H5" />
    </svg>
  );
}

function PlugIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0zM12 16v5" />
    </svg>
  );
}
