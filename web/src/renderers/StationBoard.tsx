import { useT } from "../i18n";
import type { StationBoardPayload } from "../types";
import { CardHeader, DelayBadge, Occupancy, PlatformBadge, Time, TrainPill } from "./shared";

export function StationBoard({ payload }: { payload: StationBoardPayload }) {
  const t = useT();
  const departures = payload.direction === "departures";

  return (
    <div className="card">
      <CardHeader
        title={payload.station}
        meta={`${departures ? t.departures : t.arrivals} · ${t.nextMinutes(payload.windowMinutes)}`}
        aside={t.trains(payload.count)}
      />

      {payload.entries.length === 0 ? (
        <div className="note">{t.nothingScheduled}</div>
      ) : (
        <div className="board-scroll">
          <table className="board">
            <thead>
              <tr>
                <th>{t.colTime}</th>
                <th>{t.colTrain}</th>
                <th>{departures ? t.colTo : t.colFrom}</th>
                <th className="right">
                  <span className="th-full">{t.colPlatform}</span>
                  <span className="th-short">{t.colPlatformShort}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {payload.entries.map((e, i) => (
                <tr key={i} className={e.canceled ? "canceled" : e.left || e.arrived ? "gone" : ""}>
                  <td className="mono">
                    <Time time={e.time} canceled={e.canceled} />
                    <DelayBadge time={e.time} canceled={e.canceled} />
                  </td>
                  <td>
                    <TrainPill name={e.vehicle.name} type={e.vehicle.type} />
                  </td>
                  <td className="dest">
                    {departures ? e.destination : e.origin}
                    <Occupancy level={e.occupancy} />
                  </td>
                  <td className="right">
                    <PlatformBadge platform={e.platform} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
