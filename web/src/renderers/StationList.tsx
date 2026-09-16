import { useLanguage } from "../i18n";
import type { StationRef } from "../types";
import { CardHeader } from "./shared";

interface Props {
  title: string;
  stations: StationRef[];
  onPick: (station: StationRef) => void;
}

export function StationList({ title, stations, onPick }: Props) {
  const { lang, t } = useLanguage();

  return (
    <div className="card">
      <CardHeader title={title} meta={t.pickOne} />
      <ul className="stations">
        {stations.map((s) => {
          const name = s.names[lang] ?? s.name;
          // iRail's German entry is usually the combined "NL/FR" form, so split
          // on the slash and drop anything already shown as the main name.
          const aliases = [...new Set(Object.values(s.names).flatMap((n) => (n ?? "").split("/")))].filter(
            (n) => n && n.toLowerCase() !== name.toLowerCase() && !name.toLowerCase().includes(n.toLowerCase()),
          );
          return (
            <li key={s.id}>
              <button className="station-row" onClick={() => onPick(s)}>
                <span className="station-name">{name}</span>
                {aliases.length > 0 && <span className="station-alias">{aliases.join(" · ")}</span>}
                <span className="station-id">{s.id.replace("BE.NMBS.", "")}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
