import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFluctuationAlerts,
  classifyAqi,
  computeInversionRisk,
  detectCleanAirWindow,
  determineDominantPollutant,
  isValidCoordinatePair,
} from '../server/airMetrics.ts';
import type { HourlyAirPoint } from '../src/types/air.ts';

function makeHourlySeries(aqiValues: number[], pm25Values?: number[]): HourlyAirPoint[] {
  return aqiValues.map((aqi, idx) => {
    const hour = String(idx % 24).padStart(2, '0');
    return {
      time: `2026-11-27T${hour}:00`,
      hourLabel: `${hour}:00`,
      usAqi: aqi,
      pm25: pm25Values?.[idx] ?? Number((aqi * 0.4).toFixed(1)),
      pm10: Number((aqi * 0.6).toFixed(1)),
      no2: 24,
      ozone: 35,
      tempC: 2,
      windKmh: 5,
    };
  });
}

test('classifyAqi maps EPA thresholds accurately', () => {
  assert.equal(classifyAqi(0), 'Good');
  assert.equal(classifyAqi(50), 'Good');
  assert.equal(classifyAqi(51), 'Moderate');
  assert.equal(classifyAqi(100), 'Moderate');
  assert.equal(classifyAqi(101), 'Sensitive Groups');
  assert.equal(classifyAqi(150), 'Sensitive Groups');
  assert.equal(classifyAqi(151), 'Unhealthy');
  assert.equal(classifyAqi(200), 'Unhealthy');
  assert.equal(classifyAqi(201), 'Very Unhealthy');
  assert.equal(classifyAqi(300), 'Very Unhealthy');
  assert.equal(classifyAqi(301), 'Hazardous');
});

test('computeInversionRisk scores stagnant winter air accurately', () => {
  assert.equal(computeInversionRisk(18, 22, 45, 10), 'Low');
  assert.equal(computeInversionRisk(8, 12, 55, 22), 'Moderate');
  assert.equal(computeInversionRisk(4, 7, 65, 35), 'High');
  assert.equal(computeInversionRisk(-2, 3, 82, 68), 'Severe');
});

test('determineDominantPollutant selects highest ratio relative to health benchmark', () => {
  assert.equal(determineDominantPollutant(60, 80, 30, 40), 'PM2.5 (Fine Particulates)');
  assert.equal(determineDominantPollutant(10, 40, 130, 20), 'NO2 (Traffic & Gas Combustion)');
  assert.equal(determineDominantPollutant(12, 220, 20, 30), 'PM10 (Coarse Dust & Soot)');
});

test('detectCleanAirWindow returns null when fewer than 4 hourly points exist', () => {
  assert.equal(detectCleanAirWindow(makeHourlySeries([90, 85, 80])), null);
});

test('detectCleanAirWindow identifies lowest pollution trough with daytime preference', () => {
  const aqis = Array.from({ length: 24 }, (_, h) => {
    if (h >= 12 && h <= 14) return 62;
    return 145;
  });
  const win = detectCleanAirWindow(makeHourlySeries(aqis));
  assert.ok(win);
  assert.equal(win.startHour, '12:00');
  assert.equal(win.endHour, '14:00');
  assert.equal(win.avgAqi, 62);
});

test('buildFluctuationAlerts triggers Threshold Crossed, Spike Forecast, Inversion Trap, and Clean-Air Window', () => {
  const pm25 = [18, 20, 22, 48, 52, 55, 45, 35, 28, 22, 20, 18];
  const aqis = pm25.map((p) => Math.round(p * 3));
  const hourly = makeHourlySeries(aqis, pm25);
  const cleanWindow = detectCleanAirWindow(hourly);

  const alerts = buildFluctuationAlerts(135, 48.2, 3.8, 'Severe', hourly, 100, cleanWindow);
  const kinds = alerts.map((a) => a.kind);

  assert.ok(kinds.includes('Threshold Crossed'));
  assert.ok(kinds.includes('Spike Forecast'));
  assert.ok(kinds.includes('Inversion Trap'));
  assert.ok(kinds.includes('Clean-Air Window'));
});

test('isValidCoordinatePair validates bounds and finite values', () => {
  assert.equal(isValidCoordinatePair(40.76, -111.89), true);
  assert.equal(isValidCoordinatePair(91, 0), false);
  assert.equal(isValidCoordinatePair(0, -181), false);
  assert.equal(isValidCoordinatePair(Number.NaN, 10), false);
});
