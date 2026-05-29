import type { Empire, Resources, Infrastructure } from '@/types/game';
import { INFRA_CONFIG, STATION_CONFIG, GROUND_OP_CONFIG, ORBITAL_CONFIG } from './constants';
import { RESEARCH_BY_ID } from './research-tree';

// ─── Civilization production bonus helper ──────────────────────────────────────
// Applied to production rates BEFORE population consumption so multipliers
// affect net output, not consumption side-effects.

function applyCivProductionBonuses(empire: Empire, rates: Resources): void {
  const civ = empire.civilization;
  if (!civ) return;

  // ── Species ───────────────────────────────────────────────────────────────
  switch (civ.speciesType) {
    case 'humanoid':
      // +10% all production
      (Object.keys(rates) as (keyof Resources)[]).forEach(k => {
        if (rates[k] > 0) rates[k] = Math.round(rates[k] * 1.10);
      });
      break;
    case 'fungal':
      if (rates.research > 0) rates.research = Math.round(rates.research * 1.30);
      break;
    case 'synthetic':
      if (rates.compute  > 0) rates.compute  = Math.round(rates.compute  * 1.35);
      break;
    case 'crystalline':
      if (rates.energy   > 0) rates.energy   = Math.round(rates.energy   * 1.30);
      break;
    case 'psionic':
      if (rates.research > 0) rates.research = Math.round(rates.research * 1.25);
      break;
    case 'gaseous':
      if (rates.energy   > 0) rates.energy   = Math.round(rates.energy   * 1.20);
      break;
    case 'aquatic': {
      const hw = civ.homeWorldType;
      if (hw === 'ocean' || hw === 'swamp' || hw === 'deep_ocean') {
        (Object.keys(rates) as (keyof Resources)[]).forEach(k => {
          if (rates[k] > 0) rates[k] = Math.round(rates[k] * 1.35);
        });
      } else if (hw === 'arid' || hw === 'desert' || hw === 'volcanic') {
        (Object.keys(rates) as (keyof Resources)[]).forEach(k => {
          if (rates[k] > 0) rates[k] = Math.round(rates[k] * 0.80);
        });
      }
      break;
    }
    // insectoid: build speed only (handled in getBuildSpeedMultiplier)
  }

  // ── Government ────────────────────────────────────────────────────────────
  switch (civ.government) {
    case 'democracy':
      if (rates.credits  > 0) rates.credits  = Math.round(rates.credits  * 1.20);
      break;
    case 'theocracy':
      if (rates.research > 0) rates.research = Math.round(rates.research * 1.20);
      if (rates.credits  > 0) rates.credits  = Math.round(rates.credits  * 0.85);
      break;
    case 'oligarchy':
      if (rates.credits    > 0) rates.credits    = Math.round(rates.credits    * 1.30);
      if (rates.population > 0) rates.population = Math.round(rates.population * 0.85);
      break;
    case 'military_junta':
      if (rates.research > 0) rates.research = Math.round(rates.research * 0.80);
      break;
    case 'federation':
      if (rates.credits  > 0) rates.credits  = Math.round(rates.credits  * 1.15);
      break;
    // hive_mind: build speed only
  }

  // ── Cultural focus ────────────────────────────────────────────────────────
  switch (civ.culturalFocus) {
    case 'scientific':
      if (rates.research > 0) rates.research = Math.round(rates.research * 1.35);
      break;
    case 'commercial':
      if (rates.credits  > 0) rates.credits  = Math.round(rates.credits  * 1.35);
      break;
    // militaristic, isolationist: ship bonuses at build time
    // expansionist: colonization time, handled elsewhere
    // diplomatic: no direct resource rate effect
  }

  // ── Traits ────────────────────────────────────────────────────────────────
  for (const trait of (civ.traits ?? [])) {
    switch (trait) {
      case 'industrious':
        if (rates.minerals   > 0) rates.minerals   = Math.round(rates.minerals   * 1.20);
        break;
      case 'intelligent':
        if (rates.research   > 0) rates.research   = Math.round(rates.research   * 1.20);
        break;
      case 'entrepreneurial':
        if (rates.credits    > 0) rates.credits    = Math.round(rates.credits    * 1.20);
        break;
      case 'populous':
        if (rates.population > 0) rates.population = Math.round(rates.population * 1.25);
        break;
      case 'wasteful':
        // -15% ALL resource production (positive rates only)
        (Object.keys(rates) as (keyof Resources)[]).forEach(k => {
          if (k !== 'population' && rates[k] > 0) rates[k] = Math.round(rates[k] * 0.85);
        });
        break;
      case 'primitive':
        if (rates.research   > 0) rates.research   = Math.round(rates.research   * 0.80);
        break;
      // resilient, fragile, swift, sluggish: applied at ship build time
      // adaptive: colonization logic; psychic, xenophobic: diplomacy
    }
  }
}

// ─── Main computation ──────────────────────────────────────────────────────────

