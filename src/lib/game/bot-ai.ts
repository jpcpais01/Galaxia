import type { Empire, GameMeta, SystemState, ShipDesign } from '@/types/game';
import { SeededRandom } from '@/lib/noise';
import { INFRA_CONFIG, STATION_CONFIG, EMPIRE_COLORS } from './constants';
import { canAfford, deductCosts, countUsedSlots } from './economy';
import { STARTING_RESOURCES } from './constants';

export interface BotAction {
  type: 'survey' | 'build_station' | 'colonize' | 'build_infra' | 'research' | 'build_ship' | 'attack' | 'idle';
  payload: Record<string, unknown>;
}

function nearbyUnsurveyed(empire: Empire, game: GameMeta): string[] {
  const surveyed = new Set(empire.surveyedSystems);
  const controlled = new Set(empire.controlledSystems);
  const reachable: string[] = [];

  for (const sysId of [...empire.controlledSystems, ...empire.surveyedSystems]) {
    const sys = game.galaxy.systems.find(s => s.id === sysId);
    if (!sys) continue;
    for (const connId of sys.connections) {
      if (!surveyed.has(connId)) reachable.push(connId);
    }
  }

  return Array.from(new Set(reachable));
}

function claimableSystem(empire: Empire, game: GameMeta): string | null {
  for (const sysId of empire.surveyedSystems) {
    const state = game.systemStates[sysId];
    if (!state?.ownerId && !state?.stationId) return sysId;
  }
  return null;
}

function bestPlanetToColonize(empire: Empire, game: GameMeta): { systemId: string; planetId: string } | null {
  for (const sysId of empire.controlledSystems) {
    const sys = game.galaxy.systems.find(s => s.id === sysId);
    if (!sys) continue;
    for (const planet of sys.planets) {
      if (planet.colonizable && !empire.colonizedPlanets.includes(planet.id)) {
        return { systemId: sysId, planetId: planet.id };
      }
    }
  }
  return null;
}

function bestInfraToBuild(empire: Empire): { planetId: string; systemId: string; type: string } | null {
  const rates = empire.resourceRates;

  // Identify most needed resource
  let needed = 'solar_farm';
  if ((rates.food ?? 0) < 5) needed = 'hydroponic_farm';
  else if ((rates.energy ?? 0) < 20) needed = 'solar_farm';
  else if ((rates.minerals ?? 0) < 15) needed = 'mining_complex';
  else if ((rates.research ?? 0) < 20) needed = 'research_lab';
  else if ((rates.credits ?? 0) < 30) needed = 'trade_hub';
  else needed = empire.completedResearch.includes('ai_1') ? 'ai_datacenter' : 'research_lab';

  const cfg = INFRA_CONFIG[needed as keyof typeof INFRA_CONFIG];

  for (const sysId of empire.controlledSystems) {
    const sys = empire.infrastructure.filter(i => i.systemId === sysId);
    const sys2 = null; // galaxy lookup done by caller
    for (const planetId of empire.colonizedPlanets) {
      const used = countUsedSlots(planetId, empire.infrastructure);
      const planet = { infraSlots: 20 }; // fallback; real call passes galaxy
      if (used + cfg.slots <= planet.infraSlots) {
        if (canAfford(empire.resources, cfg)) {
          return { planetId, systemId: sysId, type: needed };
        }
      }
    }
  }
  return null;
}

