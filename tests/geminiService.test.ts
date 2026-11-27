import test from 'node:test';
import assert from 'node:assert/strict';
import type { GenerateContentResponse } from '@google/genai';
import {
  buildAdvisorSystemInstruction,
  buildTailoredPlanPrompt,
  generateWithFallback,
  parseGeminiError,
} from '../server/geminiService.ts';
import type { AirQualityData, HouseholdProfile } from '../src/types/air.ts';

const sampleAirData: AirQualityData = {
  location: {
    id: '40.761,-111.891',
    name: 'Salt Lake City',
    region: 'Utah',
    country: 'United States',
    latitude: 40.7608,
    longitude: -111.891,
    timezone: 'America/Denver',
  },
  fetchedAt: '2026-11-27T12:00:00.000Z',
  current: {
    usAqi: 142,
    europeanAqi: 78,
    severity: 'Sensitive Groups',
    pm25: 52.4,
    pm10: 68.1,
    no2: 44.2,
    ozone: 22.0,
    co: 520,
    so2: 4.1,
    tempC: -1.5,
    humidityPct: 79,
    windKmh: 4.2,
    pressureHpa: 1022,
    inversionRisk: 'Severe',
    dominantPollutant: 'PM2.5 (Fine Particulates)',
  },
  hourly: [
    {
      time: '2026-11-27T12:00',
      hourLabel: '12:00',
      usAqi: 142,
      pm25: 52.4,
      pm10: 68.1,
      no2: 44.2,
      ozone: 22,
      tempC: -1.5,
      windKmh: 4.2,
    },
  ],
  cleanAirWindow: {
    startHour: '14:00',
    endHour: '16:00',
    avgAqi: 96,
    avgPm25: 33.8,
    description: 'Afternoon dip',
  },
  alerts: [],
};

const sampleProfile: HouseholdProfile = {
  householdType: 'family-kids',
  commuteMode: 'car',
  heatingAndCooking: 'gas-stove-furnace',
  indoorGear: 'diy-corsi-rosenthal',
  alertThresholdAqi: 100,
};

test('parseGeminiError extracts 429 quota error into clean user-facing message', () => {
  const rawErr = new Error(
    '{"error":{"code":429,"message":"You exceeded your current quota","status":"RESOURCE_EXHAUSTED"}}'
  );
  const parsed = parseGeminiError(rawErr);
  assert.equal(parsed.status, 429);
  assert.equal(parsed.isQuota, true);
  assert.ok(parsed.message.includes('Settings > Secrets'));
  assert.ok(!parsed.message.startsWith('{'));
});

test('parseGeminiError classifies 403 permission errors cleanly', () => {
  const parsed = parseGeminiError(new Error('PERMISSION_DENIED: invalid key'));
  assert.equal(parsed.status, 403);
  assert.equal(parsed.isQuota, false);
  assert.ok(parsed.message.includes('API key'));
});

test('buildTailoredPlanPrompt embeds live telemetry and household equipment', () => {
  const prompt = buildTailoredPlanPrompt(sampleAirData, sampleProfile);
  assert.ok(prompt.includes('Salt Lake City, Utah, United States'));
  assert.ok(prompt.includes('142'));
  assert.ok(prompt.includes('52.4 µg/m³'));
  assert.ok(prompt.includes('Severe'));
  assert.ok(prompt.includes('Corsi-Rosenthal'));
});

test('buildAdvisorSystemInstruction includes active location and clean-air window', () => {
  const instruction = buildAdvisorSystemInstruction(sampleAirData, sampleProfile);
  assert.ok(instruction.includes('Salt Lake City'));
  assert.ok(instruction.includes('14:00-16:00'));
  assert.ok(instruction.includes('gas-stove-furnace'));
});

test('generateWithFallback falls back to gemini-3.1-flash-lite on 429 error', async () => {
  const calledModels: string[] = [];
  const res = await generateWithFallback(
    async (model) => {
      calledModels.push(model);
      if (model === 'gemini-4-hydrogen') {
        throw new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}');
      }
      return { text: 'ok' } as GenerateContentResponse;
    },
    true,
    0
  );

  assert.equal(res.text, 'ok');
  assert.deepEqual(calledModels, ['gemini-4-hydrogen', 'gemini-3.1-flash-lite']);
});

test('generateWithFallback does not retry non-quota 400 errors', async () => {
  let attempts = 0;
  await assert.rejects(
    () =>
      generateWithFallback(
        async () => {
          attempts += 1;
          throw new Error('{"error":{"code":400,"message":"Invalid argument"}}');
        },
        false,
        0
      ),
    /Invalid argument/
  );
  assert.equal(attempts, 1);
});