export function computeResourceRates(empire: Empire, currentTick = 0): Resources {
  // Baseline homeworld output (small, so buildings matter)
  const rates: Resources = {
    energy: 4,
    food: 0,
    minerals: 3,
    research: 4,
    compute: 0,
    credits: 8,
    population: 0,
  };

  const resourceBonuses = getResearchBonuses(empire, 'resource_rate');

  let energyUpkeep = 0;
  for (const infra of empire.infrastructure) {
    if (!infra.active) continue;
    const cfg = INFRA_CONFIG[infra.type];
    const out = cfg.output;
    for (const [key, val] of Object.entries(out) as [keyof Resources, number][]) {
      const bonus = 1 + (resourceBonuses[key] ?? 0) / 100;
      rates[key] = (rates[key] || 0) + val * bonus;
    }
    energyUpkeep += cfg.upkeep ?? 0;
  }
  // Ground colony buildings draw from the planetary power grid
  rates.energy -= energyUpkeep;

  // Active resource operations
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

  // Population growth: fed colonies grow toward a housing cap. Growth needs food
  // in the bank (famine, below, shrinks population) and free housing.
  const colonies = empire.colonizedPlanets.length;
  const colonyHubs = empire.infrastructure.filter(i => i.active && i.type === 'colony_hub').length;
  const housingCap = colonies > 0 ? 30 + colonies * 30 + colonyHubs * 120 : 0;
  const popNow = empire.resources.population;
  if (colonies > 0 && popNow < housingCap && empire.resources.food > 0) {
    const popBonus = 1 + (resourceBonuses['population'] ?? 0) / 100;
    rates.population += colonies * popBonus;
  }

  // Trade routes: each trade-partner relation generates commerce income
  const tradePartners = (empire.diplomacy ?? []).filter(d => d.status === 'trade_partner').length;
  if (tradePartners > 0) rates.credits += tradePartners * 15;

  // ── Apply civilization production bonuses ─────────────────────────────────
  // (done before population consumption so multipliers scale output, not loss)
  applyCivProductionBonuses(empire, rates);

  // ── Population: consumption and derived output ────────────────────────────
  const pop = empire.resources.population;

  const isSynthetic = empire.civilization?.speciesType === 'synthetic';
  const hungerMult  = empire.civilization?.traits?.includes('hungry') ? 1.5 : 1;

  if (!isSynthetic) {
    rates.food -= Math.ceil(pop * 0.4 * hungerMult);
  }
  rates.energy   -= Math.ceil(pop * 0.12);   // citizens draw a little power too
  rates.credits  += Math.floor(pop * 0.5);   // taxes
  rates.research += Math.floor(pop * 0.3);   // educated workforce

  // Fleet upkeep: each warship costs credits to maintain
  const shipCount = empire.ships?.length ?? 0;
  if (shipCount > 0) rates.credits -= shipCount * 2;

  // ── Brownout: a depleted power grid in deficit throttles production ────────
  // (energy producers keep running, so building more solar/fusion recovers it)
  if (empire.resources.energy <= 0 && rates.energy < 0) {
    for (const k of ['minerals', 'research', 'credits', 'compute'] as (keyof Resources)[]) {
      if (rates[k] > 0) rates[k] = Math.round(rates[k] * 0.6);
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
  let mult = 1 + (bonuses[category] ?? 0) / 100;

  // Civilization bonuses
  const civ = empire.civilization;
  if (civ) {
    if (civ.speciesType === 'insectoid') mult *= 1.25;
    if (civ.government  === 'hive_mind') mult *= 1.25;
    if (civ.government  === 'democracy') mult *= 0.90;
  }

  return mult;
}

// Build duration after research/civ build-speed bonuses (min 1 tick).
export function buildTicksFor(empire: Empire, category: 'infrastructure' | 'station' | 'ship', base: number): number {
  return Math.max(1, Math.round(base / getBuildSpeedMultiplier(empire, category)));
}

export function applyTick(empire: Empire, currentTick: number): Partial<Empire> {
  const rates = computeResourceRates(empire, currentTick);
  const newResources = { ...empire.resources };

  for (const key of Object.keys(rates) as (keyof Resources)[]) {
    newResources[key] = Math.max(0, (newResources[key] || 0) + rates[key]);
  }

  // Colony Hub first-activation bonus: +10 pop one-time
  // (populous trait gives +25% on hub activations)
  let hubBonus = 0;
  for (const infra of empire.infrastructure) {
    if (infra.type === 'colony_hub' && !infra.active && infra.buildCompletedTick <= currentTick) {
      hubBonus += 12;
    }
  }
  if (hubBonus > 0) {
    const popMult = empire.civilization?.traits?.includes('populous') ? 1.25 : 1;
    newResources.population += Math.round(hubBonus * popMult);
  }

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
      // Compute (from AI datacenters / AI techs) accelerates research throughput.
      const pointsPerTick = rates.research + Math.max(0, rates.compute);
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
