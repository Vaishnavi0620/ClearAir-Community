import { AlertTriangle, CheckCircle2, CloudFog, ShieldAlert, Thermometer, Wind } from 'lucide-react';
import type { AirQualityData } from '../types/air';
import { formatTimeShort, getSeverityStyle } from '../utils/aqi';
import { HourlyForecastChart } from './HourlyForecastChart';

interface AirTelemetryPanelProps {
  data: AirQualityData | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function AirTelemetryPanel({ data, isLoading, error, onRetry }: AirTelemetryPanelProps) {
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
  const SeverityIcon =
    data.current.usAqi <= 50
      ? CheckCircle2
      : data.current.usAqi <= 150
      ? AlertTriangle
      : ShieldAlert;

  return (
    <section id="monitor" className="rounded-xl border border-slate-200 bg-white">
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
          <span className={`text-xs font-semibold ${style.textClass}`}>{data.current.severity}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 divide-y divide-slate-200 lg:grid-cols-12 lg:divide-x lg:divide-y-0">
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

        <HourlyForecastChart
          hourly={data.hourly}
          cleanAirWindow={data.cleanAirWindow}
          strokeHex={style.strokeHex}
        />
      </div>
    </section>
  );
}
