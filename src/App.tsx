/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AirTelemetryPanel } from './components/AirTelemetryPanel';
import { FluctuationAlertsFeed } from './components/FluctuationAlertsFeed';
import { ImpactSimulator } from './components/ImpactSimulator';
import { LocationAndProfileBar } from './components/LocationAndProfileBar';
import { SmogAdvisorChat } from './components/SmogAdvisorChat';
import { TailoredPlanSection } from './components/TailoredPlanSection';
import { TopNav } from './components/TopNav';
import type { AirQualityData, HouseholdProfile, LocationOption, TailoredPlanResponse } from './types/air';
import { DEFAULT_PROFILE, PRESET_LOCATIONS } from './utils/aqi';

const STORAGE_PROFILE_KEY = 'clearair_household_profile_v1';
const STORAGE_ADOPTED_KEY = 'clearair_adopted_choices_v1';
const STORAGE_LOCATION_KEY = 'clearair_active_location_v1';

export default function App() {
  const [activeLocation, setActiveLocation] = useState<LocationOption>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_LOCATION_KEY);
      if (saved) return JSON.parse(saved) as LocationOption;
    } catch {
      // Ignore storage read errors
    }
    return PRESET_LOCATIONS[0];
  });

  const [profile, setProfile] = useState<HouseholdProfile>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PROFILE_KEY);
      if (saved) return { ...DEFAULT_PROFILE, ...(JSON.parse(saved) as Partial<HouseholdProfile>) };
    } catch {
      // Ignore storage read errors
    }
    return DEFAULT_PROFILE;
  });

  const [adoptedIds, setAdoptedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_ADOPTED_KEY);
      if (saved) return JSON.parse(saved) as string[];
    } catch {
      // Ignore storage read errors
    }
    return [];
  });

  const [airData, setAirData] = useState<AirQualityData | null>(null);
  const [airLoading, setAirLoading] = useState(true);
  const [airError, setAirError] = useState<string | null>(null);

  const [plan, setPlan] = useState<TailoredPlanResponse | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const [autoRefreshMinutes, setAutoRefreshMinutes] = useState(5);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  const lastNotifiedKeyRef = useRef<string>('');
  const planCacheRef = useRef<Map<string, TailoredPlanResponse>>(new Map());

  const handleUpdateProfile = (next: HouseholdProfile) => {
    setProfile(next);
    try {
      localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota errors
    }
  };

  const handleSelectLocation = (loc: LocationOption) => {
    setActiveLocation(loc);
    try {
      localStorage.setItem(STORAGE_LOCATION_KEY, JSON.stringify(loc));
    } catch {
      // Ignore quota errors
    }
  };

  const handleToggleAdopt = (id: string) => {
    setAdoptedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(STORAGE_ADOPTED_KEY, JSON.stringify(next));
      } catch {
        // Ignore quota errors
      }
      return next;
    });
  };

  const generateTailoredPlan = useCallback(
    async (latestAir: AirQualityData, activeProfile: HouseholdProfile, forceRefresh = false) => {
      const cacheKey = `${latestAir.location.id}|${latestAir.current.severity}|${activeProfile.householdType}|${activeProfile.commuteMode}|${activeProfile.heatingAndCooking}|${activeProfile.indoorGear}`;
      if (!forceRefresh) {
        const cached = planCacheRef.current.get(cacheKey);
        if (cached) {
          setPlan(cached);
          setPlanError(null);
          return;
        }
      }

      setPlanLoading(true);
      setPlanError(null);
      try {
        const res = await fetch('/api/assistant/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            airData: latestAir,
            profile: activeProfile,
          }),
        });
        const data = (await res.json()) as TailoredPlanResponse & { error?: string };
        if (!res.ok) {
          throw new Error(data.error || 'Failed to generate guidance.');
        }
        planCacheRef.current.set(cacheKey, data);
        setPlan(data);
        // Auto-select first 2 high-impact items if user hasn't picked any yet so Impact Ledger shows real movement
        setAdoptedIds((prev) => {
          if (prev.length > 0 || !data.recommendations?.length) return prev;
          const defaults = data.recommendations.slice(0, 2).map((r) => r.id);
          try {
            localStorage.setItem(STORAGE_ADOPTED_KEY, JSON.stringify(defaults));
          } catch {
            // Ignore
          }
          return defaults;
        });
      } catch (err) {
        setPlanError(err instanceof Error ? err.message : 'Unable to reach AI advisor.');
      } finally {
        setPlanLoading(false);
      }
    },
    []
  );

  const fetchAirQuality = useCallback(
    async (loc: LocationOption, thresholdAqi: number, shouldRefreshPlan: boolean) => {
      setAirLoading(true);
      setAirError(null);
      try {
        const params = new URLSearchParams({
          lat: String(loc.latitude),
          lon: String(loc.longitude),
          name: loc.name,
          region: loc.region || '',
          country: loc.country,
          timezone: loc.timezone || 'auto',
          threshold: String(thresholdAqi),
        });
        const res = await fetch(`/api/air-quality?${params.toString()}`);
        const data = (await res.json()) as AirQualityData & { error?: string };
        if (!res.ok) {
          throw new Error(data.error || 'Air quality feed unavailable.');
        }
        setAirData(data);

        // Trigger optional browser notification if enabled and threshold crossed
        if (
          notificationsEnabled &&
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted' &&
          data.current.usAqi >= thresholdAqi
        ) {
          const notifyKey = `${data.location.name}-${data.current.usAqi}-${data.current.severity}`;
          if (lastNotifiedKeyRef.current !== notifyKey) {
            lastNotifiedKeyRef.current = notifyKey;
            new Notification(`ClearAir Alert: ${data.location.name} at ${data.current.usAqi} US AQI`, {
              body: `PM2.5 is ${data.current.pm25.toFixed(1)} µg/m³ (${data.current.severity}). Seal windows and run indoor filtration.`,
            });
          }
        }

        if (shouldRefreshPlan) {
          await generateTailoredPlan(data, profile);
        }
      } catch (err) {
        setAirError(err instanceof Error ? err.message : 'Unable to fetch air quality.');
      } finally {
        setAirLoading(false);
      }
    },
    [generateTailoredPlan, notificationsEnabled, profile]
  );

  // Initial & location-change fetch (also triggers tailored AI plan)
  useEffect(() => {
    fetchAirQuality(activeLocation, profile.alertThresholdAqi, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLocation]);

  // Re-evaluate threshold alerts when alertThresholdAqi changes without regenerating full plan unless requested
  useEffect(() => {
    if (airData) {
      fetchAirQuality(activeLocation, profile.alertThresholdAqi, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.alertThresholdAqi]);

  // Polling interval for real-time fluctuation alerts
  useEffect(() => {
    if (autoRefreshMinutes <= 0) return;
    const ms = autoRefreshMinutes * 60 * 1000;
    const interval = setInterval(() => {
      fetchAirQuality(activeLocation, profile.alertThresholdAqi, false);
    }, ms);
    return () => clearInterval(interval);
  }, [activeLocation, autoRefreshMinutes, fetchAirQuality, profile.alertThresholdAqi]);

  const handleToggleNotifications = async () => {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      return;
    }
    if (typeof Notification === 'undefined') {
      return;
    }
    if (Notification.permission === 'granted') {
      setNotificationsEnabled(true);
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      setNotificationsEnabled(true);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F8FA] text-slate-900">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-teal-800 focus:px-4 focus:py-2 focus:text-xs focus:font-semibold focus:text-white"
      >
        Skip to main content
      </a>

      <TopNav
        onRefresh={() => fetchAirQuality(activeLocation, profile.alertThresholdAqi, true)}
        isRefreshing={airLoading || planLoading}
      />

      <LocationAndProfileBar
        activeLocation={activeLocation}
        onSelectLocation={handleSelectLocation}
        profile={profile}
        onUpdateProfile={handleUpdateProfile}
        onGeneratePlan={() => {
          if (airData) generateTailoredPlan(airData, profile);
        }}
        isGeneratingPlan={planLoading}
      />

      <main id="main-content" className="mx-auto max-w-[1280px] space-y-6 px-6 py-6">
        <AirTelemetryPanel
          data={airData}
          isLoading={airLoading}
          error={airError}
          onRetry={() => fetchAirQuality(activeLocation, profile.alertThresholdAqi, true)}
        />

        <FluctuationAlertsFeed
          alerts={airData?.alerts || []}
          thresholdAqi={profile.alertThresholdAqi}
          autoRefreshMinutes={autoRefreshMinutes}
          onChangeAutoRefresh={setAutoRefreshMinutes}
          notificationsEnabled={notificationsEnabled}
          onToggleNotifications={handleToggleNotifications}
          locationName={activeLocation.name}
        />

        <TailoredPlanSection
          plan={plan}
          isLoading={planLoading}
          error={planError}
          adoptedIds={adoptedIds}
          onToggleAdopt={handleToggleAdopt}
          onRegenerate={() => {
            if (airData) generateTailoredPlan(airData, profile, true);
          }}
          locationName={activeLocation.name}
        />

        <ImpactSimulator
          recommendations={plan?.recommendations || []}
          adoptedIds={adoptedIds}
          currentPm25={airData?.current.pm25 ?? 0}
          locationName={activeLocation.name}
        />

        <SmogAdvisorChat airData={airData} profile={profile} />
      </main>

      <footer className="border-t border-slate-200 bg-white mt-10">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-2 px-6 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>ClearAir Civic · Family & Community Winter Air Quality Guidance</span>
          <span>Live atmospheric & particulate telemetry via Open-Meteo</span>
        </div>
      </footer>
    </div>
  );
}
