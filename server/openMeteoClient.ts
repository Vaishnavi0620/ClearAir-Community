import type {
  AirQualityData,
  HourlyAirPoint,
  LocationOption,
} from '../src/types/air.ts';
import {
  buildFluctuationAlerts,
  classifyAqi,
  computeInversionRisk,
  detectCleanAirWindow,
  determineDominantPollutant,
} from './airMetrics.ts';

const UPSTREAM_TIMEOUT_MS = 8000;

interface OpenMeteoGeoResult {
  id: number;
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

interface OpenMeteoAirResponse {
  timezone?: string;
  current: {
    time: string;
    us_aqi: number;
    european_aqi: number;
    pm10: number;
    pm2_5: number;
    carbon_monoxide: number;
    nitrogen_dioxide: number;
    sulphur_dioxide: number;
    ozone: number;
  };
  hourly: {
    time: string[];
    us_aqi: Array<number | null>;
    pm10: Array<number | null>;
    pm2_5: Array<number | null>;
    nitrogen_dioxide: Array<number | null>;
    ozone: Array<number | null>;
  };
}

interface OpenMeteoWeatherResponse {
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    surface_pressure: number;
  };
  hourly: {
    time: string[];
    temperature_2m: Array<number | null>;
    wind_speed_10m: Array<number | null>;
  };
}

