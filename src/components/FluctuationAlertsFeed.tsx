import { useState } from 'react';
import { AlertTriangle, Bell, BellRing, Info, ShieldAlert, Zap } from 'lucide-react';
import type { FluctuationAlert } from '../types/air';

interface FluctuationAlertsFeedProps {
  alerts: FluctuationAlert[];
  thresholdAqi: number;
  autoRefreshMinutes: number;
  onChangeAutoRefresh: (mins: number) => void;
  notificationsEnabled: boolean;
  onToggleNotifications: () => void;
  locationName: string;
}

export function FluctuationAlertsFeed({
  alerts,
  thresholdAqi,
  autoRefreshMinutes,
  onChangeAutoRefresh,
  notificationsEnabled,
  onToggleNotifications,
  locationName,
}: FluctuationAlertsFeedProps) {
  const [simulatedAlert, setSimulatedAlert] = useState<FluctuationAlert | null>(null);

  const handleToggleSimulation = () => {
    if (simulatedAlert) {
      setSimulatedAlert(null);
      return;
    }
    setSimulatedAlert({
      id: 'sim-spike-alert',
      severity: 'critical',
      kind: 'Simulated Spike',
      title: `Sudden localized PM2.5 plume detected near ${locationName}`,
      timeWindow: 'Immediate · Next 90 min',
      deltaSummary: '+48% spike (projected 178 US AQI)',
      explanation:
        'Test alert: Evening rush-hour exhaust combined with stagnant 2.4 km/h winds is concentrating fine particulates along street corridors.',
      immediateAction:
        'Close street-facing windows, switch HVAC to recirculate mode, run bedroom HEPA/DIY filter on high, and delay outdoor runs.',
    });
  };

  const displayAlerts = simulatedAlert ? [simulatedAlert, ...alerts] : alerts;

  return (
    <section id="alerts" className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">Real-Time Air Fluctuation Alerts</h2>
          <p className="text-xs text-slate-500">
            Monitors hourly PM2.5 surges, thermal inversion traps, and crossings above{' '}
            <span className="font-mono font-medium text-slate-700 tabular-nums">{thresholdAqi} US AQI</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Alert refresh interval">
            {[
              { label: 'Manual', value: 0 },
              { label: '5m Poll', value: 5 },
              { label: '15m Poll', value: 15 },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={autoRefreshMinutes === opt.value}
                onClick={() => onChangeAutoRefresh(opt.value)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  autoRefreshMinutes === opt.value
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            aria-pressed={notificationsEnabled}
            onClick={onToggleNotifications}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              notificationsEnabled
                ? 'border-teal-700 bg-teal-50 text-teal-800'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {notificationsEnabled ? (
              <BellRing className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
            ) : (
              <Bell className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
            )}
            <span>{notificationsEnabled ? 'Browser Alerts On' : 'Enable Alerts'}</span>
          </button>

          <button
            type="button"
            aria-pressed={Boolean(simulatedAlert)}
            onClick={handleToggleSimulation}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              simulatedAlert
                ? 'border-rose-300 bg-rose-50 text-rose-800'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Zap className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{simulatedAlert ? 'Clear Test Spike' : 'Test Spike Alert'}</span>
          </button>
        </div>
      </div>

      <div aria-live="polite">
      {displayAlerts.length === 0 ? (
        <div className="px-6 py-8 text-center">
          <p className="text-sm font-medium text-slate-800">No abrupt air quality spikes detected</p>
          <p className="mt-1 text-xs text-slate-500">
            Hourly PM2.5 levels remain below your {thresholdAqi} US AQI alert threshold over the next 18 hours.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {displayAlerts.map((alert) => {
            const Icon =
              alert.severity === 'critical'
                ? ShieldAlert
                : alert.severity === 'warning'
                ? AlertTriangle
                : Info;

            const iconColor =
              alert.severity === 'critical'
                ? 'text-rose-700'
                : alert.severity === 'warning'
                ? 'text-amber-700'
                : 'text-teal-700';

            const bgTint =
              alert.severity === 'critical'
                ? 'bg-rose-50/40'
                : alert.severity === 'warning'
                ? 'bg-amber-50/35'
                : 'bg-white';

            return (
              <div key={alert.id} className={`px-6 py-4 ${bgTint}`}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex items-start gap-3">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} aria-hidden="true" />
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className={`font-semibold ${iconColor}`}>{alert.kind}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{alert.timeWindow}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono font-medium text-slate-700 tabular-nums">{alert.deltaSummary}</span>
                      </div>
                      <h3 className="mt-1 text-sm font-semibold text-slate-900">{alert.title}</h3>
                      <p className="mt-1 text-sm text-slate-600">{alert.explanation}</p>
                    </div>
                  </div>

                  <div className="shrink-0 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 lg:max-w-xs">
                    <span className="block text-[11px] font-semibold text-slate-500">Immediate Action</span>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-800">{alert.immediateAction}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>
    </section>
  );
}
