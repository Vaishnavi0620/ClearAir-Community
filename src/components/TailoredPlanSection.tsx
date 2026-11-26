import { useState } from 'react';
import { CheckSquare, ChevronDown, ChevronUp, Clock, Leaf, ShieldCheck, Sparkles, Square } from 'lucide-react';
import type { ActionRecommendation, RecommendationCategory, TailoredPlanResponse } from '../types/air';

interface TailoredPlanSectionProps {
  plan: TailoredPlanResponse | null;
  isLoading: boolean;
  error: string | null;
  adoptedIds: string[];
  onToggleAdopt: (id: string) => void;
  onRegenerate: () => void;
  locationName: string;
}

export function TailoredPlanSection({
  plan,
  isLoading,
  error,
  adoptedIds,
  onToggleAdopt,
  onRegenerate,
  locationName,
}: TailoredPlanSectionProps) {
  const [activeCategory, setActiveCategory] = useState<'all' | RecommendationCategory>('all');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const categoryLabels: Record<RecommendationCategory, string> = {
    routine: 'Low-Emission Routine',
    'indoor-hack': 'Indoor Air Hack',
    'sustainable-swap': 'Sustainable Alternative',
  };

  const filteredItems: ActionRecommendation[] =
    plan?.recommendations.filter((item) =>
      activeCategory === 'all' ? true : item.category === activeCategory
    ) || [];

  return (
    <section id="plan" className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Tailored Guidance & Direct Impact for {locationName}
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Personalized low-emission routines, indoor air quality hacks, and sustainable choices with clear cause-and-effect impact
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 overflow-x-auto">
            {[
              { id: 'all', label: 'All Guidance' },
              { id: 'routine', label: 'Daily Routines' },
              { id: 'indoor-hack', label: 'Indoor Hacks' },
              { id: 'sustainable-swap', label: 'Sustainable Swaps' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCategory(tab.id as 'all' | RecommendationCategory)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeCategory === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onRegenerate}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
            <span>{isLoading ? 'Generating Plan...' : 'Regenerate Plan'}</span>
          </button>
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="p-6 space-y-4">
          <div className="h-16 animate-pulse rounded-lg bg-slate-100" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-56 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        </div>
      )}

      {/* Error State */}
      {!isLoading && error && (
        <div className="p-6">
          <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-rose-800">Could not generate tailored AI guidance</p>
              <p className="mt-0.5 text-xs text-rose-700">{error}</p>
            </div>
            <button
              type="button"
              onClick={onRegenerate}
              className="rounded-lg bg-rose-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Populated GenAI Plan */}
      {!isLoading && !error && plan && (
        <>
          {/* Executive Briefing */}
          <div className="border-b border-slate-200 bg-slate-50/70 px-6 py-4">
            <p className="text-sm font-medium leading-relaxed text-slate-900">{plan.executiveSummary}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">{plan.inversionBrief}</p>
          </div>

          {/* Recommendations Grid */}
          <div className="grid grid-cols-1 divide-y divide-slate-200 md:grid-cols-2 lg:grid-cols-3 md:divide-x md:divide-y-0">
            {filteredItems.map((item, idx) => {
              const isAdopted = adoptedIds.includes(item.id);
              const isExpanded = !!expandedIds[item.id];
              const borderTopRow = idx >= 3 ? 'md:border-t md:border-slate-200' : '';

              return (
                <article
                  key={item.id}
                  className={`flex flex-col justify-between p-6 transition-colors ${borderTopRow} ${
                    isAdopted ? 'bg-teal-50/30' : 'bg-white'
                  }`}
                >
                  <div>
                    {/* Quiet Unboxed Metadata */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-semibold text-teal-800">{categoryLabels[item.category]}</span>
                      <span aria-hidden="true">·</span>
                      <span>{item.costTier}</span>
                      <span aria-hidden="true">·</span>
                      <span>{item.effortLevel}</span>
                    </div>

                    <h3 className="mt-2 text-base font-semibold text-slate-900 leading-snug">
                      {item.title}
                    </h3>

                    <div className="mt-1.5 flex items-center gap-1.5 font-mono text-xs text-slate-500 tabular-nums">
                      <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                      <span>{item.timeWindow}</span>
                    </div>

                    <p className="mt-3 text-sm leading-relaxed text-slate-600">{item.summary}</p>

                    {/* Direct Impact Pair (Clean Hairline Box, No Card-Inside-Card Shadows) */}
                    <div className="mt-4 space-y-2.5 border-t border-slate-200 pt-3.5">
                      <div className="flex items-start gap-2">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
                        <div>
                          <span className="block text-[11px] font-semibold text-slate-500">
                            Direct Health Impact
                          </span>
                          <span className="text-xs font-medium text-slate-900">
                            {item.personalExposureReduction}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <Leaf className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                        <div>
                          <span className="block text-[11px] font-semibold text-slate-500">
                            Community Airshed Impact
                          </span>
                          <span className="text-xs font-medium text-slate-900">
                            {item.communityEmissionImpact}
                          </span>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-600">
                        <strong className="font-semibold text-slate-800">Why this works: </strong>
                        {item.mechanismExplanation}
                      </div>
                    )}
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-100 pt-3.5">
                    <button
                      type="button"
                      onClick={() => toggleExpand(item.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      <span>{isExpanded ? 'Hide mechanism' : 'Explain impact'}</span>
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => onToggleAdopt(item.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isAdopted
                          ? 'bg-teal-700 text-white hover:bg-teal-800'
                          : 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      {isAdopted ? (
                        <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Square className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      <span>{isAdopted ? 'Adopted' : 'Commit Choice'}</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
