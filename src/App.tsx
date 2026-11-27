/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AirTelemetryPanel } from './components/AirTelemetryPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FluctuationAlertsFeed } from './components/FluctuationAlertsFeed';
import { ImpactSimulator } from './components/ImpactSimulator';
import { LocationAndProfileBar } from './components/LocationAndProfileBar';
import { SmogAdvisorChat } from './components/SmogAdvisorChat';
import { TailoredPlanSection } from './components/TailoredPlanSection';
import { TopNav } from './components/TopNav';
import { useAirQualityMonitor } from './hooks/useAirQualityMonitor';

export default function App() {
  const {
    activeLocation,
    selectLocation,
    profile,
    updateProfile,
    adoptedIds,
    toggleAdopt,
    airData,
    airLoading,
    airError,
    plan,
    planLoading,
    planError,
    autoRefreshMinutes,
    setAutoRefreshMinutes,
    notificationsEnabled,
    toggleNotifications,
    fetchAirQuality,
    generateTailoredPlan,
  } = useAirQualityMonitor();

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#F6F8FA] text-slate-900">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-teal-800 focus:px-4 focus:py-2 focus:text-xs focus:font-semibold focus:text-white"
        >
          Skip to main content
        </a>

        <TopNav
          onRefresh={() => void fetchAirQuality(activeLocation, profile.alertThresholdAqi, true)}
          isRefreshing={airLoading || planLoading}
        />

        <LocationAndProfileBar
          activeLocation={activeLocation}
          onSelectLocation={selectLocation}
          profile={profile}
          onUpdateProfile={updateProfile}
          onGeneratePlan={() => {
            if (airData) void generateTailoredPlan(airData, profile);
          }}
          isGeneratingPlan={planLoading}
        />

        <main id="main-content" className="mx-auto max-w-[1280px] space-y-6 px-6 py-6">
          <AirTelemetryPanel
            data={airData}
            isLoading={airLoading}
            error={airError}
            onRetry={() => void fetchAirQuality(activeLocation, profile.alertThresholdAqi, true)}
          />

          <FluctuationAlertsFeed
            alerts={airData?.alerts ?? []}
            thresholdAqi={profile.alertThresholdAqi}
            autoRefreshMinutes={autoRefreshMinutes}
            onChangeAutoRefresh={setAutoRefreshMinutes}
            notificationsEnabled={notificationsEnabled}
            onToggleNotifications={() => void toggleNotifications()}
            locationName={activeLocation.name}
          />

          <TailoredPlanSection
            plan={plan}
            isLoading={planLoading}
            error={planError}
            adoptedIds={adoptedIds}
            onToggleAdopt={toggleAdopt}
            onRegenerate={() => {
              if (airData) void generateTailoredPlan(airData, profile, true);
            }}
            locationName={activeLocation.name}
          />

          <ImpactSimulator
            recommendations={plan?.recommendations ?? []}
            adoptedIds={adoptedIds}
            currentPm25={airData?.current.pm25 ?? 0}
            locationName={activeLocation.name}
          />

          <SmogAdvisorChat airData={airData} profile={profile} />
        </main>

        <footer className="mt-10 border-t border-slate-200 bg-white">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-2 px-6 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>ClearAir Civic · Family & Community Winter Air Quality Guidance</span>
            <span>Live atmospheric & particulate telemetry via Open-Meteo</span>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}
