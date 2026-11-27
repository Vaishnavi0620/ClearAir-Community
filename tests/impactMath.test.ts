import test from 'node:test';
import assert from 'node:assert/strict';
import { computeHouseholdImpact } from '../src/utils/impactMath.ts';
import type { ActionRecommendation } from '../src/types/air.ts';

const sampleRecs: ActionRecommendation[] = [
  {
    id: 'rec-1',
    category: 'indoor-hack',
    title: 'Run DIY Corsi-Rosenthal box in living area',
    timeWindow: '17:00–22:00',
    effortLevel: 'Low Effort',
    costTier: 'Low Cost',
    summary: 'Continuously scrub fine particulates during evening inversion.',
    personalExposureReduction: '-45% indoor PM2.5',
    communityEmissionImpact: 'No direct outdoor emission reduction',
    mechanismExplanation: 'Captures sub-micron smoke particles before deep lung deposition.',
    estimatedExposureAvoidedUg: 20,
    estimatedWeeklyCo2KgSaved: 0,
  },
  {
    id: 'rec-2',
    category: 'sustainable-swap',
    title: 'Shift cold-start school drop-offs to walking bus',
    timeWindow: '07:45–08:30',
    effortLevel: 'Habit Shift',
    costTier: 'Free',
    summary: 'Avoid cold catalytic converter exhaust during morning stagnation.',
    personalExposureReduction: '-8 µg/m³ curb exposure',
    communityEmissionImpact: '-6.5 kg CO2e/wk',
    mechanismExplanation: 'Cold engines emit elevated NOx and PM before reaching operating temperature.',
    estimatedExposureAvoidedUg: 15,
    estimatedWeeklyCo2KgSaved: 6.5,
  },
];

test('computeHouseholdImpact returns zeros when no recommendations are adopted', () => {
  const summary = computeHouseholdImpact(sampleRecs, [], 40, 25);
  assert.equal(summary.adoptedItems.length, 0);
  assert.equal(summary.effectiveExposureReductionUg, 0);
  assert.equal(summary.pctExposureReduction, 0);
  assert.equal(summary.weeklyCo2PerHousehold, 0);
  assert.equal(summary.communityWeeklyCo2, 0);
});

test('computeHouseholdImpact caps exposure reduction at 85% of ambient PM2.5 and scales community impact', () => {
  // Combined exposure avoided is 35 ug/m3, while 85% of 30 is 25.5 ug/m3
  const summary = computeHouseholdImpact(sampleRecs, ['rec-1', 'rec-2'], 30, 40);
  assert.equal(summary.adoptedItems.length, 2);
  assert.equal(summary.effectiveExposureReductionUg, 25.5);
  assert.equal(summary.pctExposureReduction, 85);
  assert.equal(summary.weeklyCo2PerHousehold, 6.5);
  assert.equal(summary.communityWeeklyCo2, 260);
  assert.equal(summary.communityWeeklyAirshedGrams, 364);
});
