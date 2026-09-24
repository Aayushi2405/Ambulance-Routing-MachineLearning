export interface Hospital {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address?: string;
  beds: number;
  availableBeds: number;
  doctorsCount: number;
  isSpecialized?: boolean;
  type?: string;
}

export interface RouteStep {
  instruction: string;
  distance: number;
  type: string;
  modifier?: string;
  location: [number, number];
}

export interface RouteInfo {
  distance: number; // meters
  duration: number; // seconds
  geometry: string; // polyline
  trafficMultiplier: number;
  trafficCondition: 'Light' | 'Moderate' | 'Heavy';
  steps?: RouteStep[];
}

export interface AmbulanceState {
  id: string;
  lat: number;
  lng: number;
  heading: number;
  lastUpdate?: number;
}

export interface EmergencyReport {
  id: number | string;
  title: string;
  patientName?: string;
  severity: 'Critical' | 'High' | 'Moderate' | 'Low';
  locationLat?: number;
  locationLng?: number;
  status?: string;
  notes?: string;
  createdAt?: string;
  isCustom?: boolean;
}

export interface HospitalScore {
  hospital: Hospital;
  route: RouteInfo;
  compositeScore: number;
  travelTimeScore: number;
  capacityScore: number;
  specializationScore: number;
  reasoning: string;
}

export interface OptimizationResult {
  recommended: HospitalScore;
  fastestRoute?: HospitalScore;
  maxCapacity?: HospitalScore;
  evaluatedCount: number;
  trafficAlerts: string[];
  recommendationReasoning: string;
}


