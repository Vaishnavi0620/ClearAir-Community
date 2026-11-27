import { useState } from 'react';
import type { CleanAirWindow, HourlyAirPoint } from '../types/air';

interface HourlyForecastChartProps {
  hourly: HourlyAirPoint[];
  cleanAirWindow: CleanAirWindow | null;
  strokeHex: string;
}

export function HourlyForecastChart({
  hourly,
  cleanAirWindow,
  strokeHex,
}: HourlyForecastChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [metricMode, setMetricMode] = useState<'aqi' | 'pm25'>('aqi');

  const series = hourly.slice(0, 24);
  const activePoint: HourlyAirPoint | null =
    hoverIdx !== null && series[hoverIdx] ? series[hoverIdx] : series[0] ?? null;

  const width = 680;
  const height = 220;
  const padLeft = 40;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 30;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const values = series.map((p) => (metricMode === 'aqi' ? p.usAqi : p.pm25));
  const maxVal = Math.max(...values, metricMode === 'aqi' ? 160 : 65);
  const minVal = 0;

  const getX = (idx: number) =>
    series.length <= 1 ? padLeft : padLeft + (idx / (series.length - 1)) * plotW;
  const getY = (val: number) =>
    padTop + plotH - ((val - minVal) / (maxVal - minVal || 1)) * plotH;

  const linePath = series
    .map((pt, i) => {
      const val = metricMode === 'aqi' ? pt.usAqi : pt.pm25;
      return `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(val).toFixed(1)}`;
    })
    .join(' ');

  const areaPath =
    series.length > 0
      ? `${linePath} L ${getX(series.length - 1).toFixed(1)} ${(padTop + plotH).toFixed(1)} L ${getX(
          0
        ).toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`
      : '';

  let windowStartIdx = -1;
  let windowEndIdx = -1;
  if (cleanAirWindow) {
    windowStartIdx = series.findIndex((h) => h.hourLabel === cleanAirWindow.startHour);
    windowEndIdx = series.findIndex((h) => h.hourLabel === cleanAirWindow.endHour);
  }

  return (
    <div className="p-6 lg:col-span-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">24-Hour Smog & Dispersion Trajectory</h2>
          <p className="text-xs text-slate-500">
            Hover or use arrow keys on the chart to inspect hourly surges and clean-air windows
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Forecast metric">
          <button
            type="button"
            aria-pressed={metricMode === 'aqi'}
            onClick={() => setMetricMode('aqi')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              metricMode === 'aqi' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            US AQI
          </button>
          <button
            type="button"
            aria-pressed={metricMode === 'pm25'}
            onClick={() => setMetricMode('pm25')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              metricMode === 'pm25' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            PM2.5 (µg/m³)
          </button>
        </div>
      </div>

      <div className="mt-4">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          tabIndex={0}
          className="w-full h-auto cursor-crosshair select-none overflow-visible focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 rounded-md"
          role="img"
          aria-label="24-hour localized air quality forecast chart. Use Left and Right arrow keys to inspect hourly points."
          onMouseLeave={() => setHoverIdx(null)}
          onKeyDown={(e) => {
            if (series.length === 0) return;
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              setHoverIdx((prev) => (prev === null ? 0 : Math.min(series.length - 1, prev + 1)));
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              setHoverIdx((prev) => (prev === null ? series.length - 1 : Math.max(0, prev - 1)));
            }
          }}
        >
          {[0.25, 0.5, 0.75, 1].map((ratio) => {
            const val = Math.round(minVal + (maxVal - minVal) * ratio);
            const y = getY(val);
            return (
              <g key={ratio}>
                <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#E2E8F0" strokeDasharray="3 3" />
                <text x={padLeft - 8} y={y + 4} textAnchor="end" className="fill-slate-400 font-mono text-[10px]">
                  {val}
                </text>
              </g>
            );
          })}

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

          {areaPath && <path d={areaPath} fill={strokeHex} fillOpacity="0.1" />}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke={strokeHex}
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {series.map((pt, i) => {
            if (i % 4 !== 0 && i !== series.length - 1) return null;
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

          {hoverIdx !== null && series[hoverIdx] && (
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
                cy={getY(metricMode === 'aqi' ? series[hoverIdx].usAqi : series[hoverIdx].pm25)}
                r="4.5"
                fill="#FFFFFF"
                stroke={strokeHex}
                strokeWidth="2.5"
              />
            </g>
          )}

          {series.map((pt, i) => {
            const colW = plotW / Math.max(series.length - 1, 1);
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

        {cleanAirWindow && (
          <div className="flex items-center gap-1.5 text-teal-800">
            <span className="inline-block h-2.5 w-2.5 rounded-xs bg-teal-700/25 border border-teal-700" aria-hidden="true" />
            <span>
              Ventilation window:{' '}
              <strong className="font-mono tabular-nums">
                {cleanAirWindow.startHour}–{cleanAirWindow.endHour}
              </strong>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
