# NMBS MCP

Belgian train travel (NMBS/SNCB) as six tools over the community-run [iRail API](https://docs.irail.be/) — usable three ways: as an MCP server inside Claude, as a chat web app, and as a no-AI search page that parses queries with rules.

No API key is needed. iRail allows roughly 3 requests/second; the server throttles itself to stay within that.

## Tools

| Tool | What it does |
|---|---|
| `find_station(query, limit?)` | Fuzzy station search across Dutch, French, English and German names — `Brussel-Zuid`, `Bruxelles-Midi` and `Brussels-South` all find the same station. Returns the station ids the other tools accept unambiguously. |
| `plan_journey(from, to, when?, arrive_by?)` | Journey planning with real-time delays, platforms, transfers and service alerts. |
| `station_board(station, direction?, window_minutes?)` | Live departure or arrival board for a station, limited to the next `window_minutes` (default 60). |
| `track_train(train_id, date?)` | Stop-by-stop progress of one train run, with per-stop delays and platforms. |
| `check_disruptions(lang?, limit?)` | Current and planned disruptions on the network. |
| `train_composition(train_id)` | The physical makeup of a train: carriages in order, seats per class, toilets, bike and reduced-mobility sections. |

### Input conventions

- **Stations** accept a name (fuzzy-matched) or an id such as `BE.NMBS.008813003`. If a name is ambiguous, the tool returns the candidate list rather than guessing — call it again with an id or a fuller name.
- **Times** (`when`) accept `"now"` (default) or ISO-8601 in Belgian local time, e.g. `2026-09-20T14:30`. Natural language like "tomorrow morning" is not parsed — convert it first.
- **Train ids** accept either `IC513` or `BE.NMBS.IC513`. The most reliable ids come from `station_board` or `plan_journey` output rather than from memory.

## Setup

```bash
npm install
npm run build
```

## Register with an MCP client

Point the client at the built entrypoint with an absolute path (more reliable on Windows than relying on `npx` resolution in the client's spawn environment):

```json
{
  "mcpServers": {
    "nmbs": {
      "command": "node",
      "args": ["C:\\claude\\MCP\\dist\\index.js"]
    }
  }
}
```

In Claude Code you can add it with:

```bash
claude mcp add nmbs -- node C:\claude\MCP\dist\index.js
```

## Web app

The same six tools power a web app with two modes, switchable from the header:

- **Assistant** — ask in plain language ("I need to be in Bruges before 9 tomorrow, with my bike"). Claude orchestrates the tools and the page renders each result as a card. Costs API credit.
- **Direct** — typed queries parsed by rules, no model involved. `Leuven to Ghent tomorrow at 14:00`, `van Leuven naar Oostende`, `arrivées à Namur`, `carriages of IC 513`, `storingen`. Free, instant, and it works when the API is out of credit. A query it can't read offers to hand itself to the assistant.

Both render the same cards, because direct mode calls the same tools and produces the same payloads.

The UI, the iRail content (station names, disruption text) and the assistant's reply language all follow one **EN / NL / FR toggle** in the header. The query grammar accepts all three regardless of the toggle, since Belgians mix languages in a single sentence.

```
src/server/         Hono backend
  agent.ts          wraps the MCP tools for the Anthropic SDK's tool runner (POST /api/chat, SSE)
  query.ts          the no-model path (POST /api/query, plain JSON)
  parse/            the lexical parser: keywords, time extraction, intent selection
web/                Vite + React front end, one renderer per tool, i18n bundles
```

Setup: put your key in a gitignored `.env` at the repo root, then run both halves.

```bash
echo ANTHROPIC_API_KEY=sk-ant-... > .env
npm run dev:server    # http://localhost:8787
npm run dev:web       # http://localhost:5173, proxies /api to the server
```

If the API answers `400 … must include the anthropic-workspace-id header`, your key is an org-level key rather than a workspace-scoped one: either create a workspace-scoped key in the Anthropic Console, or add `ANTHROPIC_WORKSPACE_ID=<workspace id>` to `.env` (Console → Settings → Workspaces).

For production, `npm run build && npm run build:web && npm run start:web` serves the built app and the API from one process on port 8787.

Direct mode needs no API key at all — only the assistant does. Open `http://localhost:5173/?mode=direct` to go straight there, or `?demo` (dev only) to see every card rendered from captured iRail data.

The runtime model is `claude-opus-5`, set in [src/server/agent.ts](src/server/agent.ts). All browser sessions share one iRail client, so the rate-limit budget and the station cache are shared too.

## Development

```bash
npm run dev           # run the MCP server from source via tsx
npm run typecheck     # tsc --noEmit for both the Node code and the web app
npm run manual-test   # live smoke test of the six tools against the real iRail API
npm run parse-test    # 36 table-driven cases for the lexical parser, across EN/NL/FR
npm run retry-test    # the client's 5xx retry policy, against a local stub (no network)
```

`parse-test` fetches the station list once and then parses offline, so it is fast and deterministic. Add a case there before changing the grammar — the traps it guards (a time like `14u30` being read as a train number, `Gent` resolving to Sint-Pieters rather than Gentbrugge, `goede` not matching the station `Ede`) are all bugs it caught.

`manual-test` picks a train off a live departure board rather than hardcoding a train number, so it keeps working on any day.

## Known limitations

- iRail only holds `station_board`, `track_train` and `train_composition` data for dates close to today; historical or far-future queries return nothing.
- NMBS publishes composition data for only part of the fleet, and usually only close to departure. `train_composition` says so explicitly rather than erroring.
- iRail is an unofficial community API with no SLA. Gateway blips (502/503/504) and network errors are retried twice with a short backoff, since they usually clear immediately; deterministic failures (400, 404) are not. Whatever survives that comes back as a structured error with a `kind` (`not_found`, `rate_limited`, `network_error`, …) rather than as an exception.
- iRail occasionally lists a train on a departure board but has no journey record for it, so `track_train` on that particular train returns `not_found` while its neighbours work. That is upstream data, not a bug here.
