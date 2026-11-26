import type { AqiSeverity, HouseholdProfile, LocationOption } from '../types/air';

export const PRESET_LOCATIONS: LocationOption[] = [
  {
    id: 'salt-lake-city',
    name: 'Salt Lake City',
    region: 'Utah',
    country: 'United States',
    latitude: 40.7608,
    longitude: -111.891,
    timezone: 'America/Denver',
  },
  {
    id: 'delhi',
    name: 'New Delhi',
    region: 'Delhi',
    country: 'India',
    latitude: 28.6139,
    longitude: 77.209,
    timezone: 'Asia/Kolkata',
  },
  {
    id: 'lahore',
    name: 'Lahore',
    region: 'Punjab',
    country: 'Pakistan',
    latitude: 31.5204,
    longitude: 74.3587,
    timezone: 'Asia/Karachi',
  },
  {
    id: 'krakow',
    name: 'Krakow',
    region: 'Lesser Poland',
    country: 'Poland',
    latitude: 50.0647,
    longitude: 19.945,
    timezone: 'Europe/Warsaw',
  },
  {
    id: 'milan',
    name: 'Milan',
    region: 'Lombardy',
    country: 'Italy',
    latitude: 45.4642,
    longitude: 9.19,
    timezone: 'Europe/Rome',
  },
  {
    id: 'beijing',
    name: 'Beijing',
    region: 'Beijing',
    country: 'China',
    latitude: 39.9042,
    longitude: 116.4074,
    timezone: 'Asia/Shanghai',
  },
];

export const DEFAULT_PROFILE: HouseholdProfile = {
  householdType: 'family-kids',
  commuteMode: 'car',
  heatingAndCooking: 'gas-stove-furnace',
  indoorGear: 'diy-corsi-rosenthal',
  alertThresholdAqi: 100,
};

export interface SeverityStyle {
  textClass: string;
  surfaceClass: string;
  borderClass: string;
  strokeHex: string;
  summary: string;
}

export function getSeverityStyle(severity: AqiSeverity): SeverityStyle {
  switch (severity) {
    case 'Good':
      return {
        textClass: 'text-emerald-700',
        surfaceClass: 'bg-emerald-50/70',
        borderClass: 'border-emerald-200',
        strokeHex: '#047857',
        summary: 'Clean ambient air for outdoor activity and natural ventilation.',
      };
    case 'Moderate':
      return {
        textClass: 'text-amber-700',
        surfaceClass: 'bg-amber-50/70',
        borderClass: 'border-amber-200',
        strokeHex: '#B45309',
        summary: 'Acceptable overall; unusually sensitive individuals should pace strenuous outdoor exertion.',
      };
    case 'Sensitive Groups':
      return {
        textClass: 'text-orange-700',
        surfaceClass: 'bg-orange-50/80',
        borderClass: 'border-orange-200',
        strokeHex: '#C2410C',
        summary: 'Children, seniors, and anyone with asthma should reduce prolonged outdoor exertion.',
      };
    case 'Unhealthy':
      return {
        textClass: 'text-rose-700',
        surfaceClass: 'bg-rose-50/80',
        borderClass: 'border-rose-200',
        strokeHex: '#BE123C',
        summary: 'Everyone experiences elevated exposure; move exercise indoors and run HEPA filtration.',
      };
    case 'Very Unhealthy':
      return {
        textClass: 'text-red-800',
        surfaceClass: 'bg-red-50/90',
        borderClass: 'border-red-300',
        strokeHex: '#991B1B',
        summary: 'Health alert: keep windows sealed, wear fitted N95/KN95 masks outdoors, filter indoor air continuously.',
      };
    case 'Hazardous':
      return {
        textClass: 'text-red-900',
        surfaceClass: 'bg-red-100/90',
        borderClass: 'border-red-400',
        strokeHex: '#7F1D1D',
        summary: 'Emergency air quality: avoid all outdoor exertion and establish a sealed clean-air room.',
      };
  }
}

export function formatTimeShort(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}
