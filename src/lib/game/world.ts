import type { Empire, GameMeta, Resources, GameEvent, AssemblyVote, GalaxyData } from '@/types/game';
import { ANOMALY_EFFECTS } from './constants';
import { getResearchBonuses } from './economy';

// ════════════════════════════════════════════════════════════════════════════
//  SENSOR VISION — fleets and sensors reveal the fog of war
// ════════════════════════════════════════════════════════════════════════════

// Systems an empire reveals this tick: any system it has a (non-transit) fleet in,
// plus systems adjacent to sensor-equipped fleets and active orbital sensors.
export function computeSensorReveals(empire: Empire, galaxy: GalaxyData): string[] {
  const reveal = new Set<string>();
  const sysById = new Map(galaxy.systems.map(s => [s.id, s] as const));
  const shipById = new Map((empire.ships ?? []).map(s => [s.id, s] as const));

  for (const f of (empire.fleets ?? [])) {
    if (f.state === 'in_transit') continue;
    reveal.add(f.systemId);
    const hasSensor = f.shipIds.some(id => (shipById.get(id)?.tiles ?? []).some(t => t.type === 'sensor_array'));
    if (hasSensor) for (const c of (sysById.get(f.systemId)?.connections ?? [])) reveal.add(c);
  }
  for (const o of (empire.orbitalStructures ?? [])) {
    if (!o.active || o.type !== 'orbital_sensor') continue;
    reveal.add(o.systemId);
    for (const c of (sysById.get(o.systemId)?.connections ?? [])) reveal.add(c);
  }

  // Sensor-range research (e.g. Basic/Tachyon Sensors) passively scans the
  // systems bordering your territory.
  const sensorTier = getResearchBonuses(empire, 'ship_stat')['sensorRange'] ?? 0;
  if (sensorTier > 0) {
    for (const sysId of empire.controlledSystems) {
      reveal.add(sysId);
      for (const c of (sysById.get(sysId)?.connections ?? [])) reveal.add(c);
    }
  }
  return Array.from(reveal);
}

// ════════════════════════════════════════════════════════════════════════════
//  ANOMALIES — investigated when an empire first surveys the system they're in
// ════════════════════════════════════════════════════════════════════════════

// Concrete one-time resource grants for each anomaly type. (The flavour text in
// ANOMALY_EFFECTS describes the theme; here we grant tangible resources.)
export const ANOMALY_GRANTS: Record<string, Partial<Resources>> = {
  ancient_ruins:      { credits: 500, research: 200 },
  derelict_ship:      { minerals: 300, credits: 150 },
  quantum_fissure:    { research: 350 },
  dark_matter_cloud:  { energy: 300, compute: 40 },
  time_anomaly:       { research: 150, compute: 80 },
  precursor_artifact: { compute: 180, research: 100 },
  psionic_resonance:  { credits: 250, research: 120 },
  void_rift:          { credits: 350, minerals: 100 },
};

export interface AnomalyResult {
  grants: Partial<Resources>;
  resolvedPlanetIds: string[];
  events: GameEvent[];
}

/** Resolve any unclaimed anomalies on planets in the newly-surveyed systems. */
export function resolveAnomalies(
  empire: Empire, game: GameMeta, newlySurveyed: string[], tick: number,
): AnomalyResult {
  const resolved = new Set(empire.resolvedAnomalies ?? []);
  const grants: Partial<Resources> = {};
  const resolvedPlanetIds: string[] = [];
  const events: GameEvent[] = [];

  for (const sysId of newlySurveyed) {
    const sys = game.galaxy.systems.find(s => s.id === sysId);
    if (!sys) continue;
    for (const p of sys.planets) {
      if (!p.hasAnomaly || !p.anomalyType || resolved.has(p.id)) continue;
      const grant = ANOMALY_GRANTS[p.anomalyType] ?? {};
      for (const [k, v] of Object.entries(grant) as [keyof Resources, number][]) {
        grants[k] = (grants[k] ?? 0) + v;
      }
      resolvedPlanetIds.push(p.id);
      events.push({
        id: `evt_${tick}_anom_${p.id}`,
        type: 'anomaly',
        message: `${empire.username} investigated a ${p.anomalyType.replace(/_/g, ' ')} at ${sys.name} — ${ANOMALY_EFFECTS[p.anomalyType] ?? 'a strange discovery'}`,
        tick, empireId: empire.id, systemId: sysId, planetId: p.id,
      });
    }
  }
  return { grants, resolvedPlanetIds, events };
}

// ════════════════════════════════════════════════════════════════════════════
//  GALACTIC ASSEMBLY — predefined resolutions with concrete galaxy-wide effects
// ════════════════════════════════════════════════════════════════════════════

export type AssemblyResolutionKey =
  | 'research_grant' | 'trade_pact' | 'mining_charter' | 'energy_subsidy' | 'galactic_peace';

export const ASSEMBLY_RESOLUTIONS: Record<AssemblyResolutionKey, {
  label: string; description: string; grant?: Partial<Resources>; peace?: boolean;
}> = {
  research_grant: { label: 'Research Initiative',   description: '+300 research to every empire', grant: { research: 300 } },
  trade_pact:     { label: 'Galactic Trade Pact',   description: '+250 credits to every empire',  grant: { credits: 250 } },
  mining_charter: { label: 'Mining Charter',        description: '+200 minerals to every empire', grant: { minerals: 200 } },
  energy_subsidy: { label: 'Energy Subsidy',        description: '+150 energy to every empire',   grant: { energy: 150 } },
  galactic_peace: { label: 'Galactic Peace Accord', description: 'Ends all active wars',            peace: true },
};

