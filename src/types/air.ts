export interface LocationOption {
  id: string;
  name: string;
  region?: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface HourlyAirPoint {
  time: string;
  hourLabel: string;
  usAqi: number;
  pm25: number;
  pm10: number;
  no2: number;
  ozone: number;
  tempC: number;
  windKmh: number;
}

export type AqiSeverity =
  | 'Good'
  | 'Moderate'
  | 'Sensitive Groups'
  | 'Unhealthy'
  | 'Very Unhealthy'
  | 'Hazardous';

export type InversionRisk = 'Low' | 'Moderate' | 'High' | 'Severe';

export interface FluctuationAlert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  kind: 'Spike Forecast' | 'Inversion Trap' | 'Clean-Air Window' | 'Threshold Crossed' | 'Simulated Spike';
  title: string;
  timeWindow: string;
  deltaSummary: string;
  explanation: string;
  immediateAction: string;
}

export interface CleanAirWindow {
  startHour: string;
  endHour: string;
  avgAqi: number;
  avgPm25: number;
  description: string;
}

export interface AirQualityData {
  location: LocationOption;
  fetchedAt: string;
  current: {
    usAqi: number;
    europeanAqi: number;
    severity: AqiSeverity;
    pm25: number;
    pm10: number;
    no2: number;
    ozone: number;
    co: number;
    so2: number;
    tempC: number;
    humidityPct: number;
    windKmh: number;
    pressureHpa: number;
    inversionRisk: InversionRisk;
    dominantPollutant: string;
  };
  hourly: HourlyAirPoint[];
  cleanAirWindow: CleanAirWindow | null;
  alerts: FluctuationAlert[];
}

export interface HouseholdProfile {
  householdType:
    | 'family-kids'
    | 'multi-gen-seniors'
    | 'commuting-adults'
    | 'community-organizer';
  commuteMode: 'car' | 'public-transit' | 'walk-cycle' | 'remote';
  heatingAndCooking: 'gas-stove-furnace' | 'wood-solid-fuel' | 'electric-heat-pump';
  indoorGear: 'none' | 'diy-corsi-rosenthal' | 'hepa-purifiers';
  alertThresholdAqi: number;
}

export type RecommendationCategory = 'routine' | 'indoor-hack' | 'sustainable-swap';

export interface ActionRecommendation {
  id: string;
  category: RecommendationCategory;
  title: string;
  timeWindow: string;
  effortLevel: 'Low Effort' | 'Moderate' | 'Habit Shift';
  costTier: 'Free' | 'Low Cost' | 'Investment';
  summary: string;
  personalExposureReduction: string;
  communityEmissionImpact: string;
  mechanismExplanation: string;
  estimatedExposureAvoidedUg: number;
  estimatedWeeklyCo2KgSaved: number;
}

export interface TailoredPlanResponse {
  generatedAt: string;
  executiveSummary: string;
  inversionBrief: string;
  recommendations: ActionRecommendation[];
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface AdvisorMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sources?: GroundingSource[];
}
