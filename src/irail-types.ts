/**
 * Raw iRail API response shapes, as observed live against api.irail.be (v1.4).
 * iRail serializes everything as strings, including numbers and booleans ("0"/"1").
 */

export type Lang = "nl" | "fr" | "en" | "de";

export interface RawStationInfo {
  "@id": string;
  id: string;
  name: string;
  standardname: string;
  locationX: string;
  locationY: string;
}

export interface RawStationsResponse {
  version: string;
  timestamp: string;
  station: RawStationInfo[];
}

export interface RawVehicleInfo {
  name: string;
  shortname: string;
  number: string;
  type: string;
  locationX: string;
  locationY: string;
  "@id": string;
}

export interface RawPlatformInfo {
  name: string;
  normal: string;
}

export interface RawOccupancy {
  "@id": string;
  name: string;
}

export interface RawLiveboardEntry {
  id: string;
  station: string;
  stationinfo: RawStationInfo;
  time: string;
  delay: string;
  canceled: string;
  left?: string;
  arrived?: string;
  isExtra: string;
  vehicle: string;
  vehicleinfo: RawVehicleInfo;
  platform: string;
  platforminfo: RawPlatformInfo;
  occupancy?: RawOccupancy;
  departureConnection?: string;
}

export interface RawLiveboardResponse {
  version: string;
  timestamp: string;
  station: string;
  stationinfo: RawStationInfo;
  departures?: { number: string; departure: RawLiveboardEntry[] };
  arrivals?: { number: string; arrival: RawLiveboardEntry[] };
}

export interface RawConnectionEndpoint {
  delay: string;
  station: string;
  stationinfo: RawStationInfo;
  time: string;
  vehicle: string;
  vehicleinfo: RawVehicleInfo;
  platform: string;
  platforminfo: RawPlatformInfo;
  canceled: string;
  direction?: { name: string };
  left?: string;
  arrived?: string;
  walking: string;
  occupancy?: RawOccupancy;
  departureConnection?: string;
}

export interface RawVia {
  id: string;
  arrival: RawConnectionEndpoint;
  departure: RawConnectionEndpoint;
  timeBetween?: string;
  station?: string;
  stationinfo?: RawStationInfo;
  vehicle?: string;
  vehicleinfo?: RawVehicleInfo;
}

export interface RawAlert {
  id: string;
  header: string;
  description: string;
  lead?: string;
  link?: string;
  startTime?: string;
  endTime?: string;
}

export interface RawConnection {
  id: string;
  departure: RawConnectionEndpoint;
  arrival: RawConnectionEndpoint;
  vias?: { number: string; via: RawVia[] };
  duration: string;
  remarks?: { number: string; remark: unknown[] };
  alerts?: { number: string; alert: RawAlert[] };
}

export interface RawConnectionsResponse {
  version: string;
  timestamp: string;
  connection?: RawConnection[];
}

export interface RawVehicleStop {
  id: string;
  station: string;
  stationinfo: RawStationInfo;
  time: string;
  platform: string;
  platforminfo: RawPlatformInfo;
  scheduledDepartureTime: string;
  scheduledArrivalTime: string;
  delay: string;
  canceled: string;
  departureDelay: string;
  departureCanceled: string;
  arrivalDelay: string;
  arrivalCanceled: string;
  left: string;
  arrived: string;
  isExtraStop: string;
  occupancy?: RawOccupancy;
  departureConnection?: string;
}

export interface RawVehicleResponse {
  version: string;
  timestamp: string;
  vehicle: string;
  vehicleinfo: RawVehicleInfo;
  stops?: { number: string; stop: RawVehicleStop[] };
  alerts?: { number: string; alert: RawAlert[] };
}

export interface RawCompositionUnit {
  id: string;
  materialType: { parent_type: string; sub_type: string; orientation: string };
  materialNumber?: string;
  materialSubTypeName?: string;
  tractionType?: string;
  tractionPosition?: string;
  hasToilets?: string;
  hasAirco?: string;
  hasHeating?: string;
  hasFirstClassOutlets?: string;
  hasSecondClassOutlets?: string;
  hasTables?: string;
  hasPrmSection?: string;
  hasPriorityPlaces?: string;
  hasBikeSection?: string;
  hasSemiAutomaticInteriorDoors?: string;
  canPassToNextUnit?: string;
  seatsFirstClass?: string;
  seatsCoupeFirstClass?: string;
  seatsSecondClass?: string;
  seatsCoupeSecondClass?: string;
  standingPlacesFirstClass?: string;
  standingPlacesSecondClass?: string;
  lengthInMeter?: string;
}

export interface RawCompositionSegment {
  id: string;
  origin: RawStationInfo;
  destination: RawStationInfo;
  composition: {
    source?: string;
    units: { number: string; unit: RawCompositionUnit[] };
  };
}

export interface RawCompositionResponse {
  version: string;
  timestamp: string;
  composition?: { segments: { number: string; segment: RawCompositionSegment[] } };
}

export interface RawDisturbance {
  id: string;
  title: string;
  description: string;
  type?: string;
  link?: string;
  timestamp: string;
  richtext?: string;
  descriptionLinks?: {
    number: string;
    descriptionLink: Array<{ id: string; link: string; text: string }>;
  };
}

export interface RawDisturbancesResponse {
  version: string;
  timestamp: string;
  disturbance?: RawDisturbance[];
}

/** iRail error bodies, e.g. {"exception":"JourneyNotFoundException","message":"...","at":"...","stackTrace":[]} */
export interface RawIrailErrorBody {
  exception?: string;
  message?: string;
}
