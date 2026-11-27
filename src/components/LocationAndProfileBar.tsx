import { useEffect, useRef, useState } from 'react';
import { LocateFixed, MapPin, Search, SlidersHorizontal, X } from 'lucide-react';
import type { HouseholdProfile, LocationOption } from '../types/air';
import { PRESET_LOCATIONS } from '../utils/aqi';

interface LocationAndProfileBarProps {
  activeLocation: LocationOption;
  onSelectLocation: (loc: LocationOption) => void;
  profile: HouseholdProfile;
  onUpdateProfile: (profile: HouseholdProfile) => void;
  onGeneratePlan: () => void;
  isGeneratingPlan: boolean;
}

export function LocationAndProfileBar({
  activeLocation,
  onSelectLocation,
  profile,
  onUpdateProfile,
  onGeneratePlan,
  isGeneratingPlan,
}: LocationAndProfileBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocationOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isDetectingGeo, setIsDetectingGeo] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [showProfileEditor, setShowProfileEditor] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/locations/search?q=${encodeURIComponent(trimmed)}`);
        const data = (await res.json()) as { results?: LocationOption[] };
        setResults(data.results || []);
        setShowDropdown(true);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [query]);

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Browser geolocation is unavailable in this environment.');
      return;
    }
    setGeoError(null);
    setIsDetectingGeo(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(`/api/locations/reverse?lat=${latitude}&lon=${longitude}`);
          const data = (await res.json()) as { location?: LocationOption };
          if (data.location) {
            onSelectLocation(data.location);
            setQuery('');
            setShowDropdown(false);
          }
        } catch {
          setGeoError('Could not resolve coordinates to a city.');
        } finally {
          setIsDetectingGeo(false);
        }
      },
      () => {
        setIsDetectingGeo(false);
        setGeoError('Location access denied. Search any city above.');
      },
      { timeout: 8000 }
    );
  };

  const householdSummary: Record<HouseholdProfile['householdType'], string> = {
    'family-kids': 'Family with children',
    'multi-gen-seniors': 'Seniors / asthma care',
    'commuting-adults': 'Daily city commuters',
    'community-organizer': 'Community organizer',
  };

  const mobilitySummary: Record<HouseholdProfile['commuteMode'], string> = {
    car: 'Car commute',
    'public-transit': 'Public transit',
    'walk-cycle': 'Walk / cycle',
    remote: 'Home-based',
  };

  const gearSummary: Record<HouseholdProfile['indoorGear'], string> = {
    none: 'No purifier',
    'diy-corsi-rosenthal': 'DIY box-fan MERV-13',
    'hepa-purifiers': 'HEPA purifiers',
  };

  return (
    <section className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-[1280px] px-6 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* City Search & Quick Location Selector */}
          <div className="flex flex-1 flex-col gap-2.5 sm:flex-row sm:items-center">
            <div ref={searchContainerRef} className="relative w-full sm:max-w-sm">
              <label htmlFor="city-search" className="sr-only">
                Search city or neighborhood
              </label>
              <div className="relative flex items-center">
                <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" aria-hidden="true" />
                <input
                  id="city-search"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => results.length > 0 && setShowDropdown(true)}
                  placeholder="Search any city (e.g. Denver, Warsaw, Seoul)..."
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pl-9 pr-8 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:bg-white focus:outline-none"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setResults([]);
                      setShowDropdown(false);
                    }}
                    aria-label="Clear search"
                    className="absolute right-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {showDropdown && (results.length > 0 || isSearching) && (
                <div
                  role="listbox"
                  aria-label="Matching cities"
                  className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
                >
                  {isSearching ? (
                    <div className="px-3.5 py-2.5 text-xs text-slate-500">Searching locations...</div>
                  ) : (
                    results.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={item.id === activeLocation.id}
                        onClick={() => {
                          onSelectLocation(item);
                          setQuery('');
                          setShowDropdown(false);
                        }}
                        className="flex w-full items-center justify-between border-b border-slate-100 px-3.5 py-2.5 text-left text-sm hover:bg-slate-50 last:border-b-0 cursor-pointer"
                      >
                        <span className="font-medium text-slate-900">
                          {item.name}
                          {item.region ? `, ${item.region}` : ''}
                        </span>
                        <span className="text-xs text-slate-500">{item.country}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleUseMyLocation}
              disabled={isDetectingGeo}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LocateFixed className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
              <span>{isDetectingGeo ? 'Locating...' : 'Use My Location'}</span>
            </button>

            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 text-xs">
              <span className="text-slate-400 whitespace-nowrap shrink-0">Winter hotspots:</span>
              {PRESET_LOCATIONS.map((preset) => {
                const isActive =
                  Math.abs(preset.latitude - activeLocation.latitude) < 0.05 &&
                  Math.abs(preset.longitude - activeLocation.longitude) < 0.05;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => onSelectLocation(preset)}
                    className={`rounded-md px-2.5 py-1 font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-teal-700 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {preset.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Household Profile Trigger */}
          <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3 lg:border-t-0 lg:pt-0">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <MapPin className="h-3.5 w-3.5 text-teal-700 shrink-0" aria-hidden="true" />
              <span className="font-medium text-slate-900">{activeLocation.name}</span>
              <span aria-hidden="true">·</span>
              <span className="hidden sm:inline">{householdSummary[profile.householdType]}</span>
              <span aria-hidden="true" className="hidden sm:inline">
                ·
              </span>
              <span className="hidden xl:inline">{mobilitySummary[profile.commuteMode]}</span>
              <span aria-hidden="true" className="hidden xl:inline">
                ·
              </span>
              <span className="hidden xl:inline">{gearSummary[profile.indoorGear]}</span>
            </div>

            <button
              type="button"
              aria-expanded={showProfileEditor}
              aria-controls="household-profile-panel"
              onClick={() => setShowProfileEditor((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
              <span>{showProfileEditor ? 'Hide Lifestyle Setup' : 'Tailor Household'}</span>
            </button>
          </div>
        </div>

        {geoError && (
          <p className="mt-2 text-xs text-amber-700" role="status">
            {geoError}
          </p>
        )}

        {/* Expandable Household & Lifestyle Configurator */}
        {showProfileEditor && (
          <div id="household-profile-panel" className="mt-4 border-t border-slate-200 pt-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <label htmlFor="prof-household" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Household / Role
                </label>
                <select
                  id="prof-household"
                  value={profile.householdType}
                  onChange={(e) =>
                    onUpdateProfile({
                      ...profile,
                      householdType: e.target.value as HouseholdProfile['householdType'],
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                >
                  <option value="family-kids">Family with school-age kids</option>
                  <option value="multi-gen-seniors">Seniors / asthma sensitivity</option>
                  <option value="commuting-adults">Urban commuting adults</option>
                  <option value="community-organizer">School / neighborhood organizer</option>
                </select>
              </div>

              <div>
                <label htmlFor="prof-commute" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Daily Mobility
                </label>
                <select
                  id="prof-commute"
                  value={profile.commuteMode}
                  onChange={(e) =>
                    onUpdateProfile({
                      ...profile,
                      commuteMode: e.target.value as HouseholdProfile['commuteMode'],
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                >
                  <option value="car">Personal car commute</option>
                  <option value="public-transit">Bus, metro, or rail</option>
                  <option value="walk-cycle">Walking or cycling</option>
                  <option value="remote">Home-based / remote</option>
                </select>
              </div>

              <div>
                <label htmlFor="prof-heat" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Heating & Cooking
                </label>
                <select
                  id="prof-heat"
                  value={profile.heatingAndCooking}
                  onChange={(e) =>
                    onUpdateProfile({
                      ...profile,
                      heatingAndCooking: e.target.value as HouseholdProfile['heatingAndCooking'],
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                >
                  <option value="gas-stove-furnace">Gas stove & gas furnace</option>
                  <option value="wood-solid-fuel">Wood fireplace / solid fuel</option>
                  <option value="electric-heat-pump">Electric induction & heat pump</option>
                </select>
              </div>

              <div>
                <label htmlFor="prof-gear" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Indoor Air Filtration
                </label>
                <select
                  id="prof-gear"
                  value={profile.indoorGear}
                  onChange={(e) =>
                    onUpdateProfile({
                      ...profile,
                      indoorGear: e.target.value as HouseholdProfile['indoorGear'],
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                >
                  <option value="none">No dedicated air filter yet</option>
                  <option value="diy-corsi-rosenthal">DIY MERV-13 box-fan filter</option>
                  <option value="hepa-purifiers">HEPA room purifiers</option>
                </select>
              </div>

              <div className="flex flex-col justify-between">
                <label htmlFor="prof-threshold" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Alert Trigger (US AQI)
                </label>
                <div className="flex items-center gap-2">
                  <select
                    id="prof-threshold"
                    value={profile.alertThresholdAqi}
                    onChange={(e) =>
                      onUpdateProfile({
                        ...profile,
                        alertThresholdAqi: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-teal-700 focus:outline-none"
                  >
                    <option value={75}>75 AQI (Sensitive)</option>
                    <option value={100}>100 AQI (Moderate+)</option>
                    <option value={150}>150 AQI (Unhealthy)</option>
                    <option value={200}>200 AQI (Very Unhealthy)</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      onGeneratePlan();
                      setShowProfileEditor(false);
                    }}
                    disabled={isGeneratingPlan}
                    className="rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isGeneratingPlan ? 'Updating...' : 'Apply'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
