import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { GenerateContentResponse } from '@google/genai';
import type {
  AirQualityData,
  AqiSeverity,
  CleanAirWindow,
  FluctuationAlert,
  GroundingSource,
  HouseholdProfile,
  HourlyAirPoint,
  InversionRisk,
} from './src/types/air.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '1mb' }));

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseGeminiError(error: unknown): { status: number; message: string; isQuota: boolean } {
  const raw = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  let status = 500;
  let parsedMsg = raw;

  try {
    const jsonStart = raw.indexOf('{');
    if (jsonStart >= 0) {
      const parsed = JSON.parse(raw.slice(jsonStart)) as {
        error?: { code?: number; message?: string; status?: string };
      };
      if (parsed.error?.code) status = parsed.error.code;
      if (parsed.error?.message) parsedMsg = parsed.error.message;
    }
  } catch {
    // Keep raw message if not JSON
  }

  const lower = `${raw} ${parsedMsg}`.toLowerCase();
  const isQuota =
    status === 429 ||
    lower.includes('resource_exhausted') ||
    lower.includes('exceeded your current quota') ||
    lower.includes('rate limit');

  if (isQuota) {
    return {
      status: 429,
      isQuota: true,
      message:
        'Gemini API quota or rate limit reached. Please wait a few seconds and try again, or select a billing-enabled API key in Settings > Secrets.',
    };
  }

  if (status === 403 || lower.includes('permission_denied') || lower.includes('api_key_invalid')) {
    return {
      status: 403,
      isQuota: false,
      message: 'API key permission issue. Please verify your Gemini API key in Settings > Secrets.',
    };
  }

  return {
    status: status >= 400 && status < 600 ? status : 500,
    isQuota: false,
    message: parsedMsg || 'AI service request failed.',
  };
}

async function generateWithFallback(
  runner: (model: string, allowSearch: boolean) => Promise<GenerateContentResponse>,
  preferSearch: boolean
): Promise<GenerateContentResponse> {
  const attempts: Array<{ model: string; allowSearch: boolean; delayMs: number }> = [
    { model: 'gemini-4-hydrogen', allowSearch: preferSearch, delayMs: 0 },
    { model: 'gemini-3.1-flash-lite', allowSearch: false, delayMs: 1100 },
    { model: 'gemini-3.1-flash-lite', allowSearch: false, delayMs: 2200 },
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    if (attempt.delayMs > 0) {
      await sleep(attempt.delayMs);
    }
    try {
      return await runner(attempt.model, attempt.allowSearch);
    } catch (err) {
      lastError = err;
      const info = parseGeminiError(err);
      if (!info.isQuota && info.status !== 503) {
        throw err;
      }
    }
  }
  throw lastError;
}

