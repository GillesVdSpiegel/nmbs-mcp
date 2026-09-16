#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { IrailClient } from "./irail-client.js";
import { StationsCache } from "./stations-cache.js";
import { checkDisruptionsTool } from "./tools/check-disruptions.js";
import { findStationTool } from "./tools/find-station.js";
import { planJourneyTool } from "./tools/plan-journey.js";
import { stationBoardTool } from "./tools/station-board.js";
import { trackTrainTool } from "./tools/track-train.js";
import { trainCompositionTool } from "./tools/train-composition.js";
import type { ToolContext } from "./tools/shared.js";

// stdout carries the JSON-RPC stream — anything logged there corrupts the
// protocol. All diagnostics must go to stderr.
const log = (msg: string) => console.error(`[nmbs-mcp] ${msg}`);

const irail = new IrailClient();
const ctx: ToolContext = { irail, stations: new StationsCache(irail), lang: "en" };

const server = new McpServer({ name: "nmbs-mcp", version: "0.1.0" });

const config = (t: { title: string; description: string }) => ({ title: t.title, description: t.description });

server.registerTool(findStationTool.name, { ...config(findStationTool), inputSchema: findStationTool.inputSchema }, (a) =>
  findStationTool.handler(a, ctx),
);
server.registerTool(planJourneyTool.name, { ...config(planJourneyTool), inputSchema: planJourneyTool.inputSchema }, (a) =>
  planJourneyTool.handler(a, ctx),
);
server.registerTool(stationBoardTool.name, { ...config(stationBoardTool), inputSchema: stationBoardTool.inputSchema }, (a) =>
  stationBoardTool.handler(a, ctx),
);
server.registerTool(trackTrainTool.name, { ...config(trackTrainTool), inputSchema: trackTrainTool.inputSchema }, (a) =>
  trackTrainTool.handler(a, ctx),
);
server.registerTool(
  checkDisruptionsTool.name,
  { ...config(checkDisruptionsTool), inputSchema: checkDisruptionsTool.inputSchema },
  (a) => checkDisruptionsTool.handler(a, ctx),
);
server.registerTool(
  trainCompositionTool.name,
  { ...config(trainCompositionTool), inputSchema: trainCompositionTool.inputSchema },
  (a) => trainCompositionTool.handler(a, ctx),
);

const transport = new StdioServerTransport();
await server.connect(transport);
log("ready — 6 tools registered (iRail / NMBS-SNCB)");
