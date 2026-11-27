import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { ThinkingLevel } from '@google/genai';
import { isValidCoordinatePair } from './server/airMetrics.ts';
import {
  buildAdvisorSystemInstruction,
  buildTailoredPlanPrompt,
  generateWithFallback,
  getGeminiClient,
  parseGeminiError,
  TAILORED_PLAN_RESPONSE_SCHEMA,
} from './server/geminiService.ts';
import {
  fetchAirQualitySnapshot,
  reverseGeocodeLocation,
  searchLocations,
} from './server/openMeteoClient.ts';
import type {
  AirQualityData,
  GroundingSource,
  HouseholdProfile,
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
      const query = String(req.query.q ?? '').trim();
      if (query.length < 2) {
        res.json({ results: [] });
        return;
      }
      const results = await searchLocations(query);
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
    const location = await reverseGeocodeLocation(lat, lon);
    res.json({ location });
  });

  app.get('/api/air-quality', async (req: Request, res: Response) => {
    try {
      const hasCustomCoords = req.query.lat !== undefined || req.query.lon !== undefined;
      const lat = Number(req.query.lat ?? 40.7608);
      const lon = Number(req.query.lon ?? -111.891);
      const name = String(req.query.name ?? (hasCustomCoords ? 'Local Area' : 'Salt Lake City'));
      const region = String(req.query.region ?? (hasCustomCoords ? '' : 'Utah'));
      const country = String(req.query.country ?? (hasCustomCoords ? '' : 'United States'));
      const timezone = String(req.query.timezone ?? 'auto');
      const rawThreshold = Number(req.query.threshold ?? 100);
      const thresholdAqi = Number.isFinite(rawThreshold) ? rawThreshold : 100;

      if (!isValidCoordinatePair(lat, lon)) {
        res.status(400).json({ error: 'Invalid coordinates provided.' });
        return;
      }

      const payload = await fetchAirQualitySnapshot(
        { name, region, country, latitude: lat, longitude: lon, timezone },
        thresholdAqi
      );
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
      const parsed = JSON.parse(rawText) as Record<string, unknown>;
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

      if (typeof message !== 'string' || !message.trim()) {
        res.status(400).json({ error: 'Message cannot be empty.' });
        return;
      }

      const sanitizedHistory = Array.isArray(history)
        ? history
            .filter(
              (item): item is { role: 'user' | 'assistant'; content: string } =>
                Boolean(item) &&
                (item.role === 'user' || item.role === 'assistant') &&
                typeof item.content === 'string' &&
                item.content.trim().length > 0
            )
            .slice(-8)
        : [];

      const ai = getGeminiClient();
      const systemInstruction = buildAdvisorSystemInstruction(airData, profile);

      const contents = [
        ...sanitizedHistory.map((m) => ({
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
  void startServer();
}
