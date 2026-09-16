/**
 * Proves the retry policy against a stub: `npm run retry-test`.
 * No network, no iRail — just the client's own behaviour on 5xx vs 404.
 */
import { createServer } from "node:http";
import { IrailClient, IrailError } from "./irail-client.js";

let failures = 0;
const check = (name: string, pass: boolean, detail: string) => {
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
};

const calls: string[] = [];
let plan: number[] = [];

const server = createServer((req, res) => {
  calls.push(req.url ?? "");
  const status = plan.shift() ?? 200;
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(status === 200 ? JSON.stringify({ version: "1.4", timestamp: "0", station: [] }) : JSON.stringify({ message: "stub" }));
});

await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const port = (server.address() as { port: number }).port;
const client = new IrailClient({ baseUrl: `http://127.0.0.1:${port}`, timeoutMs: 2000 });

// A gateway blip on the first two attempts should still produce an answer.
calls.length = 0;
plan = [504, 503];
try {
  await client.getStations("en");
  check("504 then 503 then 200 succeeds", calls.length === 3, `${calls.length} attempts`);
} catch (e) {
  check("504 then 503 then 200 succeeds", false, `threw ${(e as Error).message}`);
}

// Exhausting the retries surfaces the last error, not a hang.
calls.length = 0;
plan = [504, 504, 504];
try {
  await client.getStations("en");
  check("persistent 504 eventually fails", false, "unexpectedly succeeded");
} catch (e) {
  const err = e as IrailError;
  check(
    "persistent 504 eventually fails",
    calls.length === 3 && err.kind === "server_error" && /not responding/.test(err.message),
    `${calls.length} attempts, kind=${err.kind}`,
  );
}

// A 404 is the true answer to the question; retrying it just wastes time.
calls.length = 0;
plan = [404];
try {
  await client.getStations("en");
  check("404 is not retried", false, "unexpectedly succeeded");
} catch (e) {
  check("404 is not retried", calls.length === 1 && (e as IrailError).kind === "not_found", `${calls.length} attempt(s)`);
}

server.close();
console.log(failures === 0 ? "\nRetry policy behaves as intended." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
