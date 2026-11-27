import type {
  AqiSeverity,
  CleanAirWindow,
  FluctuationAlert,
  HourlyAirPoint,
  InversionRisk,
} from '../src/types/air.ts';

export function classifyAqi(usAqi: number): AqiSeverity {
  if (usAqi <= 50) return 'Good';
  if (usAqi <= 100) return 'Moderate';
  if (usAqi <= 150) return 'Sensitive Groups';
  if (usAqi <= 200) return 'Unhealthy';
  if (usAqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

export function computeInversionRisk(
  tempC: number,
  windKmh: number,
  humidityPct: number,
  pm25: number
): InversionRisk {
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

export function determineDominantPollutant(
  pm25: number,
  pm10: number,
  no2: number,
  ozone: number
): string {
  const ratios = [
    { name: 'PM2.5 (Fine Particulates)', ratio: pm25 / 35 },
    { name: 'PM10 (Coarse Dust & Soot)', ratio: pm10 / 150 },
    { name: 'NO2 (Traffic & Gas Combustion)', ratio: no2 / 100 },
    { name: 'O3 (Ground-Level Ozone)', ratio: ozone / 100 },
  ];
  ratios.sort((a, b) => b.ratio - a.ratio);
  return ratios[0]?.name ?? 'PM2.5 (Fine Particulates)';
}

export function detectCleanAirWindow(hourly: HourlyAirPoint[]): CleanAirWindow | null {
  if (hourly.length < 4) return null;
  const next24 = hourly.slice(0, 24);
  let bestIdx = 0;
  let bestAvg = Infinity;

  // Prefer daytime ventilation windows between 10:00 and 17:00 when air quality is comparable
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

export function buildFluctuationAlerts(
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

export function isValidCoordinatePair(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}