function classifyAqi(usAqi: number): AqiSeverity {
  if (usAqi <= 50) return 'Good';
  if (usAqi <= 100) return 'Moderate';
  if (usAqi <= 150) return 'Sensitive Groups';
  if (usAqi <= 200) return 'Unhealthy';
  if (usAqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

function computeInversionRisk(tempC: number, windKmh: number, humidityPct: number, pm25: number): InversionRisk {
  let score = 0;
  if (windKmh < 6) score += 3;
  else if (windKmh < 11) score += 2;
  else if (windKmh < 16) score += 1;

  if (tempC <= 5) score += 2;
  else if (tempC <= 12) score += 1;

  if (humidityPct >= 70) score += 1;
  if (pm25 >= 55) score += 2;
  else if (pm25 >= 30) score += 1;

  if (score >= 6) return 'Severe';
  if (score >= 4) return 'High';
  if (score >= 2) return 'Moderate';
  return 'Low';
}

function determineDominantPollutant(pm25: number, pm10: number, no2: number, ozone: number): string {
  const ratios = [
    { name: 'PM2.5 (Fine Particulates)', ratio: pm25 / 35 },
    { name: 'PM10 (Coarse Dust & Soot)', ratio: pm10 / 150 },
    { name: 'NO2 (Traffic & Gas Combustion)', ratio: no2 / 100 },
    { name: 'O3 (Ground-Level Ozone)', ratio: ozone / 100 },
  ];
  ratios.sort((a, b) => b.ratio - a.ratio);
  return ratios[0]?.name ?? 'PM2.5 (Fine Particulates)';
}

function detectCleanAirWindow(hourly: HourlyAirPoint[]): CleanAirWindow | null {
  if (hourly.length < 4) return null;
  const next24 = hourly.slice(0, 24);
  let bestIdx = 0;
  let bestAvg = Infinity;

  // Prefer daytime ventilation windows between 09:00 and 18:00 when possible
  for (let i = 0; i < next24.length - 1; i++) {
    const avg = (next24[i].usAqi + next24[i + 1].usAqi) / 2;
    const hourNum = Number(next24[i].hourLabel.slice(0, 2));
    const daytimeBonus = hourNum >= 10 && hourNum <= 17 ? -4 : 0;
    if (avg + daytimeBonus < bestAvg) {
      bestAvg = avg + daytimeBonus;
      bestIdx = i;
    }
  }

  const start = next24[bestIdx];
  const end = next24[Math.min(bestIdx + 2, next24.length - 1)];
  const avgAqi = Math.round((next24[bestIdx].usAqi + next24[bestIdx + 1].usAqi) / 2);
  const avgPm25 = Number(((next24[bestIdx].pm25 + next24[bestIdx + 1].pm25) / 2).toFixed(1));

  return {
    startHour: start.hourLabel,
    endHour: end.hourLabel,
    avgAqi,
    avgPm25,
    description:
      avgAqi <= 100
        ? `Lowest ambient pollution trough (${avgAqi} AQI). Ideal 20–40 min cross-ventilation window before evening cooling.`
        : `Relative daytime dip (${avgAqi} AQI), though still elevated. Limit natural ventilation to 10 min with HEPA filtration running.`,
  };
}

function buildFluctuationAlerts(
  currentAqi: number,
  currentPm25: number,
  windKmh: number,
  inversionRisk: InversionRisk,
  hourly: HourlyAirPoint[],
  thresholdAqi: number,
  cleanWindow: CleanAirWindow | null
): FluctuationAlert[] {
  const alerts: FluctuationAlert[] = [];
  const next18 = hourly.slice(0, 18);

  // 1. Threshold crossed right now
  if (currentAqi >= thresholdAqi) {
    alerts.push({
      id: 'threshold-now',
      severity: currentAqi >= 151 ? 'critical' : 'warning',
      kind: 'Threshold Crossed',
      title: `Current AQI (${currentAqi}) exceeds your ${thresholdAqi} alert threshold`,
      timeWindow: 'Active Now',
      deltaSummary: `PM2.5 at ${currentPm25.toFixed(1)} µg/m³`,
      explanation:
        'Fine particulates are elevated above your household sensitivity limit. Unfiltered outdoor air will rapidly infiltrate indoor rooms.',
      immediateAction: 'Close exterior windows, set air purifiers to medium-high, and shift errands indoors.',
    });
  }

  // 2. Detect sharpest upcoming 3-hour PM2.5 / AQI surge
  let maxSurgePct = 0;
  let surgeStart: HourlyAirPoint | null = null;
  let surgeEnd: HourlyAirPoint | null = null;

  for (let i = 0; i < next18.length - 3; i++) {
    const base = Math.max(next18[i].pm25, 5);
    const future = next18[i + 3].pm25;
    const pct = ((future - base) / base) * 100;
    if (pct > maxSurgePct && future - base >= 6) {
      maxSurgePct = pct;
      surgeStart = next18[i];
      surgeEnd = next18[i + 3];
    }
  }

  if (surgeStart && surgeEnd && maxSurgePct >= 20) {
    alerts.push({
      id: 'spike-forecast',
      severity: surgeEnd.usAqi >= 151 ? 'critical' : 'warning',
      kind: 'Spike Forecast',
      title: `Projected +${Math.round(maxSurgePct)}% PM2.5 surge over 3 hours`,
      timeWindow: `${surgeStart.hourLabel} – ${surgeEnd.hourLabel}`,
      deltaSummary: `${surgeStart.pm25.toFixed(1)} → ${surgeEnd.pm25.toFixed(1)} µg/m³ (${surgeEnd.usAqi} AQI)`,
      explanation:
        'Evening cooling combined with commuter exhaust and residential heating typically traps particulates near street level.',
      immediateAction: `Complete outdoor walks before ${surgeStart.hourLabel} and pre-filter main bedrooms ahead of the spike.`,
    });
  }

  // 3. Thermal inversion stagnation warning
  if (inversionRisk === 'High' || inversionRisk === 'Severe') {
    alerts.push({
      id: 'inversion-trap',
      severity: inversionRisk === 'Severe' ? 'critical' : 'warning',
      kind: 'Inversion Trap',
      title: `${inversionRisk} winter boundary-layer stagnation detected`,
      timeWindow: 'Next 6–12 Hours',
      deltaSummary: `Surface wind ${windKmh.toFixed(1)} km/h`,
      explanation:
        'Calm winds and cold surface air prevent vertical mixing, allowing tailpipe NO2 and smoke particulates to accumulate in urban basins.',
      immediateAction: 'Avoid idling vehicles, postpone wood/solid-fuel fires, and seal drafty door thresholds.',
    });
  }

  // 4. Clean-air window guidance
  if (cleanWindow) {
    alerts.push({
      id: 'clean-window',
      severity: 'info',
      kind: 'Clean-Air Window',
      title: `Best ventilation & outdoor window at ${cleanWindow.startHour}`,
      timeWindow: `${cleanWindow.startHour} – ${cleanWindow.endHour}`,
      deltaSummary: `Forecast trough ${cleanWindow.avgAqi} AQI · ${cleanWindow.avgPm25} µg/m³`,
      explanation: cleanWindow.description,
      immediateAction:
        cleanWindow.avgAqi <= 100
          ? 'Flush indoor CO2 by opening opposite windows briefly during this trough, then reseal.'
          : 'Keep windows cracked only briefly if indoor CO2 feels stale; rely on mechanical HEPA filtration.',
    });
  }

  return alerts;
}

// Search cities via Open-Meteo Geocoding API
app.get('/api/locations/search', async (req: Request, res: Response) => {
  try {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) {
      res.json({ results: [] });
      return;
    }
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      query
    )}&count=6&language=en&format=json`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Geocoding service responded with ${response.status}`);
    }
    const data = (await response.json()) as {
      results?: Array<{
        id: number;
        name: string;
        admin1?: string;
        country?: string;
        latitude: number;
        longitude: number;
        timezone?: string;
      }>;
    };

    const results = (data.results || []).map((item) => ({
      id: String(item.id),
      name: item.name,
      region: item.admin1 || '',
      country: item.country || '',
      latitude: item.latitude,
      longitude: item.longitude,
      timezone: item.timezone || 'auto',
    }));

    res.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Location search failed';
    res.status(500).json({ error: message });
  }
});

