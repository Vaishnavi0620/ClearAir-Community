import { useState } from 'react';
import { AlertTriangle, CheckCircle2, CloudFog, ShieldAlert, Thermometer, Wind } from 'lucide-react';
import type { AirQualityData, HourlyAirPoint } from '../types/air';
import { formatTimeShort, getSeverityStyle } from '../utils/aqi';

interface AirTelemetryPanelProps {
  data: AirQualityData | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function AirTelemetryPanel({ data, isLoading, error, onRetry }: AirTelemetryPanelProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [metricMode, setMetricMode] = useState<'aqi' | 'pm25'>('aqi');

  if (isLoading && !data) {
    return (
      <section id="monitor" className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="animate-pulse space-y-5">
          <div className="h-6 w-64 rounded bg-slate-200" />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="h-56 rounded-lg bg-slate-100 lg:col-span-5" />
            <div className="h-56 rounded-lg bg-slate-100 lg:col-span-7" />
          </div>
        </div>
      </section>
    );
  }

  if (error && !data) {
    return (
      <section id="monitor" className="rounded-xl border border-rose-200 bg-white p-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold text-rose-800">Unable to load live air telemetry</h2>
            <p className="mt-1 text-sm text-slate-600">{error}</p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
          >
            Retry Connection
          </button>
        </div>
      </section>
    );
  }

  if (!data) return null;

  const style = getSeverityStyle(data.current.severity);
  const hourly = data.hourly.slice(0, 24);
  const activePoint: HourlyAirPoint | null =
    hoverIdx !== null && hourly[hoverIdx] ? hourly[hoverIdx] : hourly[0] || null;

  // SVG Chart dimensions
  const width = 680;
  const height = 220;
  const padLeft = 40;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 30;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const values = hourly.map((p) => (metricMode === 'aqi' ? p.usAqi : p.pm25));
  const maxVal = Math.max(...values, metricMode === 'aqi' ? 160 : 65);
  const minVal = 0;

  const getX = (idx: number) =>
    hourly.length <= 1 ? padLeft : padLeft + (idx / (hourly.length - 1)) * plotW;
  const getY = (val: number) =>
    padTop + plotH - ((val - minVal) / (maxVal - minVal || 1)) * plotH;

  const linePath = hourly
    .map((pt, i) => {
      const val = metricMode === 'aqi' ? pt.usAqi : pt.pm25;
      return `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(val).toFixed(1)}`;
    })
    .join(' ');

  const areaPath =
    hourly.length > 0
      ? `${linePath} L ${getX(hourly.length - 1).toFixed(1)} ${(padTop + plotH).toFixed(1)} L ${getX(0).toFixed(
          1
        )} ${(padTop + plotH).toFixed(1)} Z`
      : '';

  // Clean-air window highlight range in chart
  let windowStartIdx = -1;
  let windowEndIdx = -1;
  if (data.cleanAirWindow) {
    windowStartIdx = hourly.findIndex((h) => h.hourLabel === data.cleanAirWindow?.startHour);
    windowEndIdx = hourly.findIndex((h) => h.hourLabel === data.cleanAirWindow?.endHour);
  }

  const SeverityIcon =
    data.current.usAqi <= 50
      ? CheckCircle2
      : data.current.usAqi <= 150
      ? AlertTriangle
      : ShieldAlert;

  return (
    <section id="monitor" className="rounded-xl border border-slate-200 bg-white">
      {/* Top Location & Timestamp Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl text-balance">
            {data.location.name}
            {data.location.region ? `, ${data.location.region}` : ''}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{data.location.country}</span>
            <span aria-hidden="true">·</span>
            <span>Updated {formatTimeShort(data.fetchedAt)}</span>
            <span aria-hidden="true">·</span>
            <span>Dominant: {data.current.dominantPollutant}</span>
          </div>
        </div>

        <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${style.surfaceClass} ${style.borderClass}`}>
          <SeverityIcon className={`h-4 w-4 ${style.textClass}`} aria-hidden="true" />
          <span className={`text-xs font-semibold ${style.textClass}`}>
            {data.current.severity}
          </span>
        </div>
      </div>

      {/* Main Split: Telemetry Summary + 24h Forecast Chart */}
      <div className="grid grid-cols-1 divide-y divide-slate-200 lg:grid-cols-12 lg:divide-x lg:divide-y-0">
        {/* Left: Core Live Metrics */}
        <div className="p-6 lg:col-span-5">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-500">Live US Air Quality Index</p>
              <div className="mt-1 flex items-baseline gap-2.5">
                <span className="font-mono text-5xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {data.current.usAqi}
                </span>
                <span className="font-mono text-xs font-medium text-slate-500">US AQI</span>
              </div>
            </div>

            <div className="text-right">
              <p className="text-xs font-medium text-slate-500">Fine Particulates</p>
              <div className="mt-1 flex items-baseline justify-end gap-1.5">
                <span className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                  {data.current.pm25.toFixed(1)}
                </span>
                <span className="font-mono text-xs text-slate-500">µg/m³</span>
              </div>
            </div>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-slate-600">{style.summary}</p>

          {/* Atmospheric & Inversion Strip */}
          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-200 pt-4">
            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <CloudFog className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                <span>Inversion Risk</span>
              </div>
              <p className="mt-1 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                {data.current.inversionRisk}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Wind className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                <span>Surface Wind</span>
              </div>
              <p className="mt-1 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                {data.current.windKmh.toFixed(1)} km/h
              </p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Thermometer className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                <span>Temp / RH</span>
              </div>
              <p className="mt-1 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                {data.current.tempC.toFixed(0)}°C · {data.current.humidityPct}%
              </p>
            </div>
          </div>

          {/* Detailed Pollutant Readout */}
          <div className="mt-5 grid grid-cols-4 gap-3 border-t border-slate-200 pt-4">
            <div>
              <span className="block text-xs text-slate-500">PM10</span>
              <span className="mt-0.5 block font-mono text-sm font-semibold text-slate-900 tabular-nums">
                {data.current.pm10.toFixed(1)}
              </span>
              <span className="font-mono text-[11px] text-slate-400">µg/m³</span>
            </div>
            <div>
              <span className="block text-xs text-slate-500">NO₂</span>
              <span className="mt-0.5 block font-mono text-sm font-semibold text-slate-900 tabular-nums">
                {data.current.no2.toFixed(1)}
              </span>
              <span className="font-mono text-[11px] text-slate-400">µg/m³</span>
            </div>
            <div>
              <span className="block text-xs text-slate-500">Ozone</span>
              <span className="mt-0.5 block font-mono text-sm font-semibold text-slate-900 tabular-nums">
                {data.current.ozone.toFixed(0)}
              </span>
              <span className="font-mono text-[11px] text-slate-400">µg/m³</span>
            </div>
            <div>
              <span className="block text-xs text-slate-500">EU AQI</span>
              <span className="mt-0.5 block font-mono text-sm font-semibold text-slate-900 tabular-nums">
                {data.current.europeanAqi}
              </span>
              <span className="font-mono text-[11px] text-slate-400">Index</span>
            </div>
          </div>
        </div>

        {/* Right: 24-Hour Smog & Inversion Forecast Chart */}
        <div className="p-6 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">24-Hour Smog & Dispersion Trajectory</h2>
              <p className="text-xs text-slate-500">
                Hover curve to inspect hourly particulate surges and clean-air ventilation windows
              </p>
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setMetricMode('aqi')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  metricMode === 'aqi' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                US AQI
              </button>
              <button
                type="button"
                onClick={() => setMetricMode('pm25')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  metricMode === 'pm25' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                PM2.5 (µg/m³)
              </button>
            </div>
          </div>

          {/* Interactive SVG Chart */}
          <div className="mt-4">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-auto cursor-crosshair select-none overflow-visible"
              role="img"
              aria-label="24-hour localized air quality forecast chart"
              onMouseLeave={() => setHoverIdx(null)}
            >
              {/* Horizontal Reference Grid Lines */}
              {[0.25, 0.5, 0.75, 1].map((ratio) => {
                const val = Math.round(minVal + (maxVal - minVal) * ratio);
                const y = getY(val);
                return (
                  <g key={ratio}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={width - padRight}
                      y2={y}
                      stroke="#E2E8F0"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={padLeft - 8}
                      y={y + 4}
                      textAnchor="end"
                      className="fill-slate-400 font-mono text-[10px]"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {/* Threshold Guide Line (AQI 100 or PM2.5 35) */}
              {((metricMode === 'aqi' && maxVal >= 100) || (metricMode === 'pm25' && maxVal >= 35)) && (
                <g>
                  <line
                    x1={padLeft}
                    y1={getY(metricMode === 'aqi' ? 100 : 35)}
                    x2={width - padRight}
                    y2={getY(metricMode === 'aqi' ? 100 : 35)}
                    stroke="#D97706"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={width - padRight}
                    y={getY(metricMode === 'aqi' ? 100 : 35) - 5}
                    textAnchor="end"
                    className="fill-amber-700 font-mono text-[10px]"
                  >
                    {metricMode === 'aqi' ? '100 AQI Advisory' : '35 µg/m³ 24h Limit'}
                  </text>
                </g>
              )}

              {/* Clean-Air Ventilation Window Shading */}
              {windowStartIdx >= 0 && windowEndIdx > windowStartIdx && (
                <rect
                  x={getX(windowStartIdx)}
                  y={padTop}
                  width={Math.max(12, getX(windowEndIdx) - getX(windowStartIdx))}
                  height={plotH}
                  fill="#0F766E"
                  fillOpacity="0.09"
                />
              )}

              {/* Area + Curve */}
              {areaPath && <path d={areaPath} fill={style.strokeHex} fillOpacity="0.1" />}
              {linePath && (
                <path
                  d={linePath}
                  fill="none"
                  stroke={style.strokeHex}
                  strokeWidth="2.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* X-Axis Hour Labels every 4 hours */}
              {hourly.map((pt, i) => {
                if (i % 4 !== 0 && i !== hourly.length - 1) return null;
                return (
                  <text
                    key={pt.time}
                    x={getX(i)}
                    y={height - 6}
                    textAnchor="middle"
                    className="fill-slate-400 font-mono text-[10px]"
                  >
                    {pt.hourLabel}
                  </text>
                );
              })}

              {/* Hover Crosshair & Active Point */}
              {hoverIdx !== null && hourly[hoverIdx] && (
                <g>
                  <line
                    x1={getX(hoverIdx)}
                    y1={padTop}
                    x2={getX(hoverIdx)}
                    y2={padTop + plotH}
                    stroke="#475569"
                    strokeWidth="1"
                  />
                  <circle
                    cx={getX(hoverIdx)}
                    cy={getY(metricMode === 'aqi' ? hourly[hoverIdx].usAqi : hourly[hoverIdx].pm25)}
                    r="4.5"
                    fill="#FFFFFF"
                    stroke={style.strokeHex}
                    strokeWidth="2.5"
                  />
                </g>
              )}

              {/* Invisible Hit Columns */}
              {hourly.map((pt, i) => {
                const colW = plotW / Math.max(hourly.length - 1, 1);
                return (
                  <rect
                    key={pt.time}
                    x={getX(i) - colW / 2}
                    y={padTop}
                    width={colW}
                    height={plotH}
                    fill="transparent"
                    onMouseEnter={() => setHoverIdx(i)}
                  />
                );
              })}
            </svg>
          </div>

          {/* Live Readout Strip Under Chart */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs">
            {activePoint ? (
              <div className="flex flex-wrap items-center gap-3 font-mono text-slate-700 tabular-nums">
                <span className="font-semibold text-slate-900">{activePoint.hourLabel}</span>
                <span aria-hidden="true">·</span>
                <span>AQI {activePoint.usAqi}</span>
                <span aria-hidden="true">·</span>
                <span>PM2.5 {activePoint.pm25.toFixed(1)} µg/m³</span>
                <span aria-hidden="true">·</span>
                <span>Wind {activePoint.windKmh.toFixed(1)} km/h</span>
                <span aria-hidden="true">·</span>
                <span>{activePoint.tempC.toFixed(0)}°C</span>
              </div>
            ) : (
              <span className="text-slate-500">Hourly forecast loaded</span>
            )}

            {data.cleanAirWindow && (
              <div className="flex items-center gap-1.5 text-teal-800">
                <span className="inline-block h-2.5 w-2.5 rounded-xs bg-teal-700/25 border border-teal-700" aria-hidden="true" />
                <span>
                  Ventilation window: <strong className="font-mono tabular-nums">{data.cleanAirWindow.startHour}–{data.cleanAirWindow.endHour}</strong>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
