import type {
  Empire, GameMeta, ShipDesign, GameEvent, Resources, InfraType,
} from '@/types/game';
import { SeededRandom } from '@/lib/noise';
import { INFRA_CONFIG, STATION_CONFIG, ORBITAL_CONFIG, EMPIRE_COLORS, STARTING_RESOURCES } from './constants';
import { canAfford, deductCosts, countUsedSlots } from './economy';
import { RESEARCH_TREE } from './research-tree';
import { instantiateShip } from './ship-designer';
import { findPath } from './galaxy-generator';

// What a bot turn produces — applied as a single empire write by processTick so
// it never races the combat resolver.
export interface BotResult {
  patch: Partial<Empire>;
  systemStateWrites: { path: string; value: unknown }[];
  events: GameEvent[];
}

// ─── Decision helpers ────────────────────────────────────────────────────────

function nearbyUnsurveyed(empire: Empire, game: GameMeta): string[] {
  const surveyed = new Set(empire.surveyedSystems);
  const reachable: string[] = [];
  for (const sysId of [...empire.controlledSystems, ...empire.surveyedSystems]) {
    const sys = game.galaxy.systems.find(s => s.id === sysId);
    if (!sys) continue;
    for (const connId of sys.connections) if (!surveyed.has(connId)) reachable.push(connId);
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

/** Pick the most-needed infra type given current rates; falls back to shipyard. */
function chooseInfra(empire: Empire): InfraType {
  const rates = empire.resourceRates;
  if ((rates.food ?? 0) < 5)      return 'hydroponic_farm';
  if ((rates.energy ?? 0) < 20)   return 'solar_farm';
  if ((rates.minerals ?? 0) < 18) return 'mining_complex';
  if ((rates.credits ?? 0) < 25)  return 'trade_hub';
  if ((rates.research ?? 0) < 20) return 'research_lab';
  // Economy is healthy — invest in a shipyard if we lack one
  const hasShipyard = empire.infrastructure.some(i => i.type === 'shipyard');
  if (!hasShipyard) return 'shipyard';
  return empire.completedResearch.includes('ai_1') ? 'ai_datacenter' : 'research_lab';
}

/** First research node whose prerequisites are met and isn't done yet (cheapest). */
function nextResearch(empire: Empire): string | null {
  const done = new Set(empire.completedResearch);
  const candidates = RESEARCH_TREE
    .filter(n => !done.has(n.id) && n.prerequisites.every(p => done.has(p)))
    .sort((a, b) => a.costResearch - b.costResearch);
  return candidates[0]?.id ?? null;
}

/** Nearest enemy-owned system reachable from one of the bot's controlled systems. */
function findAttackTarget(empire: Empire, game: GameMeta): { systemId: string; ownerId: string } | null {
  const allowed = new Set([...empire.surveyedSystems, ...empire.controlledSystems]);
  let best: { systemId: string; ownerId: string; hops: number } | null = null;
  for (const sysId of empire.surveyedSystems) {
    const st = game.systemStates[sysId];
    if (!st?.ownerId || st.ownerId === empire.id) continue;
    // reachable from any controlled system?
    let minHops = Infinity;
    for (const home of empire.controlledSystems) {
      const path = findPath(game.galaxy, home, sysId, allowed);
      if (path && path.length < minHops) minHops = path.length;
    }
    if (minHops === Infinity) continue;
    if (!best || minHops < best.hops) best = { systemId: sysId, ownerId: st.ownerId, hops: minHops };
  }
  return best ? { systemId: best.systemId, ownerId: best.ownerId } : null;
}

// ─── Main bot turn ─────────────────────────────────────────────────────────────

export function runBotTurn(empire: Empire, game: GameMeta, tick: number, allEmpires: Empire[] = []): BotResult {
  const rng = new SeededRandom(tick * 31337 + (empire.id.charCodeAt(4) || 7));
  const events: GameEvent[] = [];
  const ssw: { path: string; value: unknown }[] = [];

  // Working copies
  const r: Resources = { ...empire.resources };
  let surveyed   = [...empire.surveyedSystems];
  let colonized  = [...empire.colonizedPlanets];
  let controlled = [...empire.controlledSystems];
  let infra      = [...empire.infrastructure];
  let stations   = [...empire.stations];
  let ships      = [...empire.ships];
  let fleets     = (empire.fleets ?? []).map(f => ({ ...f }));
  const orbitals = [...(empire.orbitalStructures ?? [])];
  const pendingInv = [...(empire.pendingInvestigations ?? [])];
  const resolvedAnom = new Set(empire.resolvedAnomalies ?? []);
  let researchQueue = empire.researchQueue;
  let researchProgress = empire.researchProgress;

  const touched = { surveyed: false, colonized: false, controlled: false, infra: false,
    stations: false, ships: false, fleets: false, research: false, resources: false,
    orbitals: false, investigations: false };

  // Threat detection: is any other empire's fleet sitting in our controlled space?
  const myControlled = new Set(controlled);
  const homeThreatened = allEmpires.some(o =>
    o.id !== empire.id &&
    (o.fleets ?? []).some(f => f.state !== 'in_transit' && myControlled.has(f.systemId)));

  // 0. Bootstrap home system
  if (controlled.length === 0) {
    const homeState = game.systemStates[empire.homeSystemId];
    if (!homeState?.ownerId) {
      if (!surveyed.includes(empire.homeSystemId)) {
        surveyed.push(empire.homeSystemId); touched.surveyed = true;
        ssw.push({ path: `systemStates.${empire.homeSystemId}.surveyedBy`, value: 'ARRAY_UNION' });
      }
      const cfg = STATION_CONFIG.space_station;
      if (canAfford(r, cfg) && !game.systemStates[empire.homeSystemId]?.stationId) {
        Object.assign(r, deductCosts(r, cfg)); touched.resources = true;
        stations.push({
          id: `stn_${tick}_${empire.id}`, type: 'space_station', systemId: empire.homeSystemId,
          level: 1, ownerId: empire.id, buildStartedTick: tick, buildCompletedTick: tick + cfg.buildTicks,
          hp: cfg.hp, maxHp: cfg.hp,
        });
        touched.stations = true;
        ssw.push({ path: `systemStates.${empire.homeSystemId}.stationId`, value: `stn_${tick}_${empire.id}` });
      }
    }
  }

  // 1. Research
  if (!researchQueue) {
    const node = nextResearch(empire);
    if (node) { researchQueue = node; researchProgress = 0; touched.research = true; }
  }

  // 1b. Investigate an anomaly in surveyed space (host applies fallback grants)
  if (r.credits >= 120 && r.research >= 40 && rng.next() < 0.5) {
    const pendingPlanets = new Set(pendingInv.map(p => p.planetId));
    outer: for (const sysId of surveyed) {
      const sys = game.galaxy.systems.find(s => s.id === sysId);
      if (!sys) continue;
      for (const p of sys.planets) {
        if (p.hasAnomaly && p.anomalyType && !resolvedAnom.has(p.id) && !pendingPlanets.has(p.id)) {
          pendingInv.push({ planetId: p.id, systemId: sysId, anomalyType: p.anomalyType, completesAtTick: tick + 6 });
          r.credits -= 120; r.research -= 40;
          touched.investigations = true; touched.resources = true;
          break outer;
        }
      }
    }
  }

  // 2. Colonize a planet in controlled space
  if (rng.next() < 0.5 && r.credits >= 150) {
    const target = bestPlanetToColonize({ ...empire, colonizedPlanets: colonized, controlledSystems: controlled }, game);
    if (target) {
      colonized.push(target.planetId); touched.colonized = true;
      r.credits -= 150; touched.resources = true;
    }
  }

  // 3. Build infrastructure on a colonized planet
  if (colonized.length > 0 && rng.next() < 0.6) {
    const type = chooseInfra({ ...empire, infrastructure: infra });
    const cfg = INFRA_CONFIG[type];
    if (canAfford(r, cfg)) {
      for (const sysId of controlled) {
        const sys = game.galaxy.systems.find(s => s.id === sysId);
        if (!sys) continue;
        const planet = sys.planets.find(p => colonized.includes(p.id));
        if (!planet) continue;
        const used = countUsedSlots(planet.id, infra);
        if (used + cfg.slots <= planet.infraSlots) {
          Object.assign(r, deductCosts(r, cfg)); touched.resources = true;
          infra.push({
            id: `infra_${tick}_${empire.id}_${infra.length}`, type, level: 1,
            planetId: planet.id, systemId: sysId,
            buildStartedTick: tick, buildCompletedTick: tick + cfg.buildTicks, active: false,
          });
          touched.infra = true;
          break;
        }
      }
    }
  }

  // 4. Survey outward
  if (rng.next() < 0.6) {
    const options = nearbyUnsurveyed({ ...empire, surveyedSystems: surveyed, controlledSystems: controlled }, game);
    if (options.length > 0) {
      const pick = rng.pick(options);
      surveyed.push(pick); touched.surveyed = true;
      ssw.push({ path: `systemStates.${pick}.surveyedBy`, value: 'ARRAY_UNION' });
    }
  }

  // 5. Claim a surveyed, unclaimed system
  const claim = claimableSystem({ ...empire, surveyedSystems: surveyed }, game);
  if (claim && canAfford(r, STATION_CONFIG.space_station)) {
    const cfg = STATION_CONFIG.space_station;
    Object.assign(r, deductCosts(r, cfg)); touched.resources = true;
    const sid = `stn_${tick}_${empire.id}_${stations.length}`;
    stations.push({
      id: sid, type: 'space_station', systemId: claim, level: 1, ownerId: empire.id,
      buildStartedTick: tick, buildCompletedTick: tick + cfg.buildTicks, hp: cfg.hp, maxHp: cfg.hp,
    });
    touched.stations = true;
    ssw.push({ path: `systemStates.${claim}.stationId`, value: sid });
  }

  // 5b. Fortify: build a defense platform over a colonised world (esp. when threatened)
  if ((homeThreatened || rng.next() < 0.2)) {
    const cfg = ORBITAL_CONFIG.defense_platform;
    if (canAfford(r, cfg)) {
      for (const sysId of controlled) {
        const sys = game.galaxy.systems.find(s => s.id === sysId);
        if (!sys) continue;
        const planet = sys.planets.find(p => colonized.includes(p.id) && !orbitals.some(o => o.planetId === p.id && o.type === 'defense_platform'));
        if (!planet) continue;
        Object.assign(r, deductCosts(r, cfg)); touched.resources = true;
        orbitals.push({
          id: `orb_${tick}_${empire.id}_${orbitals.length}`,
          type: 'defense_platform', planetId: planet.id, systemId: sysId,
          buildStartedTick: tick, buildCompletedTick: tick + cfg.buildTicks,
          active: false, hp: cfg.hp, maxHp: cfg.hp,
        });
        touched.orbitals = true;
        break;
      }
    }
  }

  // 6. Build a warship at a shipyard system
  const shipyardSys = infra.find(i => i.type === 'shipyard' && i.active)?.systemId
    ?? infra.find(i => i.type === 'shipyard')?.systemId;
  const design = empire.shipDesigns[0];
  if (shipyardSys && design && ships.length < 8 && canAfford(r, design)) {
    Object.assign(r, deductCosts(r, design)); touched.resources = true;
    ships.push(instantiateShip({ ...empire, ships }, design, shipyardSys, tick, ships.length + 1));
    touched.ships = true;
  }

  // 7. Form a fleet from built, unassigned ships gathered in one system
  const assigned = new Set<string>();
  for (const f of fleets) for (const sid of f.shipIds) assigned.add(sid);
  const freeBuilt = ships.filter(s => !assigned.has(s.id) && (s.buildCompletedTick ?? 0) <= tick);
  if (freeBuilt.length >= 2) {
    const sysId = freeBuilt[0].systemId;
    const here = freeBuilt.filter(s => s.systemId === sysId);
    if (here.length >= 2) {
      fleets.push({
        id: `fleet_${tick}_${empire.id}`,
        name: `${empire.username.split(' ')[0]} Fleet`,
        empireId: empire.id, systemId: sysId,
        posX: 0.5, posY: 0.5,
        shipIds: here.map(s => s.id),
        state: 'idle',
      });
      touched.fleets = true;
    }
  }

  // 8. Send an idle fleet to attack the nearest enemy system — but only if home
  //    is secure and the fleet is strong enough to be worth committing.
  if (!homeThreatened && rng.next() < 0.4) {
    const strikeFleet = fleets.find(f => f.state === 'idle' && f.shipIds.length >= 3 && !f.task);
    if (strikeFleet) {
      const target = findAttackTarget({ ...empire, surveyedSystems: surveyed, controlledSystems: controlled }, game);
      if (target && target.systemId !== strikeFleet.systemId) {
        const allowed = new Set([...surveyed, ...controlled]);
        const path = findPath(game.galaxy, strikeFleet.systemId, target.systemId, allowed) ?? [target.systemId];
        strikeFleet.state = 'in_transit';
        strikeFleet.transitFromSystemId = strikeFleet.systemId;
        strikeFleet.transitToSystemId = path[0];
        strikeFleet.transitPath = path;
        strikeFleet.transitProgress = 0;
        strikeFleet.task = { type: 'attack_station', targetSystemId: target.systemId, targetEmpireId: target.ownerId };
        touched.fleets = true;
        events.push({
          id: `evt_${tick}_botatk_${empire.id}`,
          type: 'combat',
          message: `${empire.username} dispatched a war fleet toward enemy territory`,
          tick, empireId: empire.id, systemId: target.systemId, targetEmpireId: target.ownerId,
        });
      }
    }
  }

  // Assemble patch (only touched fields)
  const patch: Partial<Empire> = {};
  if (touched.resources)  patch.resources = r;
  if (touched.surveyed)   patch.surveyedSystems = Array.from(new Set(surveyed));
  if (touched.colonized)  patch.colonizedPlanets = Array.from(new Set(colonized));
  if (touched.controlled) patch.controlledSystems = Array.from(new Set(controlled));
  if (touched.infra)      patch.infrastructure = infra;
  if (touched.stations)   patch.stations = stations;
  if (touched.ships)      patch.ships = ships;
  if (touched.fleets)     patch.fleets = fleets;
  if (touched.orbitals)   patch.orbitalStructures = orbitals;
  if (touched.investigations) patch.pendingInvestigations = pendingInv;
  if (touched.research)   { patch.researchQueue = researchQueue; patch.researchProgress = researchProgress; }

  return { patch, systemStateWrites: ssw, events };
}

// ─── Empire factory ─────────────────────────────────────────────────────────────

export function createBotEmpire(index: number, homeSystemId: string, _totalEmpires: number): Omit<Empire, 'id'> {
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
    groundOps: [],
    stations: [],
    ships: [],
    fleets: [],
    orbitalStructures: [],
    shipDesigns: [defaultBotShipDesign()],
    completedResearch: [],
    researchQueue: null,
    researchProgress: 0,
    diplomacy: [],
    surveyedSystems: [homeSystemId],
    pendingSurveys: [],
    pendingColonizations: [],
    isOnline: true,
    lastSeen: Date.now(),
    score: 0,
  };
}

function defaultBotShipDesign(): ShipDesign {
  return {
    id: 'bot_default',
    name: 'Marauder',
    tiles: [
      { type: 'cockpit',          x: 1, y: 0, hp: 40, maxHp: 40 },
      { type: 'laser_cannon',     x: 0, y: 1, hp: 20, maxHp: 20 },
      { type: 'shield_generator', x: 1, y: 1, hp: 30, maxHp: 30 },
      { type: 'laser_cannon',     x: 2, y: 1, hp: 20, maxHp: 20 },
      { type: 'thruster',         x: 1, y: 2, hp: 25, maxHp: 25 },
    ],
    attack: 24, defense: 20, speed: 8,
    mineralCost: 150, energyCost: 25, creditCost: 70, buildTicks: 12,
  };
}