export function decideBotAction(empire: Empire, game: GameMeta, tick: number): BotAction {
  const rng = new SeededRandom(tick * 31337 + empire.id.charCodeAt(4));

  // Phase 1: Make sure we can survey and claim home system
  if (empire.controlledSystems.length === 0) {
    const homeState = game.systemStates[empire.homeSystemId];
    if (!homeState?.ownerId) {
      if (!empire.surveyedSystems.includes(empire.homeSystemId)) {
        return { type: 'survey', payload: { systemId: empire.homeSystemId } };
      }
      return { type: 'build_station', payload: { systemId: empire.homeSystemId } };
    }
  }

  // Phase 2: Colonize best available planet
  if (empire.colonizedPlanets.length < 3 || rng.next() < 0.3) {
    const target = bestPlanetToColonize(empire, game);
    if (target && empire.resources.credits >= 100) {
      return { type: 'colonize', payload: target };
    }
  }

  // Phase 3: Build infrastructure on colonized planets
  if (empire.colonizedPlanets.length > 0 && rng.next() < 0.5) {
    const infra = bestInfraToBuild(empire);
    if (infra) return { type: 'build_infra', payload: infra };
  }

  // Phase 4: Expand by surveying nearby systems
  const unsurveyed = nearbyUnsurveyed(empire, game);
  if (unsurveyed.length > 0 && rng.next() < 0.6) {
    const target = rng.pick(unsurveyed);
    return { type: 'survey', payload: { systemId: target } };
  }

  // Phase 5: Claim surveyed unclaimed systems
  const claimable = claimableSystem(empire, game);
  if (claimable && canAfford(empire.resources, STATION_CONFIG.space_station)) {
    return { type: 'build_station', payload: { systemId: claimable } };
  }

  // Phase 6: Research if we have points
  if (empire.researchQueue === null && empire.resources.research >= 60) {
    const paths = ['physics', 'biology', 'engineering', 'ai', 'spirituality'] as const;
    const path = rng.pick(paths);
    return { type: 'research', payload: { path } };
  }

  // Phase 7: Build a ship if we have a shipyard
  const hasShipyard = empire.infrastructure.some(i => i.type === 'shipyard' && i.active);
  if (hasShipyard && empire.ships.length < 5 && empire.resources.minerals >= 300) {
    return { type: 'build_ship', payload: {} };
  }

  // Phase 8: Attack weakest nearby enemy
  if (empire.ships.length >= 3 && rng.next() < 0.15) {
    for (const sysId of empire.surveyedSystems) {
      const state = game.systemStates[sysId];
      if (state?.ownerId && state.ownerId !== empire.id) {
        return { type: 'attack', payload: { systemId: sysId, targetEmpireId: state.ownerId } };
      }
    }
  }

  return { type: 'idle', payload: {} };
}

export function createBotEmpire(index: number, homeSystemId: string, totalEmpires: number): Omit<Empire, 'id'> {
  const botNames = [
    'Hegemony of Xar', 'Keth Dominion', 'Void Collective', 'Iron Covenant',
    'Luminary Pact', 'Nexus Syndicate', 'Ember Horde', 'Stellar Union',
    'Obsidian Fleet', 'Nova Republic', 'Crystal Conclave', 'Phantom Empire',
    'Titan Alliance', 'Epoch Order', 'Genesis Confederation',
  ];

  return {
    playerId: `bot_${index}`,
    username: botNames[index % botNames.length] + (index >= botNames.length ? ` ${Math.floor(index / botNames.length) + 1}` : ''),
    color: EMPIRE_COLORS[(index + 4) % EMPIRE_COLORS.length],
    isBot: true,
    botMemory: { phase: 'expand', threatLevel: 0, lastDecisionTick: 0 },
    homeSystemId,
    resources: { ...STARTING_RESOURCES },
    resourceRates: { energy: 5, food: 0, minerals: 0, research: 5, compute: 0, credits: 10, population: 0 },
    controlledSystems: [],
    colonizedPlanets: [],
    infrastructure: [],
    stations: [],
    ships: [],
    shipDesigns: [defaultBotShipDesign()],
    completedResearch: [],
    researchQueue: null,
    researchProgress: 0,
    diplomacy: [],
    surveyedSystems: [homeSystemId],
    pendingSurveys: [],
    pendingColonizations: [],
    groundOps: [],
    isOnline: true,
    lastSeen: Date.now(),
    score: 0,
  };
}

function defaultBotShipDesign(): ShipDesign {
  return {
    id: 'bot_default',
    name: 'Scout',
    tiles: [
      { type: 'cockpit',          x: 1, y: 0, hp: 40, maxHp: 40 },
      { type: 'laser_cannon',     x: 0, y: 1, hp: 20, maxHp: 20 },
      { type: 'shield_generator', x: 1, y: 1, hp: 30, maxHp: 30 },
      { type: 'thruster',         x: 2, y: 1, hp: 25, maxHp: 25 },
      { type: 'thruster',         x: 1, y: 2, hp: 25, maxHp: 25 },
    ],
    attack: 12, defense: 20, speed: 8,
    mineralCost: 100, energyCost: 20, creditCost: 50, buildTicks: 15,
  };
}