export interface AssemblyResolveResult {
  updatedAssembly: AssemblyVote[];
  /** empireId → resource grant to add */
  grants: Record<string, Partial<Resources>>;
  /** empireIds whose diplomacy should reset all wars to neutral */
  peaceEmpireIds: Set<string>;
  events: GameEvent[];
  changed: boolean;
}

/** Close & tally any assembly votes whose window has elapsed, applying effects. */
export function resolveAssembly(empires: Empire[], game: GameMeta, tick: number): AssemblyResolveResult {
  const assembly = game.assembly ?? [];
  const grants: Record<string, Partial<Resources>> = {};
  const peaceEmpireIds = new Set<string>();
  const events: GameEvent[] = [];
  let changed = false;

  const updatedAssembly = assembly.map(vote => {
    if (vote.resolved || tick <= vote.closesAtTick) return vote;
    changed = true;
    const yes = Object.values(vote.votes).filter(Boolean).length;
    const no  = Object.values(vote.votes).filter(v => !v).length;
    const passed = yes > no && yes > 0;
    const res = ASSEMBLY_RESOLUTIONS[vote.effect as AssemblyResolutionKey];

    if (passed && res) {
      if (res.grant) {
        for (const e of empires) {
          grants[e.id] = grants[e.id] ?? {};
          for (const [k, v] of Object.entries(res.grant) as [keyof Resources, number][]) {
            grants[e.id][k] = (grants[e.id][k] ?? 0) + v;
          }
        }
      }
      if (res.peace) for (const e of empires) peaceEmpireIds.add(e.id);
    }

    events.push({
      id: `evt_${tick}_assembly_${vote.id}`,
      type: 'diplomacy',
      message: passed
        ? `Resolution "${vote.title}" PASSED (${yes}-${no}) — ${res?.description ?? ''}`
        : `Resolution "${vote.title}" was REJECTED (${yes}-${no})`,
      tick, empireId: vote.proposedBy,
    });
    return { ...vote, resolved: true, passed };
  });

  return { updatedAssembly, grants, peaceEmpireIds, events, changed };
}

// ════════════════════════════════════════════════════════════════════════════
//  FIRST CONTACT — empires stay hidden until you can see each other's assets
// ════════════════════════════════════════════════════════════════════════════

export interface ContactResult {
  updates: Record<string, string[]>; // empireId → full new contactedEmpires list
  events: GameEvent[];
}

// An empire "sees" a system it controls, has surveyed, or has a fleet in. Two
// empires make (mutual) first contact when one can see any of the other's
// territory, stations, or fleets.
export function resolveContacts(empires: Empire[], tick: number): ContactResult {
  const vision = new Map<string, Set<string>>();
  for (const e of empires) {
    const s = new Set<string>(e.controlledSystems);
    for (const id of e.surveyedSystems) s.add(id);
    for (const f of (e.fleets ?? [])) if (f.state !== 'in_transit') s.add(f.systemId);
    vision.set(e.id, s);
  }

  const contacts = new Map<string, Set<string>>();
  for (const e of empires) contacts.set(e.id, new Set(e.contactedEmpires ?? []));

  const changed = new Set<string>();
  const events: GameEvent[] = [];

  for (const e of empires) {
    const ev = vision.get(e.id)!;
    for (const f of empires) {
      if (f.id === e.id || contacts.get(e.id)!.has(f.id)) continue;
      const seen =
        f.controlledSystems.some(s => ev.has(s)) ||
        f.stations.some(s => ev.has(s.systemId)) ||
        (f.fleets ?? []).some(fl => fl.state !== 'in_transit' && ev.has(fl.systemId));
      if (!seen) continue;
      contacts.get(e.id)!.add(f.id);
      contacts.get(f.id)!.add(e.id); // contact is mutual
      changed.add(e.id);
      changed.add(f.id);
      events.push({
        id: `evt_${tick}_contact_${e.id}_${f.id}`,
        type: 'diplomacy',
        message: `${e.username} has made first contact with ${f.username}`,
        tick, empireId: e.id, targetEmpireId: f.id,
      });
    }
  }

  const updates: Record<string, string[]> = {};
  for (const id of Array.from(changed)) updates[id] = Array.from(contacts.get(id)!);
  return { updates, events };
}

// ════════════════════════════════════════════════════════════════════════════
//  VICTORY
// ════════════════════════════════════════════════════════════════════════════

export interface VictoryResult {
  winnerId: string;
  winnerName: string;
  victoryType: 'domination';
}

// Domination is the only victory: the last empire still controlling any systems wins.
export function checkVictory(empires: Empire[], _game: GameMeta, _tick: number): VictoryResult | null {
  const real = empires.filter(e => !!e);
  if (real.length < 2) return null;

  const alive = real.filter(e => (e.controlledSystems?.length ?? 0) > 0);
  if (alive.length === 1) {
    return { winnerId: alive[0].id, winnerName: alive[0].username, victoryType: 'domination' };
  }

  return null;
}