// Reverse lookup helper for geolocation coordinates
app.get('/api/locations/reverse', async (req: Request, res: Response) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ error: 'Valid lat and lon parameters are required.' });
    return;
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ClearAirCivic/1.0',
      },
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
      const addr = data.address || {};
      const city = addr.city || addr.town || addr.village || addr.suburb || 'Local Area';
      res.json({
        location: {
          id: `${lat.toFixed(2)},${lon.toFixed(2)}`,
          name: city,
          region: addr.state || '',
          country: addr.country || '',
          latitude: lat,
          longitude: lon,
          timezone: 'auto',
        },
      });
      return;
    }
  } catch {
    // Fallback below if reverse geocoding unavailable
  }

  res.json({
    location: {
      id: `${lat.toFixed(2)},${lon.toFixed(2)}`,
      name: `Local Coordinates (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`,
      region: '',
      country: 'Detected Location',
      latitude: lat,
      longitude: lon,
      timezone: 'auto',
    },
  });
});

// Real-time localized air quality + weather + alerts
app.get('/api/air-quality', async (req: Request, res: Response) => {
  try {
    const hasCustomCoords = req.query.lat !== undefined && req.query.lon !== undefined;
    const lat = Number(req.query.lat ?? 40.7608); // Default: Salt Lake City (classic winter inversion city)
    const lon = Number(req.query.lon ?? -111.891);
    const name = String(req.query.name ?? (hasCustomCoords ? 'Local Area' : 'Salt Lake City'));
    const region = String(req.query.region ?? (hasCustomCoords ? '' : 'Utah'));
    const country = String(req.query.country ?? (hasCustomCoords ? '' : 'United States'));
    const timezone = String(req.query.timezone || 'auto');
    const thresholdAqi = Number(req.query.threshold ?? 100);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      res.status(400).json({ error: 'Invalid coordinates provided.' });
      return;
    }

    const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,european_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone&hourly=us_aqi,pm10,pm2_5,nitrogen_dioxide,ozone&timezone=${encodeURIComponent(
      timezone
    )}&forecast_days=2`;

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,surface_pressure&hourly=temperature_2m,wind_speed_10m&timezone=${encodeURIComponent(
      timezone
    )}&forecast_days=2`;

    const [aqRes, weatherRes] = await Promise.all([fetch(aqUrl), fetch(weatherUrl)]);

    if (!aqRes.ok) {
      throw new Error(`Air quality feed returned status ${aqRes.status}`);
    }
    if (!weatherRes.ok) {
      throw new Error(`Weather feed returned status ${weatherRes.status}`);
    }

    const aqJson = (await aqRes.json()) as {
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
    };

    const weatherJson = (await weatherRes.json()) as {
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
    };

    // Align hourly series starting from the current hour index
    const currentTimeStr = aqJson.current.time;
    const currentHourPrefix = currentTimeStr.slice(0, 13);
    let startIdx = aqJson.hourly.time.findIndex((t) => t.startsWith(currentHourPrefix));
    if (startIdx < 0) startIdx = 0;

    const hourly: HourlyAirPoint[] = [];
    for (let i = startIdx; i < Math.min(startIdx + 24, aqJson.hourly.time.length); i++) {
      const iso = aqJson.hourly.time[i];
      const hourLabel = iso.slice(11, 16);
      hourly.push({
        time: iso,
        hourLabel,
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

    const payload: AirQualityData = {
      location: {
        id: `${lat.toFixed(3)},${lon.toFixed(3)}`,
        name,
        region,
        country,
        latitude: lat,
        longitude: lon,
        timezone: aqJson.timezone || timezone,
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

    res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to retrieve localized air quality data.';
    res.status(500).json({ error: message });
  }
});

// GenAI Tailored Daily Plan, Indoor Air Hacks & Direct Impact Explainer
app.post('/api/assistant/plan', async (req: Request, res: Response) => {
  try {
    const { airData, profile } = req.body as {
      airData?: AirQualityData;
      profile?: HouseholdProfile;
    };

    if (!airData || !profile) {
      res.status(400).json({ error: 'Both airData and household profile are required.' });
      return;
    }

    const ai = getGeminiClient();

    const householdLabels: Record<HouseholdProfile['householdType'], string> = {
      'family-kids': 'Family with school-age children',
      'multi-gen-seniors': 'Multi-generational home with older adults or asthma sensitivity',
      'commuting-adults': 'Working adults commuting daily in the city',
      'community-organizer': 'Neighborhood / school community organizer coordinating shared action',
    };

    const commuteLabels: Record<HouseholdProfile['commuteMode'], string> = {
      car: 'Personal gasoline/hybrid car',
      'public-transit': 'Bus, metro, or rail transit',
      'walk-cycle': 'Walking or cycling',
      remote: 'Mostly home-based / remote work',
    };

    const heatingLabels: Record<HouseholdProfile['heatingAndCooking'], string> = {
      'gas-stove-furnace': 'Natural gas stove and/or gas furnace',
      'wood-solid-fuel': 'Wood fireplace, pellet stove, or solid-fuel heating',
      'electric-heat-pump': 'All-electric induction stove and heat pump',
    };

    const gearLabels: Record<HouseholdProfile['indoorGear'], string> = {
      none: 'No dedicated air purifier yet',
      'diy-corsi-rosenthal': 'DIY box-fan MERV-13 filter (Corsi-Rosenthal box)',
      'hepa-purifiers': 'True HEPA indoor air purifiers',
    };

    const hourlyBrief = airData.hourly
      .slice(0, 16)
      .map((h) => `${h.hourLabel}: AQI ${h.usAqi} (PM2.5 ${h.pm25} µg/m³, Wind ${h.windKmh} km/h)`)
      .join(' | ');

    const prompt = `Generate a tailored winter smog & urban air quality action plan for this household based on their LIVE local telemetry.

LOCATION: ${airData.location.name}${airData.location.region ? `, ${airData.location.region}` : ''}, ${airData.location.country}
CURRENT TELEMETRY:
- US AQI: ${airData.current.usAqi} (${airData.current.severity})
- PM2.5: ${airData.current.pm25} µg/m³ | PM10: ${airData.current.pm10} µg/m³ | NO2: ${airData.current.no2} µg/m³ | O3: ${airData.current.ozone} µg/m³
- Dominant Pollutant: ${airData.current.dominantPollutant}
- Weather: ${airData.current.tempC}°C, Humidity ${airData.current.humidityPct}%, Wind ${airData.current.windKmh} km/h
- Winter Inversion Risk: ${airData.current.inversionRisk}
- Clean-Air Window: ${airData.cleanAirWindow ? `${airData.cleanAirWindow.startHour}–${airData.cleanAirWindow.endHour} (avg ${airData.cleanAirWindow.avgAqi} AQI)` : 'None identified'}
- Next 16h Forecast: ${hourlyBrief}

HOUSEHOLD PROFILE:
- Household: ${householdLabels[profile.householdType]}
- Primary Mobility: ${commuteLabels[profile.commuteMode]}
- Heating & Cooking: ${heatingLabels[profile.heatingAndCooking]}
- Indoor Filtration: ${gearLabels[profile.indoorGear]}
- Alert Threshold: ${profile.alertThresholdAqi} US AQI

REQUIREMENTS:
Provide 9 total specific, high-impact recommendations (3 with category "routine", 3 with category "indoor-hack", 3 with category "sustainable-swap").
Every recommendation MUST:
1. Reference this location's actual forecast hours, inversion dynamics, or dominant pollutant (${airData.current.dominantPollutant}), plus the household's specific equipment/lifestyle.
2. Clearly explain BOTH the direct personal health exposure reduction (with realistic µg/m³ or % indoor PM2.5/NO2 reduction) AND the direct community airshed emission impact (how the choice reduces neighborhood pollution during stagnant winter air).
3. Include realistic numeric estimates: estimatedExposureAvoidedUg (number between 2 and 35 representing daily µg/m³ PM2.5-equivalent inhalation exposure avoided) and estimatedWeeklyCo2KgSaved (number between 0 and 28 representing weekly kg CO2e saved, 0 if purely protective indoor hack).
Keep prose crisp, practical, empathetic, and free of jargon.`;

    const response = await generateWithFallback(
      (model) =>
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction:
              'You are an environmental health engineer and community air-quality advisor specializing in severe winter inversions, urban PM2.5/NO2 pollution, and practical household interventions. Return strictly valid JSON matching the schema.',
            ...(model === 'gemini-4-hydrogen'
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                executiveSummary: {
                  type: Type.STRING,
                  description:
                    '2 concise sentences summarizing today’s localized smog condition and top priority for this household.',
                },
                inversionBrief: {
                  type: Type.STRING,
                  description: '1-2 sentences explaining how today’s wind, temperature, and pollutant mix behave in this city.',
                },
                recommendations: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      category: {
                        type: Type.STRING,
                        enum: ['routine', 'indoor-hack', 'sustainable-swap'],
                      },
                      title: { type: Type.STRING },
                      timeWindow: { type: Type.STRING },
                      effortLevel: {
                        type: Type.STRING,
                        enum: ['Low Effort', 'Moderate', 'Habit Shift'],
                      },
                      costTier: {
                        type: Type.STRING,
                        enum: ['Free', 'Low Cost', 'Investment'],
                      },
                      summary: { type: Type.STRING },
                      personalExposureReduction: {
                        type: Type.STRING,
                        description: 'Concise direct health metric e.g. "-45% indoor PM2.5 (~14 µg/m³ avoided)"',
                      },
                      communityEmissionImpact: {
                        type: Type.STRING,
                        description: 'Concise community impact e.g. "-1.8 kg CO2e & -2.4 g NOx/day avoided"',
                      },
                      mechanismExplanation: {
                        type: Type.STRING,
                        description:
                          '1-2 sentences clearly explaining the direct physical/health cause and effect of this choice.',
                      },
                      estimatedExposureAvoidedUg: { type: Type.NUMBER },
                      estimatedWeeklyCo2KgSaved: { type: Type.NUMBER },
                    },
                    required: [
                      'id',
                      'category',
                      'title',
                      'timeWindow',
                      'effortLevel',
                      'costTier',
                      'summary',
                      'personalExposureReduction',
                      'communityEmissionImpact',
                      'mechanismExplanation',
                      'estimatedExposureAvoidedUg',
                      'estimatedWeeklyCo2KgSaved',
                    ],
                  },
                },
              },
              required: ['executiveSummary', 'inversionBrief', 'recommendations'],
            },
          },
        }),
      false
    );

    const rawText = (response.text ?? '{}').trim();
    const parsed = JSON.parse(rawText);
    res.json({
      generatedAt: new Date().toISOString(),
      ...parsed,
    });
  } catch (error) {
    const parsedErr = parseGeminiError(error);
    console.error('Gemini plan error:', parsedErr.message);
    res.status(parsedErr.status).json({ error: parsedErr.message });
  }
});

