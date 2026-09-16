/**
 * Shapes of the JSON each tool returns. This is a network contract with the
 * tool layer in ../../src/tools, mirrored here rather than imported so the
 * browser bundle never pulls in server code.
 */

export type Lang = "nl" | "fr" | "en" | "de";

export interface TimeInfo {
  scheduled?: string;
  actual?: string;
  delayMinutes: number;
}

export interface Platform {
  number: string;
  changed: boolean;
}

export interface Vehicle {
  id: string;
  name: string;
  type?: string;
  number?: string;
}

export interface StationRef {
  id: string;
  name: string;
  standardName: string;
  names: Partial<Record<Lang, string>>;
  latitude: number;
  longitude: number;
  score?: number;
}

export interface AmbiguousStation {
  status: "ambiguous_station";
  field: string;
  query: string;
  message: string;
  candidates: StationRef[];
}

export interface UnknownStation {
  status: "unknown_station";
  field: string;
  query: string;
  message: string;
}

export interface ToolFailure {
  error: true;
  kind: string;
  message: string;
}

export interface FindStationPayload {
  query: string;
  count: number;
  matches: StationRef[];
}

export interface Endpoint {
  station: string;
  stationId?: string;
  platform: Platform;
  time: TimeInfo;
  canceled: boolean;
  direction?: string;
}

export interface Alert {
  header: string;
  description: string;
  link?: string;
  startTime?: string;
  endTime?: string;
}

export interface Leg {
  vehicle: Vehicle;
  direction?: string;
  from: Endpoint;
  to: Endpoint;
  occupancy?: string;
  walking: boolean;
  transferMinutes?: number;
}

export interface Journey {
  departure: Endpoint;
  arrival: Endpoint;
  durationMinutes: number;
  transfers: number;
  legs: Leg[];
  alerts?: Alert[];
}

export interface PlanJourneyPayload {
  from: { id: string; name: string };
  to: { id: string; name: string };
  when: string;
  arriveBy: boolean;
  count: number;
  journeys: Journey[];
}

export interface BoardEntry {
  vehicle: Vehicle;
  destination?: string;
  origin?: string;
  platform: Platform;
  time: TimeInfo;
  canceled: boolean;
  isExtra: boolean;
  left?: boolean;
  arrived?: boolean;
  occupancy?: string;
}

export interface StationBoardPayload {
  station: string;
  stationId: string;
  direction: "departures" | "arrivals";
  windowMinutes: number;
  count: number;
  entries: BoardEntry[];
}

export interface Stop {
  station: string;
  stationId?: string;
  platform: Platform;
  arrival: TimeInfo;
  departure: TimeInfo;
  canceled: boolean;
  arrived: boolean;
  left: boolean;
  isExtraStop: boolean;
  occupancy?: string;
}

export interface TrackTrainPayload {
  train: Vehicle;
  date: string;
  currentPosition?: { latitude: number; longitude: number };
  stopCount: number;
  stops: Stop[];
  alerts?: Alert[];
}

export interface Disruption {
  title: string;
  description: string;
  type?: string;
  link?: string;
  updatedAt?: string;
  attachments: Array<{ text: string; link: string }>;
}

export interface DisruptionsPayload {
  total: number;
  returned: number;
  disruptions: Disruption[];
}

export interface Unit {
  position: number;
  materialType: string;
  materialNumber?: string;
  tractionType?: string;
  seatsFirstClass: number;
  seatsSecondClass: number;
  standingPlaces: number;
  lengthMeters: number;
  hasToilets: boolean;
  hasBikeSection: boolean;
  hasPrmSection: boolean;
  hasPriorityPlaces: boolean;
  hasAirco: boolean;
  hasPowerOutlets: boolean;
  canPassToNextUnit: boolean;
}

export interface Segment {
  origin?: string;
  destination?: string;
  source?: string;
  carriageCount: number;
  totals: {
    seatsFirstClass: number;
    seatsSecondClass: number;
    lengthMeters: number;
    bikeSections: number;
    prmSections: number;
  };
  units: Unit[];
}

export interface CompositionPayload {
  train: string;
  segments: Segment[];
  message?: string;
}

export function isToolFailure(p: unknown): p is ToolFailure {
  return typeof p === "object" && p !== null && (p as ToolFailure).error === true;
}

export function isAmbiguousStation(p: unknown): p is AmbiguousStation {
  return typeof p === "object" && p !== null && (p as AmbiguousStation).status === "ambiguous_station";
}

export function isUnknownStation(p: unknown): p is UnknownStation {
  return typeof p === "object" && p !== null && (p as UnknownStation).status === "unknown_station";
}
