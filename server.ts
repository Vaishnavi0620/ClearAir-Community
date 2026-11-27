import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { ThinkingLevel } from '@google/genai';
import {
  buildFluctuationAlerts,
  classifyAqi,
  computeInversionRisk,
  detectCleanAirWindow,
  determineDominantPollutant,
  isValidCoordinatePair,
} from './server/airMetrics.ts';
import {
  buildAdvisorSystemInstruction,
  buildTailoredPlanPrompt,
  generateWithFallback,
  getGeminiClient,
  parseGeminiError,
  TAILORED_PLAN_RESPONSE_SCHEMA,
} from './server/geminiService.ts';
import type {
  AirQualityData,
  GroundingSource,
  HouseholdProfile,
  HourlyAirPoint,
} from './src/types/air.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(express.json({ limit: '1mb' }));

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

  app.get('/api/locations/reverse', async (req: Request, res: Response) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (req.query.lat === undefined || req.query.lon === undefined || !isValidCoordinatePair(lat, lon)) {
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

  app.get('/api/air-quality', async (req: Request, res: Response) => {
    try {
      const hasCustomCoords = req.query.lat !== undefined || req.query.lon !== undefined;
      const lat = Number(req.query.lat ?? 40.7608);
      const lon = Number(req.query.lon ?? -111.891);
      const name = String(req.query.name ?? (hasCustomCoords ? 'Local Area' : 'Salt Lake City'));
      const region = String(req.query.region ?? (hasCustomCoords ? '' : 'Utah'));
      const country = String(req.query.country ?? (hasCustomCoords ? '' : 'United States'));
      const timezone = String(req.query.timezone || 'auto');
      const thresholdAqi = Number(req.query.threshold ?? 100);

      if (!isValidCoordinatePair(lat, lon)) {
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
        Number.isFinite(thresholdAqi) ? thresholdAqi : 100,
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

  app.post('/api/assistant/plan', async (req: Request, res: Response) => {
    try {
      const { airData, profile } = req.body as {
        airData?: AirQualityData;
        profile?: HouseholdProfile;
      };

      if (!airData?.current || !airData?.location || !profile?.householdType) {
        res.status(400).json({ error: 'Both airData and household profile are required.' });
        return;
      }

      const ai = getGeminiClient();
      const prompt = buildTailoredPlanPrompt(airData, profile);

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
              responseSchema: TAILORED_PLAN_RESPONSE_SCHEMA,
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
      const systemInstruction = buildAdvisorSystemInstruction(airData, profile);

      const contents = [
        ...(history || []).slice(-8).map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        {
          role: 'user',
          parts: [{ text: message.trim() }],
        },
      ];

      const response = await generateWithFallback(
        (model, allowSearch) =>
          ai.models.generateContent({
            model,
            contents,
            config: {
              systemInstruction,
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

  return app;
}

async function startServer() {
  const app = createApp();
  const PORT = Number(process.env.PORT) || 3000;

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

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  startServer();
}