export async function searchLocations(query: string): Promise<LocationOption[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    query
  )}&count=6&language=en&format=json`;
  const response = await fetch(url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`Geocoding service responded with ${response.status}`);
  }
  const data = (await response.json()) as { results?: OpenMeteoGeoResult[] };
  return (data.results ?? []).map((item) => ({
    id: String(item.id),
    name: item.name,
    region: item.admin1 ?? '',
    country: item.country ?? '',
    latitude: item.latitude,
    longitude: item.longitude,
    timezone: item.timezone ?? 'auto',
  }));
}

export async function reverseGeocodeLocation(lat: number, lon: number): Promise<LocationOption> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'ClearAirCivic/1.0' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (response.ok) {
      const data = (await response.json()) as {
        address?: {
          city?: string;
          town?: string;
          village?: string;
          suburb?: string;
          state?: string;
          country?: string;
        };
      };
      const addr = data.address ?? {};
      const city = addr.city || addr.town || addr.village || addr.suburb || 'Local Area';
      return {
        id: `${lat.toFixed(2)},${lon.toFixed(2)}`,
        name: city,
        region: addr.state ?? '',
        country: addr.country ?? '',
        latitude: lat,
        longitude: lon,
        timezone: 'auto',
      };
    }
  } catch {
    // Fall back to coordinate label when reverse geocoding times out or is unavailable
  }

  return {
    id: `${lat.toFixed(2)},${lon.toFixed(2)}`,
    name: `Local Coordinates (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`,
    region: '',
    country: 'Detected Location',
    latitude: lat,
    longitude: lon,
    timezone: 'auto',
  };
}

export function mapOpenMeteoToSnapshot(
  aqJson: OpenMeteoAirResponse,
  weatherJson: OpenMeteoWeatherResponse,
  location: Omit<LocationOption, 'id'>,
  thresholdAqi: number
): AirQualityData {
  const currentHourPrefix = aqJson.current.time.slice(0, 13);
  let startIdx = aqJson.hourly.time.findIndex((t) => t.startsWith(currentHourPrefix));
  if (startIdx < 0) startIdx = 0;

  const hourly: HourlyAirPoint[] = [];
  for (let i = startIdx; i < Math.min(startIdx + 24, aqJson.hourly.time.length); i++) {
    const iso = aqJson.hourly.time[i];
    hourly.push({
      time: iso,
      hourLabel: iso.slice(11, 16),
      usAqi: Math.round(aqJson.hourly.us_aqi[i] ?? aqJson.current.us_aqi ?? 0),
      pm25: Number((aqJson.hourly.pm2_5[i] ?? aqJson.current.pm2_5 ?? 0).toFixed(1)),
      pm10: Number((aqJson.hourly.pm10[i] ?? aqJson.current.pm10 ?? 0).toFixed(1)),
      no2: Number((aqJson.hourly.nitrogen_dioxide[i] ?? aqJson.current.nitrogen_dioxide ?? 0).toFixed(1)),
      ozone: Number((aqJson.hourly.ozone[i] ?? aqJson.current.ozone ?? 0).toFixed(1)),
      tempC: Number((weatherJson.hourly.temperature_2m[i] ?? weatherJson.current.temperature_2m ?? 0).toFixed(1)),
      windKmh: Number((weatherJson.hourly.wind_speed_10m[i] ?? weatherJson.current.wind_speed_10m ?? 0).toFixed(1)),
    });
  }

  const usAqi = Math.round(aqJson.current.us_aqi ?? 0);
  const pm25 = Number((aqJson.current.pm2_5 ?? 0).toFixed(1));
  const pm10 = Number((aqJson.current.pm10 ?? 0).toFixed(1));
  const no2 = Number((aqJson.current.nitrogen_dioxide ?? 0).toFixed(1));
  const ozone = Number((aqJson.current.ozone ?? 0).toFixed(1));
  const co = Number((aqJson.current.carbon_monoxide ?? 0).toFixed(0));
  const so2 = Number((aqJson.current.sulphur_dioxide ?? 0).toFixed(1));

  const tempC = Number((weatherJson.current.temperature_2m ?? 0).toFixed(1));
  const humidityPct = Math.round(weatherJson.current.relative_humidity_2m ?? 0);
  const windKmh = Number((weatherJson.current.wind_speed_10m ?? 0).toFixed(1));
  const pressureHpa = Math.round(weatherJson.current.surface_pressure ?? 1013);

  const inversionRisk = computeInversionRisk(tempC, windKmh, humidityPct, pm25);
  const cleanAirWindow = detectCleanAirWindow(hourly);
  const alerts = buildFluctuationAlerts(
    usAqi,
    pm25,
    windKmh,
    inversionRisk,
    hourly,
    thresholdAqi,
    cleanAirWindow
  );

  return {
    location: {
      id: `${location.latitude.toFixed(3)},${location.longitude.toFixed(3)}`,
      name: location.name,
      region: location.region,
      country: location.country,
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: aqJson.timezone || location.timezone,
    },
    fetchedAt: new Date().toISOString(),
    current: {
      usAqi,
      europeanAqi: Math.round(aqJson.current.european_aqi ?? 0),
      severity: classifyAqi(usAqi),
      pm25,
      pm10,
      no2,
      ozone,
      co,
      so2,
      tempC,
      humidityPct,
      windKmh,
      pressureHpa,
      inversionRisk,
      dominantPollutant: determineDominantPollutant(pm25, pm10, no2, ozone),
    },
    hourly,
    cleanAirWindow,
    alerts,
  };
}

export async function fetchAirQualitySnapshot(
  location: Omit<LocationOption, 'id'>,
  thresholdAqi: number
): Promise<AirQualityData> {
  const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${location.latitude}&longitude=${location.longitude}&current=us_aqi,european_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone&hourly=us_aqi,pm10,pm2_5,nitrogen_dioxide,ozone&timezone=${encodeURIComponent(
    location.timezone
  )}&forecast_days=2`;

  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,surface_pressure&hourly=temperature_2m,wind_speed_10m&timezone=${encodeURIComponent(
    location.timezone
  )}&forecast_days=2`;

  const [aqRes, weatherRes] = await Promise.all([
    fetch(aqUrl, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) }),
    fetch(weatherUrl, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) }),
  ]);

  if (!aqRes.ok) {
    throw new Error(`Air quality feed returned status ${aqRes.status}`);
  }
  if (!weatherRes.ok) {
    throw new Error(`Weather feed returned status ${weatherRes.status}`);
  }

  const [aqJson, weatherJson] = (await Promise.all([
    aqRes.json(),
    weatherRes.json(),
  ])) as [OpenMeteoAirResponse, OpenMeteoWeatherResponse];

  return mapOpenMeteoToSnapshot(aqJson, weatherJson, location, thresholdAqi);
}