// Grounded Conversational Smog Advisor
app.post('/api/assistant/chat', async (req: Request, res: Response) => {
  try {
    const { message, history, airData, profile, useSearchGrounding } = req.body as {
      message?: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
      airData?: AirQualityData;
      profile?: HouseholdProfile;
      useSearchGrounding?: boolean;
    };

    if (!message || !message.trim()) {
      res.status(400).json({ error: 'Message cannot be empty.' });
      return;
    }

    const ai = getGeminiClient();

    const contextSummary = airData
      ? `Active Location: ${airData.location.name}, ${airData.location.country}. Live US AQI: ${airData.current.usAqi} (${airData.current.severity}), PM2.5: ${airData.current.pm25} µg/m³, NO2: ${airData.current.no2} µg/m³, Wind: ${airData.current.windKmh} km/h, Temp: ${airData.current.tempC}°C, Inversion Risk: ${airData.current.inversionRisk}. Clean-Air Window: ${
          airData.cleanAirWindow ? `${airData.cleanAirWindow.startHour}-${airData.cleanAirWindow.endHour}` : 'N/A'
        }.`
      : 'No location loaded yet.';

    const profileSummary = profile
      ? `Household: ${profile.householdType}, Mobility: ${profile.commuteMode}, Heating/Cooking: ${profile.heatingAndCooking}, Indoor Gear: ${profile.indoorGear}.`
      : '';

    const contents = [
      ...(history || []).slice(-8).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      {
        role: 'user',
        parts: [{ text: message }],
      },
    ];

    const response = await generateWithFallback(
      (model, allowSearch) =>
        ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: `You are ClearAir Civic's family and community air-quality advisor. Help families navigate severe winter smog, urban traffic pollution, indoor air quality, and sustainable low-emission routines.
Always tie advice to the live telemetry and household setup below, and explicitly explain the direct health or community emission impact of any recommendation you give. Keep answers structured, concise, warm, and immediately actionable.
${contextSummary}
${profileSummary}`,
            ...(model === 'gemini-4-hydrogen'
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
            ...(allowSearch ? { tools: [{ googleSearch: {} }] } : {}),
          },
        }),
      Boolean(useSearchGrounding)
    );

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks as
      | Array<{ web?: { uri?: string; title?: string } }>
      | undefined;

    const sources: GroundingSource[] = [];
    if (Array.isArray(groundingChunks)) {
      for (const chunk of groundingChunks) {
        if (chunk.web?.uri && chunk.web?.title) {
          sources.push({
            title: chunk.web.title,
            uri: chunk.web.uri,
          });
        }
      }
    }

    res.json({
      reply: response.text || 'I could not generate a response for that question.',
      sources,
    });
  } catch (error) {
    const parsedErr = parseGeminiError(error);
    console.error('Gemini chat error:', parsedErr.message);
    res.status(parsedErr.status).json({ error: parsedErr.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ClearAir Civic server listening on http://localhost:${PORT}`);
  });
}

startServer();
