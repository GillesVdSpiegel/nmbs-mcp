import type {
  Lang,
  RawCompositionResponse,
  RawConnectionsResponse,
  RawDisturbancesResponse,
  RawIrailErrorBody,
  RawLiveboardResponse,
  RawStationsResponse,
  RawVehicleResponse,
} from "./irail-types.js";

export const IRAIL_BASE_URL = "https://api.irail.be";

export type IrailErrorKind =
  | "bad_request"
  | "not_found"
  | "rate_limited"
  | "server_error"
  | "network_error"
  | "parse_error";

export class IrailError extends Error {
  constructor(
    message: string,
    readonly kind: IrailErrorKind,
    readonly status?: number,
    readonly endpoint?: string,
  ) {
    super(message);
    this.name = "IrailError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * iRail's gateway returns a 502/503/504 every so often and succeeds on the
 * retry; the same blip should not surface to a traveller as an error card.
 * Deterministic failures (400, 404) are never retried.
 */
const RETRYABLE = new Set<IrailErrorKind>(["server_error", "network_error", "rate_limited"]);
const RETRY_BACKOFF_MS = [300, 900];
const MAX_ATTEMPTS = RETRY_BACKOFF_MS.length + 1;

/** iRail allows ~3 requests/second with a burst of 5. */
class TokenBucket {
  private tokens: number;
  private lastRefill = Date.now();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {
    this.tokens = capacity;
  }

  async take(): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.tokens = Math.min(this.capacity, this.tokens + ((now - this.lastRefill) / 1000) * this.refillPerSecond);
      this.lastRefill = now;
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      await sleep(Math.ceil(((1 - this.tokens) / this.refillPerSecond) * 1000));
    }
  }
}

export interface IrailClientOptions {
  userAgent?: string;
  defaultLang?: Lang;
  timeoutMs?: number;
  baseUrl?: string;
}

type Query = Record<string, string | number | undefined>;

export class IrailClient {
  private readonly bucket = new TokenBucket(5, 3);
  private readonly userAgent: string;
  private readonly defaultLang: Lang;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(opts: IrailClientOptions = {}) {
    this.userAgent = opts.userAgent ?? "nmbs-mcp/0.1.0 (MCP server for NMBS/SNCB train info)";
    this.defaultLang = opts.defaultLang ?? "en";
    this.timeoutMs = opts.timeoutMs ?? 12_000;
    this.baseUrl = opts.baseUrl ?? IRAIL_BASE_URL;
  }

  getStations(lang?: Lang): Promise<RawStationsResponse> {
    return this.request<RawStationsResponse>("/stations/", { lang }, "stations");
  }

  getLiveboard(
    params: { station?: string; id?: string; arrdep: "departure" | "arrival"; date?: string; time?: string },
    lang?: Lang,
  ): Promise<RawLiveboardResponse> {
    return this.request<RawLiveboardResponse>("/liveboard/", { ...params, alerts: "true", lang }, "liveboard");
  }

  getConnections(
    params: { from: string; to: string; date?: string; time?: string; timesel: "departure" | "arrival" },
    lang?: Lang,
  ): Promise<RawConnectionsResponse> {
    return this.request<RawConnectionsResponse>("/connections/", { ...params, alerts: "true", lang }, "connections");
  }

  getVehicle(params: { id: string; date?: string }, lang?: Lang): Promise<RawVehicleResponse> {
    return this.request<RawVehicleResponse>("/vehicle/", { ...params, alerts: "true", lang }, "vehicle");
  }

  getComposition(params: { id: string; data?: string }, lang?: Lang): Promise<RawCompositionResponse> {
    return this.request<RawCompositionResponse>("/composition/", { ...params, lang }, "composition");
  }

  getDisturbances(lang?: Lang): Promise<RawDisturbancesResponse> {
    return this.request<RawDisturbancesResponse>("/disturbances/", { lang }, "disturbances");
  }

  private async request<T>(path: string, query: Query, endpoint: string): Promise<T> {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries({ ...query, lang: query.lang ?? this.defaultLang, format: "json" })) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }

    let lastError: IrailError | undefined;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) await sleep(RETRY_BACKOFF_MS[attempt - 1]);
      try {
        return await this.attempt<T>(url, endpoint);
      } catch (e) {
        if (!(e instanceof IrailError) || !RETRYABLE.has(e.kind)) throw e;
        lastError = e;
      }
    }
    throw lastError;
  }

  private async attempt<T>(url: URL, endpoint: string): Promise<T> {
    await this.bucket.take();

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": this.userAgent, Accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      const msg = e instanceof Error && e.name === "TimeoutError" ? `timed out after ${this.timeoutMs}ms` : String(e);
      throw new IrailError(`Could not reach iRail (${endpoint}): ${msg}`, "network_error", undefined, endpoint);
    }

    const body = await res.text();

    if (!res.ok) {
      throw new IrailError(this.describeFailure(res.status, body, endpoint), kindForStatus(res.status), res.status, endpoint);
    }

    try {
      return JSON.parse(body) as T;
    } catch {
      throw new IrailError(`iRail returned a non-JSON response for ${endpoint}.`, "parse_error", res.status, endpoint);
    }
  }

  /** iRail reports failures as JSON with a genuinely useful `message` — surface it, drop the Java stack trace. */
  private describeFailure(status: number, body: string, endpoint: string): string {
    let detail = "";
    try {
      const parsed = JSON.parse(body) as RawIrailErrorBody;
      if (parsed.message) detail = ` ${parsed.message}`;
    } catch {
      /* non-JSON error body — the status alone will have to do */
    }
    if (status === 429) return `iRail rate limit hit on ${endpoint}; retry in a few seconds.${detail}`;
    if (status >= 502 && status <= 504) {
      return `iRail is not responding right now (HTTP ${status} on ${endpoint}). It usually clears in a moment.${detail}`;
    }
    return `iRail request to ${endpoint} failed (HTTP ${status}).${detail}`;
  }
}

function kindForStatus(status: number): IrailErrorKind {
  if (status === 400) return "bad_request";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  return "server_error";
}
