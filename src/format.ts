import { unixToIso } from "./datetime.js";
import type { RawAlert, RawOccupancy, RawPlatformInfo, RawVehicleInfo } from "./irail-types.js";

export interface TimeInfo {
  scheduled?: string;
  actual?: string;
  delayMinutes: number;
}

export interface PlatformInfo {
  number: string;
  changed: boolean;
}

/** iRail booleans arrive as "0"/"1" strings. */
export function irailBool(v: string | number | undefined): boolean {
  return v === "1" || v === 1;
}

export function irailNumber(v: string | number | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Collapses iRail's scheduled-unix-seconds + delay-seconds pair into one object. */
export function buildTimeInfo(scheduledUnix: string | undefined, delaySeconds: string | undefined): TimeInfo {
  const scheduled = unixToIso(scheduledUnix);
  const delay = irailNumber(delaySeconds);
  const actual =
    scheduled === undefined ? undefined : new Date(new Date(scheduled).getTime() + delay * 1000).toISOString();
  return { scheduled, actual, delayMinutes: Math.round(delay / 60) };
}

export function buildPlatformInfo(platform: string | undefined, info: RawPlatformInfo | undefined): PlatformInfo {
  return {
    number: platform ?? info?.name ?? "?",
    // iRail's `normal` flag is 1 when the train is at its usual platform.
    changed: info !== undefined && !irailBool(info.normal),
  };
}

export function formatVehicle(vehicle: string | undefined, info: RawVehicleInfo | undefined) {
  return {
    id: vehicle ?? info?.name ?? "unknown",
    name: info?.shortname ?? vehicle ?? "unknown",
    type: info?.type,
    number: info?.number,
  };
}

export function formatOccupancy(o: RawOccupancy | undefined): string | undefined {
  return o?.name;
}

export function formatAlerts(alerts: { alert?: RawAlert[] } | undefined) {
  if (!alerts?.alert?.length) return undefined;
  return alerts.alert.map((a) => ({
    header: a.header,
    description: a.description,
    link: a.link,
    startTime: unixToIso(a.startTime),
    endTime: unixToIso(a.endTime),
  }));
}

/**
 * iRail collapses single-element lists into a bare object in some responses;
 * normalize everything to an array before mapping.
 */
export function asArray<T>(v: T[] | T | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}
