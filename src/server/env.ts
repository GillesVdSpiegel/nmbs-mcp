import { existsSync } from "node:fs";

// Imported first by index.ts: ESM evaluates imports before the importer's
// body, and agent.ts constructs the Anthropic client at load time, so the
// env must be populated before that module is even evaluated.
if (existsSync(".env")) process.loadEnvFile(".env");
