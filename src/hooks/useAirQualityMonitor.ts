import { useCallback, useEffect, useRef, useState } from 'react';
import type { AirQualityData, HouseholdProfile, LocationOption, TailoredPlanResponse } from '../types/air';
import { DEFAULT_PROFILE, PRESET_LOCATIONS } from '../utils/aqi';
import { readStoredJson, writeStoredJson } from '../utils/storage';

const STORAGE_PROFILE_KEY = 'clearair_household_profile_v1';
const STORAGE_ADOPTED_KEY = 'clearair_adopted_choices_v1';
const STORAGE_LOCATION_KEY = 'clearair_active_location_v1';

export function useAirQualityMonitor() {
  const [activeLocation, setActiveLocation] = useState<LocationOption>(() =>
    readStoredJson<LocationOption>(STORAGE_LOCATION_KEY, PRESET_LOCATIONS[0])
  );

  const [profile, setProfile] = useState<HouseholdProfile>(() => ({
    ...DEFAULT_PROFILE,
    ...readStoredJson<Partial<HouseholdProfile>>(STORAGE_PROFILE_KEY, {}),
  }));

  const [adoptedIds, setAdoptedIds] = useState<string[]>(() =>
    readStoredJson<string[]>(STORAGE_ADOPTED_KEY, [])
  );

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
  const profileRef = useRef<HouseholdProfile>(profile);
  const notificationsRef = useRef<boolean>(notificationsEnabled);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    notificationsRef.current = notificationsEnabled;
  }, [notificationsEnabled]);

  const updateProfile = useCallback((next: HouseholdProfile) => {
    setProfile(next);
    writeStoredJson(STORAGE_PROFILE_KEY, next);
  }, []);

  const selectLocation = useCallback((loc: LocationOption) => {
    setActiveLocation(loc);
    writeStoredJson(STORAGE_LOCATION_KEY, loc);
  }, []);

  const toggleAdopt = useCallback((id: string) => {
    setAdoptedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      writeStoredJson(STORAGE_ADOPTED_KEY, next);
      return next;
    });
  }, []);

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
          body: JSON.stringify({ airData: latestAir, profile: activeProfile }),
        });
        const data = (await res.json()) as TailoredPlanResponse & { error?: string };
        if (!res.ok) {
          throw new Error(data.error || 'Failed to generate guidance.');
        }
        planCacheRef.current.set(cacheKey, data);
        setPlan(data);
        setAdoptedIds((prev) => {
          if (prev.length > 0 || !data.recommendations?.length) return prev;
          const defaults = data.recommendations.slice(0, 2).map((r) => r.id);
          writeStoredJson(STORAGE_ADOPTED_KEY, defaults);
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

        if (
          notificationsRef.current &&
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
          await generateTailoredPlan(data, profileRef.current);
        }
      } catch (err) {
        setAirError(err instanceof Error ? err.message : 'Unable to fetch air quality.');
      } finally {
        setAirLoading(false);
      }
    },
    [generateTailoredPlan]
  );

  useEffect(() => {
    void fetchAirQuality(activeLocation, profileRef.current.alertThresholdAqi, true);
  }, [activeLocation, fetchAirQuality]);

  useEffect(() => {
    if (autoRefreshMinutes <= 0) return;
    const interval = setInterval(() => {
      void fetchAirQuality(activeLocation, profileRef.current.alertThresholdAqi, false);
    }, autoRefreshMinutes * 60 * 1000);
    return () => clearInterval(interval);
  }, [activeLocation, autoRefreshMinutes, fetchAirQuality]);

  const handleUpdateProfile = useCallback(
    (next: HouseholdProfile) => {
      const thresholdChanged = next.alertThresholdAqi !== profileRef.current.alertThresholdAqi;
      updateProfile(next);
      if (thresholdChanged) {
        void fetchAirQuality(activeLocation, next.alertThresholdAqi, false);
      }
    },
    [activeLocation, fetchAirQuality, updateProfile]
  );

  const toggleNotifications = useCallback(async () => {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      return;
    }
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
      setNotificationsEnabled(true);
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      setNotificationsEnabled(true);
    }
  }, [notificationsEnabled]);

  return {
    activeLocation,
    selectLocation,
    profile,
    updateProfile: handleUpdateProfile,
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
  };
}
