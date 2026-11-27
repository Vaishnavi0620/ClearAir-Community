import test from 'node:test';
import assert from 'node:assert/strict';
import { mapOpenMeteoToSnapshot } from '../server/openMeteoClient.ts';

test('mapOpenMeteoToSnapshot maps hourly telemetry, inversion risk, and alerts cleanly', () => {
  const times = Array.from({ length: 24 }, (_, idx) => `2026-11-27T${String(idx).padStart(2, '0')}:00`);
  const aqJson = {
    timezone: 'America/Denver',
    current: {
      time: '2026-11-27T08:00',
      us_aqi: 158,
      european_aqi: 82,
      pm10: 74.2,
      pm2_5: 62.5,
      carbon_monoxide: 610,
      nitrogen_dioxide: 48.0,
      sulphur_dioxide: 3.4,
      ozone: 18.0,
    },
    hourly: {
      time: times,
      us_aqi: times.map((_, idx) => (idx >= 12 && idx <= 14 ? 75 : 155)),
      pm10: times.map(() => 70),
      pm2_5: times.map((_, idx) => (idx >= 12 && idx <= 14 ? 22 : idx >= 17 ? 68 : 45)),
      nitrogen_dioxide: times.map(() => 40),
      ozone: times.map(() => 20),
    },
  };

  const weatherJson = {
    current: {
      temperature_2m: 1.2,
      relative_humidity_2m: 80,
      wind_speed_10m: 3.5,
      surface_pressure: 1024,
    },
    hourly: {
      time: times,
      temperature_2m: times.map(() => 1.5),
      wind_speed_10m: times.map(() => 4.0),
    },
  };

  const snapshot = mapOpenMeteoToSnapshot(
    aqJson,
    weatherJson,
    {
      name: 'Salt Lake City',
      region: 'Utah',
      country: 'United States',
      latitude: 40.7608,
      longitude: -111.891,
      timezone: 'America/Denver',
    },
    100
  );

  assert.equal(snapshot.location.name, 'Salt Lake City');
  assert.equal(snapshot.current.usAqi, 158);
  assert.equal(snapshot.current.severity, 'Unhealthy');
  assert.equal(snapshot.current.inversionRisk, 'Severe');
  assert.equal(snapshot.hourly.length, 16); // from 08:00 to 23:00
  assert.equal(snapshot.hourly[0]?.hourLabel, '08:00');
  assert.ok(snapshot.cleanAirWindow);
  assert.equal(snapshot.cleanAirWindow.startHour, '12:00');
  assert.ok(snapshot.alerts.some((a) => a.kind === 'Threshold Crossed'));
  assert.ok(snapshot.alerts.some((a) => a.kind === 'Inversion Trap'));
});
