import type { ActionRecommendation } from '../types/air.ts';

export interface ImpactSummary {
  adoptedItems: ActionRecommendation[];
  effectiveExposureReductionUg: number;
  pctExposureReduction: number;
  weeklyCo2PerHousehold: number;
  communityWeeklyCo2: number;
  communityWeeklyAirshedGrams: number;
}

export function computeHouseholdImpact(
  recommendations: ActionRecommendation[],
  adoptedIds: string[],
  currentPm25: number,
  participatingHouseholds: number
): ImpactSummary {
  const adoptedItems = recommendations.filter((r) => adoptedIds.includes(r.id));

  const totalExposureAvoidedUg = adoptedItems.reduce(
    (sum, item) => sum + (Number(item.estimatedExposureAvoidedUg) || 0),
    0
  );

  // Cap effective inhaled reduction at 85% of ambient PM2.5 for physical realism
  const effectiveExposureReductionUg =
    adoptedItems.length === 0
      ? 0
      : Math.min(totalExposureAvoidedUg, Math.max(currentPm25 * 0.85, 5));

  const pctExposureReduction =
    currentPm25 > 0
      ? Math.min(85, Math.round((effectiveExposureReductionUg / currentPm25) * 100))
      : 0;

  const weeklyCo2PerHousehold = adoptedItems.reduce(
    (sum, item) => sum + (Number(item.estimatedWeeklyCo2KgSaved) || 0),
    0
  );

  const safeHouseholds = Math.max(1, Math.round(participatingHouseholds));
  const communityWeeklyCo2 = weeklyCo2PerHousehold * safeHouseholds;
  // Approximate winter urban co-pollutant co-benefit: ~1.4 g NOx + primary PM2.5 per kg CO2e avoided
  const communityWeeklyAirshedGrams = Number((communityWeeklyCo2 * 1.4).toFixed(0));

  return {
    adoptedItems,
    effectiveExposureReductionUg,
    pctExposureReduction,
    weeklyCo2PerHousehold,
    communityWeeklyCo2,
    communityWeeklyAirshedGrams,
  };
}
