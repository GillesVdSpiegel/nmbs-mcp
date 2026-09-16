import type { ToolName } from "@server/events";
import { useT } from "../i18n";

interface Props {
  name: ToolName;
  status: "running" | "done" | "error";
  input?: Record<string, unknown>;
}

export function ToolChip({ name, status, input }: Props) {
  const t = useT();
  const detail = describe(name, input);
  return (
    <span className={`chip ${status}`}>
      {status === "running" ? (
        <span className="spinner" aria-hidden="true" />
      ) : (
        <span className={`dot ${status}`} aria-hidden="true" />
      )}
      <span>{status === "running" ? t.toolRunning[name] : t.toolDone[name]}</span>
      {detail && <span className="chip-detail">{detail}</span>}
    </span>
  );
}

function describe(name: ToolName, input?: Record<string, unknown>): string | undefined {
  if (!input) return undefined;
  const s = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : undefined);
  switch (name) {
    case "find_station":
      return s("query");
    case "plan_journey":
      return s("from") && s("to") ? `${s("from")} → ${s("to")}` : undefined;
    case "station_board":
      return s("station");
    case "track_train":
    case "train_composition":
      return s("train_id");
    case "check_disruptions":
      return undefined;
  }
}
