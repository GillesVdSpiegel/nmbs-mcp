import type { ToolName } from "@server/events";
import type { Message, Part } from "./App";
import fixtures from "./demo-fixtures.json";

/**
 * Dev-only: open the app with `?demo` to see every card rendered from real
 * iRail data without spending model tokens. Dropped from production bundles.
 */
export function demoMessages(): Message[] {
  const tool = (name: ToolName, fixture: { input: unknown; payload: unknown }): Part => ({
    kind: "tool",
    id: `demo-${name}`,
    name,
    status: "done",
    input: fixture.input as Record<string, unknown>,
    payload: fixture.payload,
  });
  const text = (t: string): Part => ({ kind: "text", text: t });

  return [
    { id: "u1", role: "user", text: "What's leaving Leuven soon, and how do I get to Ostend?" },
    {
      id: "a1",
      role: "assistant",
      streaming: false,
      parts: [
        tool("station_board", fixtures.station_board),
        tool("plan_journey", fixtures.plan_journey),
        text("The first option is direct and leaves from the platform shown. Keep an eye on the delay badge — it reflects the live position of the train right now."),
      ],
    },
    { id: "u2", role: "user", text: "Track that first train and show me its carriages — I have a bike." },
    {
      id: "a2",
      role: "assistant",
      streaming: false,
      parts: [
        tool("track_train", fixtures.track_train),
        tool("train_composition", fixtures.train_composition),
        text("Bike spaces are marked on the carriage strip. Stand near that carriage's position on the platform — the numbering runs from the front of the train."),
      ],
    },
    { id: "u3", role: "user", text: "Any disruptions I should know about? And which Brussels stations are there?" },
    {
      id: "a3",
      role: "assistant",
      streaming: false,
      parts: [
        tool("check_disruptions", fixtures.check_disruptions),
        tool("find_station", fixtures.find_station),
        text("Nothing on your route is affected. Brussels has several stations — pick one above if you want a board for it."),
      ],
    },
  ];
}
