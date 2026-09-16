import type { ToolName } from "@server/events";
import { useLanguage } from "../i18n";
import { isAmbiguousStation, isToolFailure, isUnknownStation } from "../types";
import type {
  CompositionPayload,
  DisruptionsPayload,
  FindStationPayload,
  PlanJourneyPayload,
  StationBoardPayload,
  StationRef,
  TrackTrainPayload,
} from "../types";
import { CompositionStrip } from "./CompositionStrip";
import { DisruptionList } from "./DisruptionList";
import { JourneyCard } from "./JourneyCard";
import { StationBoard } from "./StationBoard";
import { StationList } from "./StationList";
import { TrainTimeline } from "./TrainTimeline";

interface Props {
  name: ToolName;
  ok: boolean;
  payload: unknown;
  /** Chat mode continues the conversation with the station's name… */
  onPick?: (text: string) => void;
  /** …while direct mode pins the station to the field that was ambiguous. */
  onPickStation?: (station: StationRef) => void;
}

export function ToolResult({ name, ok, payload, onPick, onPickStation }: Props) {
  const { lang, t } = useLanguage();
  const choose = (s: StationRef) => (onPickStation ? onPickStation(s) : onPick?.(s.names[lang] ?? s.name));

  if (!ok || isToolFailure(payload)) {
    return <div className="card note error">{isToolFailure(payload) ? payload.message : t.lookupFailed}</div>;
  }

  if (isAmbiguousStation(payload)) {
    return <StationList title={t.whichStation(payload.query)} stations={payload.candidates} onPick={choose} />;
  }

  if (isUnknownStation(payload)) {
    return <div className="card note">{payload.message || t.noStationMatch(payload.query)}</div>;
  }

  switch (name) {
    case "find_station": {
      const p = payload as FindStationPayload;
      if (p.matches.length === 0) return <div className="card note">{t.noStationMatch(p.query)}</div>;
      return <StationList title={t.stationsMatching(p.query)} stations={p.matches} onPick={choose} />;
    }
    case "plan_journey":
      return <JourneyCard payload={payload as PlanJourneyPayload} />;
    case "station_board":
      return <StationBoard payload={payload as StationBoardPayload} />;
    case "track_train":
      return <TrainTimeline payload={payload as TrackTrainPayload} />;
    case "check_disruptions":
      return <DisruptionList payload={payload as DisruptionsPayload} />;
    case "train_composition":
      return <CompositionStrip payload={payload as CompositionPayload} />;
  }
}
