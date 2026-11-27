import { GoogleGenAI, Type } from '@google/genai';
import type { GenerateContentResponse } from '@google/genai';
import type { AirQualityData, HouseholdProfile } from '../src/types/air.ts';

export function getGeminiClient(): GoogleGenAI {
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

export function parseGeminiError(error: unknown): { status: number; message: string; isQuota: boolean } {
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

export async function generateWithFallback(
  runner: (model: string, allowSearch: boolean) => Promise<GenerateContentResponse>,
  preferSearch: boolean,
  delayScaleMs = 1
): Promise<GenerateContentResponse> {
  const attempts: Array<{ model: string; allowSearch: boolean; delayMs: number }> = [
    { model: 'gemini-4-hydrogen', allowSearch: preferSearch, delayMs: 0 },
    { model: 'gemini-3.1-flash-lite', allowSearch: false, delayMs: 1100 * delayScaleMs },
    { model: 'gemini-3.1-flash-lite', allowSearch: false, delayMs: 2200 * delayScaleMs },
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

const HOUSEHOLD_LABELS: Record<HouseholdProfile['householdType'], string> = {
  'family-kids': 'Family with school-age children',
  'multi-gen-seniors': 'Multi-generational home with older adults or asthma sensitivity',
  'commuting-adults': 'Working adults commuting daily in the city',
  'community-organizer': 'Neighborhood / school community organizer coordinating shared action',
};

const COMMUTE_LABELS: Record<HouseholdProfile['commuteMode'], string> = {
  car: 'Personal gasoline/hybrid car',
  'public-transit': 'Bus, metro, or rail transit',
  'walk-cycle': 'Walking or cycling',
  remote: 'Mostly home-based / remote work',
};

const HEATING_LABELS: Record<HouseholdProfile['heatingAndCooking'], string> = {
  'gas-stove-furnace': 'Natural gas stove and/or gas furnace',
  'wood-solid-fuel': 'Wood fireplace, pellet stove, or solid-fuel heating',
  'electric-heat-pump': 'All-electric induction stove and heat pump',
};

const GEAR_LABELS: Record<HouseholdProfile['indoorGear'], string> = {
  none: 'No dedicated air purifier yet',
  'diy-corsi-rosenthal': 'DIY box-fan MERV-13 filter (Corsi-Rosenthal box)',
  'hepa-purifiers': 'True HEPA indoor air purifiers',
};

export function buildTailoredPlanPrompt(airData: AirQualityData, profile: HouseholdProfile): string {
  const hourlyBrief = airData.hourly
    .slice(0, 16)
    .map((h) => `${h.hourLabel}: AQI ${h.usAqi} (PM2.5 ${h.pm25} µg/m³, Wind ${h.windKmh} km/h)`)
    .join(' | ');

  return `Generate a tailored winter smog & urban air quality action plan for this household based on their LIVE local telemetry.

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
- Household: ${HOUSEHOLD_LABELS[profile.householdType]}
- Primary Mobility: ${COMMUTE_LABELS[profile.commuteMode]}
- Heating & Cooking: ${HEATING_LABELS[profile.heatingAndCooking]}
- Indoor Filtration: ${GEAR_LABELS[profile.indoorGear]}
- Alert Threshold: ${profile.alertThresholdAqi} US AQI

REQUIREMENTS:
Provide 9 total specific, high-impact recommendations (3 with category "routine", 3 with category "indoor-hack", 3 with category "sustainable-swap").
Every recommendation MUST:
1. Reference this location's actual forecast hours, inversion dynamics, or dominant pollutant (${airData.current.dominantPollutant}), plus the household's specific equipment/lifestyle.
2. Clearly explain BOTH the direct personal health exposure reduction (with realistic µg/m³ or % indoor PM2.5/NO2 reduction) AND the direct community airshed emission impact (how the choice reduces neighborhood pollution during stagnant winter air).
3. Include realistic numeric estimates: estimatedExposureAvoidedUg (number between 2 and 35 representing daily µg/m³ PM2.5-equivalent inhalation exposure avoided) and estimatedWeeklyCo2KgSaved (number between 0 and 28 representing weekly kg CO2e saved, 0 if purely protective indoor hack).
Keep prose crisp, practical, empathetic, and free of jargon.`;
}

export function buildAdvisorSystemInstruction(
  airData?: AirQualityData,
  profile?: HouseholdProfile
): string {
  const contextSummary = airData
    ? `Active Location: ${airData.location.name}, ${airData.location.country}. Live US AQI: ${airData.current.usAqi} (${airData.current.severity}), PM2.5: ${airData.current.pm25} µg/m³, NO2: ${airData.current.no2} µg/m³, Wind: ${airData.current.windKmh} km/h, Temp: ${airData.current.tempC}°C, Inversion Risk: ${airData.current.inversionRisk}. Clean-Air Window: ${
        airData.cleanAirWindow ? `${airData.cleanAirWindow.startHour}-${airData.cleanAirWindow.endHour}` : 'N/A'
      }.`
    : 'No location loaded yet.';

  const profileSummary = profile
    ? `Household: ${profile.householdType}, Mobility: ${profile.commuteMode}, Heating/Cooking: ${profile.heatingAndCooking}, Indoor Gear: ${profile.indoorGear}.`
    : '';

  return `You are ClearAir Civic's family and community air-quality advisor. Help families navigate severe winter smog, urban traffic pollution, indoor air quality, and sustainable low-emission routines.
Always tie advice to the live telemetry and household setup below, and explicitly explain the direct health or community emission impact of any recommendation you give. Keep answers structured, concise, warm, and immediately actionable.
${contextSummary}
${profileSummary}`;
}

export const TAILORED_PLAN_RESPONSE_SCHEMA = {
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
};
