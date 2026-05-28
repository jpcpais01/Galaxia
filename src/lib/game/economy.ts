import type { Empire, Resources, Infrastructure } from '@/types/game';
import { INFRA_CONFIG, STATION_CONFIG, GROUND_OP_CONFIG, ORBITAL_CONFIG } from './constants';
import { RESEARCH_BY_ID } from './research-tree';

export function computeResourceRates(empire: Empire, currentTick = 0): Resources {
  const rates: Resources = {
    energy: 5,
    food: 0,
    minerals: 0,
    research: 5,
    compute: 0,
    credits: 10,
    population: 0,
  };

  const resourceBonuses = getResearchBonuses(empire, 'resource_rate');

  for (const infra of empire.infrastructure) {
    if (!infra.active) continue;
    const cfg = INFRA_CONFIG[infra.type];
    const out = cfg.output;
    for (const [key, val] of Object.entries(out) as [keyof Resources, number][]) {
      const bonus = 1 + (resourceBonuses[key] ?? 0) / 100;
      rates[key] = (rates[key] || 0) + val * bonus;
    }
  }

  // Active ground operations
  for (const op of (empire.groundOps ?? [])) {
    if (!op.active) continue;
    const cfg = GROUND_OP_CONFIG[op.type];
    for (const [key, val] of Object.entries(cfg.output) as [keyof Resources, number][]) {
      const bonus = 1 + (resourceBonuses[key] ?? 0) / 100;
      rates[key] = (rates[key] || 0) + val * bonus;
    }
  }

  // Orbital structures
  for (const orb of (empire.orbitalStructures ?? [])) {
    if (!orb.active) continue;
    const cfg = ORBITAL_CONFIG[orb.type];
    for (const [key, val] of Object.entries(cfg.output) as [keyof Resources, number][]) {
      const bonus = 1 + (resourceBonuses[key] ?? 0) / 100;
      rates[key] = (rates[key] || 0) + val * bonus;
    }
  }

  // Population: consumes food & energy, produces credits & research
  const pop = empire.resources.population;
  rates.food     -= Math.ceil(pop * 0.5);
  rates.energy   -= Math.ceil(pop * 0.2);
  rates.credits  += Math.floor(pop * 0.5);
  rates.research += Math.floor(pop / 3);

  // Stations that have completed building
  for (const station of empire.stations) {
    if (station.buildCompletedTick > currentTick) continue;
    if (station.type === 'mining_station') {
      const bonus = 1 + (resourceBonuses['minerals'] ?? 0) / 100;
      rates.minerals += 10 * bonus;
    }
    if (station.type === 'research_station') {
      const bonus = 1 + (resourceBonuses['research'] ?? 0) / 100;
      rates.research += 8 * bonus;
    }
  }

  return rates;
}

export function getResearchBonuses(empire: Empire, type: string): Record<string, number> {
  const bonuses: Record<string, number> = {};
  for (const researchId of empire.completedResearch) {
    const node = RESEARCH_BY_ID[researchId];
    if (!node) continue;
    for (const effect of node.effects) {
      if (effect.type === type) {
        bonuses[effect.target] = (bonuses[effect.target] ?? 0) + effect.value;
      }
    }
  }
  return bonuses;
}

export function getBuildSpeedMultiplier(empire: Empire, category: 'infrastructure' | 'station' | 'ship'): number {
  const bonuses = getResearchBonuses(empire, 'build_speed');
  return 1 + (bonuses[category] ?? 0) / 100;
}

