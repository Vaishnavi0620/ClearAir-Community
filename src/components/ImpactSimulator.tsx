import { useState } from 'react';
import { Users } from 'lucide-react';
import type { ActionRecommendation } from '../types/air';
import { computeHouseholdImpact } from '../utils/impactMath';

interface ImpactSimulatorProps {
  recommendations: ActionRecommendation[];
  adoptedIds: string[];
  currentPm25: number;
  locationName: string;
}

export function ImpactSimulator({
  recommendations,
  adoptedIds,
  currentPm25,
  locationName,
}: ImpactSimulatorProps) {
  const [participatingHouseholds, setParticipatingHouseholds] = useState(25);

  const {
    adoptedItems,
    effectiveExposureReductionUg,
    pctExposureReduction,
    weeklyCo2PerHousehold,
    communityWeeklyCo2,
    communityWeeklyAirshedGrams,
  } = computeHouseholdImpact(recommendations, adoptedIds, currentPm25, participatingHouseholds);

  return (
    <section id="impact" className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Direct Choice & Community Impact Ledger</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            See how your committed actions protect indoor lung health and lower winter emissions across {locationName}
          </p>
        </div>

        <div className="text-xs font-mono text-slate-600 tabular-nums">
          {adoptedItems.length} of {recommendations.length} choices committed
        </div>
      </div>

      <div className="grid grid-cols-1 divide-y divide-slate-200 lg:grid-cols-12 lg:divide-x lg:divide-y-0">
        <div className="p-6 lg:col-span-7">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div>
              <span className="block text-xs font-medium text-slate-500">Daily Exposure Avoided</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="font-mono text-3xl font-semibold text-teal-800 tabular-nums">
                  {effectiveExposureReductionUg.toFixed(1)}
                </span>
                <span className="font-mono text-xs text-slate-500">µg/m³</span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                ~<span className="font-mono tabular-nums font-medium">{pctExposureReduction}%</span> lower personal PM2.5 intake vs outdoor baseline
              </p>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-500">Your Weekly Carbon & Smoke Cut</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="font-mono text-3xl font-semibold text-slate-900 tabular-nums">
                  {weeklyCo2PerHousehold.toFixed(1)}
                </span>
                <span className="font-mono text-xs text-slate-500">kg CO₂e/wk</span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Direct reduction from cold-start trips & heating fuel avoided
              </p>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-500">Neighborhood Block Effect</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="font-mono text-3xl font-semibold text-emerald-700 tabular-nums">
                  {communityWeeklyCo2.toFixed(0)}
                </span>
                <span className="font-mono text-xs text-slate-500">kg CO₂e/wk</span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                ~<span className="font-mono tabular-nums font-medium">{communityWeeklyAirshedGrams} g</span> local NOₓ & soot prevented across {participatingHouseholds} homes
              </p>
            </div>
          </div>

          <div className="mt-6 border-t border-slate-200 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="community-scale" className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                <Users className="h-4 w-4 text-teal-700" aria-hidden="true" />
                <span>Simulate Neighborhood Adoption Scale</span>
              </label>
              <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                {participatingHouseholds} participating households
              </span>
            </div>
            <input
              id="community-scale"
              type="range"
              min={1}
              max={150}
              value={participatingHouseholds}
              aria-valuetext={`${participatingHouseholds} participating households`}
              onChange={(e) => setParticipatingHouseholds(Number(e.target.value))}
              className="mt-3 w-full accent-teal-700 cursor-pointer"
            />
            <div className="mt-1 flex justify-between font-mono text-[11px] text-slate-400 tabular-nums">
              <span>1 Home</span>
              <span>25 Homes (1 Street)</span>
              <span>150 Homes (School Catchment)</span>
            </div>
          </div>
        </div>

        <div className="p-6 lg:col-span-5 bg-slate-50/50">
          <h3 className="text-sm font-semibold text-slate-900">Why Every Committed Choice Matters</h3>
          {adoptedItems.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">
              Select <strong className="font-semibold text-slate-800">Commit Choice</strong> on any routine, indoor hack, or sustainable swap above to calculate your household’s direct exposure and emissions impact.
            </p>
          ) : (
            <div className="mt-3 divide-y divide-slate-200">
              {adoptedItems.map((item) => (
                <div key={item.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xs font-semibold text-slate-900">{item.title}</span>
                    <span className="font-mono text-[11px] text-teal-800 whitespace-nowrap shrink-0 tabular-nums">
                      -{item.estimatedExposureAvoidedUg} µg/m³ · -{item.estimatedWeeklyCo2KgSaved} kg/wk
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{item.mechanismExplanation}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