export function applyTick(empire: Empire, currentTick: number): Partial<Empire> {
  const rates = computeResourceRates(empire, currentTick);
  const newResources = { ...empire.resources };

  for (const key of Object.keys(rates) as (keyof Resources)[]) {
    newResources[key] = Math.max(0, (newResources[key] || 0) + rates[key]);
  }

  // Colony Hub first-activation bonus: +10 pop one-time
  let hubBonus = 0;
  for (const infra of empire.infrastructure) {
    if (infra.type === 'colony_hub' && !infra.active && infra.buildCompletedTick <= currentTick) {
      hubBonus += 10;
    }
  }
  if (hubBonus > 0) newResources.population += hubBonus;

  // Famine: if food goes negative, population declines
  if (newResources.food <= 0) {
    newResources.population = Math.max(1, newResources.population - 1);
    newResources.food = 0;
  }

  // Cap population growth at 1000
  newResources.population = Math.min(1000, newResources.population);

  // Mark infrastructure as active when build completes
  const updatedInfra = empire.infrastructure.map(infra => ({
    ...infra,
    active: infra.buildCompletedTick <= currentTick,
  }));

  // Mark ground ops as active when build completes
  const updatedGroundOps = (empire.groundOps ?? []).map(op => ({
    ...op,
    active: op.buildCompletedTick <= currentTick,
  }));

  // Mark orbital structures as active when build completes
  const updatedOrbitals = (empire.orbitalStructures ?? []).map(orb => ({
    ...orb,
    active: orb.buildCompletedTick <= currentTick,
  }));

  // Process pending surveys → surveyedSystems
  const completedSurveys = (empire.pendingSurveys ?? []).filter(s => s.completesAtTick <= currentTick);
  const remainingPendingSurveys = (empire.pendingSurveys ?? []).filter(s => s.completesAtTick > currentTick);
  const newSurveyedSystems = Array.from(new Set([
    ...empire.surveyedSystems,
    ...completedSurveys.map(s => s.systemId),
  ]));

  // Process pending colonizations → colonizedPlanets
  const completedColonizations = (empire.pendingColonizations ?? []).filter(c => c.completesAtTick <= currentTick);
  const remainingPendingColonizations = (empire.pendingColonizations ?? []).filter(c => c.completesAtTick > currentTick);
  const newColonizedPlanets = Array.from(new Set([
    ...empire.colonizedPlanets,
    ...completedColonizations.map(c => c.planetId),
  ]));

  // Advance research
  let researchProgress = empire.researchProgress;
  let researchQueue = empire.researchQueue;
  let completedResearch = [...empire.completedResearch];

  if (researchQueue) {
    const node = RESEARCH_BY_ID[researchQueue];
    if (node) {
      const pointsPerTick = rates.research;
      researchProgress += pointsPerTick;
      if (researchProgress >= node.costResearch) {
        completedResearch = [...completedResearch, researchQueue];
        researchQueue = null;
        researchProgress = 0;
      }
    }
  }

  return {
    resources: newResources,
    resourceRates: rates,
    infrastructure: updatedInfra,
    groundOps: updatedGroundOps,
    orbitalStructures: updatedOrbitals,
    surveyedSystems: newSurveyedSystems,
    pendingSurveys: remainingPendingSurveys,
    colonizedPlanets: newColonizedPlanets,
    pendingColonizations: remainingPendingColonizations,
    researchProgress,
    researchQueue,
    completedResearch,
    score: computeScore(empire, newResources),
  };
}

function computeScore(empire: Empire, resources: Resources): number {
  return (
    empire.controlledSystems.length * 100 +
    empire.colonizedPlanets.length * 50 +
    empire.completedResearch.length * 30 +
    empire.ships.length * 10 +
    Math.floor(resources.credits / 10)
  );
}

export function canAfford(resources: Resources, costs: {
  mineralCost: number; energyCost: number; creditCost: number;
}): boolean {
  return (
    resources.minerals >= costs.mineralCost &&
    resources.energy   >= costs.energyCost &&
    resources.credits  >= costs.creditCost
  );
}

export function deductCosts(resources: Resources, costs: {
  mineralCost: number; energyCost: number; creditCost: number;
}): Resources {
  return {
    ...resources,
    minerals: resources.minerals - costs.mineralCost,
    energy:   resources.energy   - costs.energyCost,
    credits:  resources.credits  - costs.creditCost,
  };
}

export function getInfraOutput(infra: Infrastructure): Partial<Resources> {
  return INFRA_CONFIG[infra.type].output;
}

export function countUsedSlots(planetId: string, infrastructure: Infrastructure[]): number {
  return infrastructure
    .filter(i => i.planetId === planetId)
    .reduce((sum, i) => sum + INFRA_CONFIG[i.type].slots, 0);
}
