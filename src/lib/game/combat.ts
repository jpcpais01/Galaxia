import type {
  Empire, Ship, CombatReport, GameEvent, Fleet,
  Station, OrbitalStructure, GameMeta,
} from '@/types/game';
import { SeededRandom } from '@/lib/noise';
import { STATION_CONFIG, ORBITAL_CONFIG, TILE_CONFIG } from './constants';

// ─── Damage typing (kinetic / energy / explosive) ──────────────────────────────
type DmgVec = { kinetic: number; energy: number; explosive: number };
const zeroVec = (): DmgVec => ({ kinetic: 0, energy: 0, explosive: 0 });

// A ship's offensive output split by damage type, scaled to preserve the flat
// ship.attack (which already includes civ/research multipliers).
function shipOffenseByType(ship: Ship): DmgVec {
  const base = zeroVec();
  for (const t of ship.tiles) {
    const c = TILE_CONFIG[t.type];
    if (c && c.attack > 0 && c.damageType) base[c.damageType] += c.attack;
  }
  const total = base.kinetic + base.energy + base.explosive;
  if (total <= 0) return { kinetic: ship.attack, energy: 0, explosive: 0 };
  const k = ship.attack / total;
  return { kinetic: base.kinetic * k, energy: base.energy * k, explosive: base.explosive * k };
}

// A ship's resistance by type (typed defenses + general defense applied to all).
function shipResistByType(ship: Ship): DmgVec {
  const base = zeroVec();
  let general = 0;
  for (const t of ship.tiles) {
    const c = TILE_CONFIG[t.type];
    if (c && c.defense > 0) { if (c.resistType) base[c.resistType] += c.defense; else general += c.defense; }
  }
  const total = base.kinetic + base.energy + base.explosive + general;
  if (total <= 0) { const g = ship.defense / 3; return { kinetic: g, energy: g, explosive: g }; }
  const k = ship.defense / total;
  const g = general * k;
  return {
    kinetic:   base.kinetic   * k + g,
    energy:    base.energy    * k + g,
    explosive: base.explosive * k + g,
  };
}

export interface CombatResult {
  report: CombatReport;
  attackerEmpire: Partial<Empire>;
  defenderEmpire: Partial<Empire>;
  event: GameEvent;
}

function shipPower(ships: Ship[]): { attack: number; defense: number; total: number } {
  const attack  = ships.reduce((s, sh) => s + sh.attack, 0);
  const defense = ships.reduce((s, sh) => s + sh.defense, 0);
  return { attack, defense, total: attack + defense };
}

function damageShips(ships: Ship[], damage: number, rng: SeededRandom): Ship[] {
  const result = [...ships];
  let remaining = damage;
  while (remaining > 0 && result.length > 0) {
    const idx = rng.int(0, result.length - 1);
    const ship = { ...result[idx] };
    const dmg = Math.min(remaining, ship.hp);
    ship.hp -= dmg;
    remaining -= dmg;
    if (ship.hp <= 0) {
      result.splice(idx, 1);
    } else {
      result[idx] = ship;
    }
  }
  return result;
}

export function resolveCombat(
  attacker: Empire,
  defender: Empire,
  systemId: string,
  tick: number,
  seed: number
): CombatResult {
  const rng = new SeededRandom(seed);

  const attackerShips = attacker.ships.filter(s => s.systemId === systemId);
  const defenderShips = defender.ships.filter(s => s.systemId === systemId);

  if (attackerShips.length === 0) {
    return makeNoContest(attacker, defender, systemId, tick, false);
  }
  if (defenderShips.length === 0) {
    return makeNoContest(attacker, defender, systemId, tick, true);
  }

  const aP = shipPower(attackerShips);
  const dP = shipPower(defenderShips);

  // Simulate rounds until one side is eliminated
  let aCurrent = [...attackerShips];
  let dCurrent = [...defenderShips];
  let rounds = 0;

  while (aCurrent.length > 0 && dCurrent.length > 0 && rounds < 20) {
    const aPow = shipPower(aCurrent);
    const dPow = shipPower(dCurrent);

    // Attacker fires: damage = attack - (defender defense / 3), min 1
    const aDmg = Math.max(1, aPow.attack - Math.floor(dPow.defense / 3)) + rng.int(-2, 4);
    const dDmg = Math.max(1, dPow.attack - Math.floor(aPow.defense / 3)) + rng.int(-2, 4);

    dCurrent = damageShips(dCurrent, aDmg, rng);
    aCurrent = damageShips(aCurrent, dDmg, rng);
    rounds++;
  }

  const attackerWon = aCurrent.length > 0 && dCurrent.length === 0;
  const attackerLosses = attackerShips.length - aCurrent.length;
  const defenderLosses = defenderShips.length - dCurrent.length;

  const report: CombatReport = {
    id: `combat_${tick}_${systemId}`,
    tick,
    systemId,
    attackerId: attacker.id,
    defenderId: defender.id,
    attackerShips: attackerShips.length,
    defenderShips: defenderShips.length,
    attackerLosses,
    defenderLosses,
    attackerWon,
  };

  const survivingAttackerIds = new Set(aCurrent.map(s => s.id));
  const survivingDefenderIds = new Set(dCurrent.map(s => s.id));

  const attackerUpdatedShips = attacker.ships.map(s =>
    s.systemId === systemId && !survivingAttackerIds.has(s.id)
      ? { ...s, hp: 0 }
      : aCurrent.find(a => a.id === s.id) ?? s
  ).filter(s => s.hp > 0);

  const defenderUpdatedShips = defender.ships.map(s =>
    s.systemId === systemId && !survivingDefenderIds.has(s.id)
      ? { ...s, hp: 0 }
      : dCurrent.find(d => d.id === s.id) ?? s
  ).filter(s => s.hp > 0);

  const event: GameEvent = {
    id: `evt_${tick}_combat_${systemId}`,
    type: 'combat',
    message: attackerWon
      ? `${attacker.username} defeated ${defender.username} at ${systemId} (+${defenderLosses} kills, -${attackerLosses} lost)`
      : `${attacker.username} was repelled by ${defender.username} at ${systemId} (-${attackerLosses} ships)`,
    tick,
    empireId: attacker.id,
    targetEmpireId: defender.id,
    systemId,
  };

  return {
    report,
    attackerEmpire: { ships: attackerUpdatedShips },
    defenderEmpire: { ships: defenderUpdatedShips },
    event,
  };
}

function makeNoContest(
  attacker: Empire, defender: Empire,
  systemId: string, tick: number, attackerWon: boolean
): CombatResult {
  const report: CombatReport = {
    id: `combat_${tick}_${systemId}`,
    tick, systemId,
    attackerId: attacker.id, defenderId: defender.id,
    attackerShips: attacker.ships.filter(s => s.systemId === systemId).length,
    defenderShips: defender.ships.filter(s => s.systemId === systemId).length,
    attackerLosses: 0, defenderLosses: 0, attackerWon,
  };
  const event: GameEvent = {
    id: `evt_${tick}_combat_${systemId}`,
    type: 'combat',
    message: attackerWon
      ? `${attacker.username} took uncontested control of ${systemId}`
      : `${attacker.username} retreated from ${systemId}`,
    tick, empireId: attacker.id, targetEmpireId: defender.id, systemId,
  };
  return { report, attackerEmpire: {}, defenderEmpire: {}, event };
}

// ─── Fleet combat helpers ───────────────────────────────────────────────────

export function computeFleetDamageToStation(_fleet: Fleet, fleetShips: Ship[], stationDefense: number): number {
  const attack = fleetShips.reduce((s, sh) => s + sh.attack, 0);
  return Math.max(1, attack - Math.floor(stationDefense / 2));
}

export function computeFleetDamageToGarrison(_fleet: Fleet, fleetShips: Ship[], garrisonDefense: number): number {
  const attack = fleetShips.reduce((s, sh) => s + sh.attack, 0);
  return Math.max(1, Math.floor(attack * 0.6) - Math.floor(garrisonDefense / 3));
}

export function combatRound(
  attackerShips: Ship[],
  defenderShips: Ship[],
  rng: SeededRandom
): { attackerShips: Ship[]; defenderShips: Ship[] } {
  if (attackerShips.length === 0 || defenderShips.length === 0) {
    return { attackerShips, defenderShips };
  }
  const aPow = shipPower(attackerShips);
  const dPow = shipPower(defenderShips);
  const aDmg = Math.max(1, aPow.attack - Math.floor(dPow.defense / 3)) + rng.int(-2, 4);
  const dDmg = Math.max(1, dPow.attack - Math.floor(aPow.defense / 3)) + rng.int(-2, 4);
  const newDefender = damageShips(defenderShips, aDmg, rng);
  const newAttacker = damageShips(attackerShips, dDmg, rng);
  return { attackerShips: newAttacker, defenderShips: newDefender };
}

export function getShipStats(tiles: Ship['tiles']): { attack: number; defense: number; speed: number; hp: number } {
  return tiles.reduce(
    (acc, t) => ({
      attack:  acc.attack  + (t.hp > 0 ? 0 : 0), // tile stats come from tile config
      defense: acc.defense,
      speed:   acc.speed,
      hp:      acc.hp + t.hp,
    }),
    { attack: 0, defense: 0, speed: 0, hp: 0 }
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  COMPREHENSIVE PER-SYSTEM BATTLE RESOLVER
//  One simultaneous combat round per game tick. Handles:
//    • Fleet vs Fleet
//    • Defense structures (stations, orbital defense platforms) firing on fleets
//    • Fleets bombarding enemy stations / orbital structures once fleets cleared
//    • Planet bombardment → destroys orbital structures, then decolonizes
//    • System ownership cleared when an owner loses their last station ("free")
// ════════════════════════════════════════════════════════════════════════════

const ATTACK_TASKS = new Set(['attack_fleet', 'attack_station', 'attack_planet']);

function strHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

function stationHp(s: Station): number {
  return s.hp ?? STATION_CONFIG[s.type].hp;
}

/** Hostility: at_war (mutual check) OR an explicit attack task between the two. */
function areHostile(a: Empire, b: Empire): boolean {
  const ra = (a.diplomacy ?? []).find(d => d.empireId === b.id);
  const rb = (b.diplomacy ?? []).find(d => d.empireId === a.id);
  if (ra?.status === 'at_war' || rb?.status === 'at_war') return true;
  for (const f of (a.fleets ?? [])) {
    if (f.task && ATTACK_TASKS.has(f.task.type) && f.task.targetEmpireId === b.id) return true;
  }
  for (const f of (b.fleets ?? [])) {
    if (f.task && ATTACK_TASKS.has(f.task.type) && f.task.targetEmpireId === a.id) return true;
  }
  return false;
}

export interface CombatDeltas {
  shipUpdates:       Record<string, Ship[]>;
  fleetUpdates:      Record<string, Fleet[]>;
  stationUpdates:    Record<string, Station[]>;
  orbitalUpdates:    Record<string, OrbitalStructure[]>;
  colonizedUpdates:  Record<string, string[]>;   // empireId → new colonizedPlanets
  controlledUpdates: Record<string, string[]>;    // empireId → new controlledSystems
  ownershipCleared:  string[];                     // systemIds that became neutral
  events:            GameEvent[];
  changedEmpireIds:  Set<string>;
  // Empires whose controlled/colonized lists were actually mutated by combat.
  // (Only these get those fields written, so we never clobber same-tick claims.)
  controlledChanged: Set<string>;
  colonizedChanged:  Set<string>;
}

interface Working {
  ships:      Map<string, Ship[]>;
  fleets:     Map<string, Fleet[]>;
  stations:   Map<string, Station[]>;
  orbitals:   Map<string, OrbitalStructure[]>;
  colonized:  Map<string, string[]>;
  controlled: Map<string, string[]>;
}

/** Distribute `dmg` across a list of ships, removing any that drop to 0 hp. */
function damageShipsInPlace(ships: Ship[], dmg: number, rng: SeededRandom): { remaining: number; killed: number } {
  let remaining = dmg;
  let killed = 0;
  // Spread fire: hit random ships until damage is spent or all dead
  let guard = 0;
  while (remaining > 0 && ships.length > 0 && guard < 1000) {
    guard++;
    const idx = rng.int(0, ships.length - 1);
    const ship = ships[idx];
    const applied = Math.min(remaining, ship.hp);
    ship.hp -= applied;
    remaining -= applied;
    if (ship.hp <= 0) { ships.splice(idx, 1); killed++; }
  }
  return { remaining, killed };
}

export function resolveAllCombat(empires: Empire[], game: GameMeta, tick: number): CombatDeltas {
  const w: Working = {
    ships:      new Map(),
    fleets:     new Map(),
    stations:   new Map(),
    orbitals:   new Map(),
    colonized:  new Map(),
    controlled: new Map(),
  };
  for (const e of empires) {
    w.ships.set(e.id, e.ships.map(s => ({ ...s })));
    w.fleets.set(e.id, (e.fleets ?? []).map(f => ({ ...f })));
    w.stations.set(e.id, e.stations.map(s => ({
      ...s,
      hp:    stationHp(s),
      maxHp: s.maxHp ?? STATION_CONFIG[s.type].hp,
    })));
    w.orbitals.set(e.id, (e.orbitalStructures ?? []).map(o => ({ ...o })));
    w.colonized.set(e.id, [...e.colonizedPlanets]);
    w.controlled.set(e.id, [...e.controlledSystems]);
  }

  const changed = new Set<string>();
  const controlledChanged = new Set<string>();
  const colonizedChanged = new Set<string>();
  const events: GameEvent[] = [];
  const ownershipCleared: string[] = [];
  const fightingFleetIds = new Set<string>();

  // Gather all systems that contain any combat-capable asset
  const systemIds = new Set<string>();
  for (const e of empires) {
    for (const f of w.fleets.get(e.id)!) if (f.state !== 'in_transit') systemIds.add(f.systemId);
    for (const s of w.stations.get(e.id)!) systemIds.add(s.systemId);
    for (const o of w.orbitals.get(e.id)!) if (o.active) systemIds.add(o.systemId);
  }

  const empById = new Map(empires.map(e => [e.id, e] as const));

  for (const sysId of Array.from(systemIds)) {
    const sysName = game.galaxy.systems.find(s => s.id === sysId)?.name ?? sysId;

    // Which empires are present (fleet/station/active orbital) in this system?
    const present = empires.filter(e =>
      w.fleets.get(e.id)!.some(f => f.systemId === sysId && f.state !== 'in_transit') ||
      w.stations.get(e.id)!.some(s => s.systemId === sysId) ||
      w.orbitals.get(e.id)!.some(o => o.systemId === sysId && o.active),
    );
    if (present.length < 2) continue;

    // Build hostile relationships
    const enemiesOf = new Map<string, Empire[]>();
    for (const e of present) {
      enemiesOf.set(e.id, present.filter(o => o.id !== e.id && areHostile(e, o)));
    }
    if (present.every(e => enemiesOf.get(e.id)!.length === 0)) continue;

    // Helper accessors scoped to this system
    const sysFleetShips = (eid: string): Ship[] => {
      const fleetShipIds = new Set<string>();
      for (const f of w.fleets.get(eid)!) {
        if (f.systemId === sysId && f.state !== 'in_transit') {
          for (const sid of f.shipIds) fleetShipIds.add(sid);
        }
      }
      return w.ships.get(eid)!.filter(s => fleetShipIds.has(s.id) && s.hp > 0);
    };
    const sysStations  = (eid: string) => w.stations.get(eid)!.filter(s => s.systemId === sysId && (s.hp ?? 0) > 0);
    const sysPlatforms = (eid: string) => w.orbitals.get(eid)!.filter(o => o.systemId === sysId && o.active && o.hp > 0);

    // ── 1. Compute each empire's offensive output, choose a target ──────────
    const rng = new SeededRandom(tick * 7919 + strHash(sysId));
    const incoming = new Map<string, DmgVec>();   // empireId → damage to take, by type

    for (const e of present) {
      const foes = enemiesOf.get(e.id)!;
      if (foes.length === 0) continue;

      const myShips     = sysFleetShips(e.id);
      const myStations  = sysStations(e.id);
      const myPlatforms = sysPlatforms(e.id);

      // Offensive output by damage type (stations → kinetic, platforms → energy)
      const off = zeroVec();
      for (const s of myShips) { const o = shipOffenseByType(s); off.kinetic += o.kinetic; off.energy += o.energy; off.explosive += o.explosive; }
      for (const s of myStations)  off.kinetic += STATION_CONFIG[s.type].attack;
      for (const o of myPlatforms) off.energy  += ORBITAL_CONFIG[o.type].attack;
      const offTotal = off.kinetic + off.energy + off.explosive;
      if (offTotal <= 0) continue;
      const varMul = 0.85 + rng.next() * 0.3;
      off.kinetic *= varMul; off.energy *= varMul; off.explosive *= varMul;

      // Choose target: explicit attack-task target if it's a present foe, else strongest foe
      let target: Empire | undefined;
      for (const f of w.fleets.get(e.id)!) {
        if (f.systemId === sysId && f.task && ATTACK_TASKS.has(f.task.type)) {
          const t = foes.find(o => o.id === f.task!.targetEmpireId);
          if (t) { target = t; break; }
        }
      }
      if (!target) {
        target = foes.slice().sort((a, b) => {
          const power = (x: Empire) =>
            sysFleetShips(x.id).reduce((s, sh) => s + sh.hp, 0) +
            sysStations(x.id).reduce((s, st) => s + (st.hp ?? 0), 0);
          return power(b) - power(a);
        })[0];
      }
      if (!target) continue;

      const inc = incoming.get(target.id) ?? zeroVec();
      inc.kinetic += off.kinetic; inc.energy += off.energy; inc.explosive += off.explosive;
      incoming.set(target.id, inc);

      // Mark this empire's fleets in-system as fighting
      for (const f of w.fleets.get(e.id)!) {
        if (f.systemId === sysId && f.state !== 'in_transit') fightingFleetIds.add(f.id);
      }
    }

    if (incoming.size === 0) continue;

    // ── 2. Apply damage simultaneously (per-type mitigation) ────────────────
    const lossSummary: { empireId: string; shipsLost: number; stationsLost: number; structsLost: number }[] = [];

    for (const [eid, incVec] of Array.from(incoming.entries())) {
      const myShips     = sysFleetShips(eid);
      const myStations  = sysStations(eid);
      const myPlatforms = sysPlatforms(eid);

      // Resistance pool by type (typed ship defenses + structure defense as general)
      const resist = zeroVec();
      for (const s of myShips) { const r = shipResistByType(s); resist.kinetic += r.kinetic; resist.energy += r.energy; resist.explosive += r.explosive; }
      const structDef =
        myStations.reduce((a, s) => a + STATION_CONFIG[s.type].defense, 0) +
        myPlatforms.reduce((a, o) => a + ORBITAL_CONFIG[o.type].defense, 0);
      resist.kinetic += structDef; resist.energy += structDef; resist.explosive += structDef;

      // Each damage type is mitigated by its own resistance; shields counter
      // energy, armour counters kinetic, ECM counters explosive.
      let dmg = 0;
      (['kinetic', 'energy', 'explosive'] as const).forEach(t => {
        const d = incVec[t];
        if (d > 0) dmg += Math.max(Math.ceil(d * 0.25), d - Math.floor(resist[t] / 2));
      });
      dmg = Math.round(dmg);

      const aRng = new SeededRandom(tick * 104729 + strHash(sysId + eid));

      // (a) fleet ships first
      const shipsBefore = myShips.length;
      const { remaining, killed } = damageShipsInPlace(myShips, dmg, aRng);
      const shipsLost = killed;
      dmg = remaining;

      // (b) overflow to orbital structures (defense platforms shield the colony)
      let structsLost = 0;
      if (dmg > 0 && myPlatforms.length > 0) {
        // hit platforms in order (defensive ones soak first)
        for (const o of myPlatforms) {
          if (dmg <= 0) break;
          const applied = Math.min(dmg, o.hp);
          o.hp -= applied;
          dmg -= applied;
          if (o.hp <= 0) structsLost++;
        }
      }

      // (c) overflow to stations
      let stationsLost = 0;
      if (dmg > 0 && myStations.length > 0) {
        for (const s of myStations) {
          if (dmg <= 0) break;
          const cur = s.hp ?? 0;
          const applied = Math.min(dmg, cur);
          s.hp = cur - applied;
          dmg -= applied;
          if ((s.hp ?? 0) <= 0) stationsLost++;
        }
      }

      if (shipsLost > 0 || stationsLost > 0 || structsLost > 0 || shipsBefore > 0) {
        changed.add(eid);
        lossSummary.push({ empireId: eid, shipsLost, stationsLost, structsLost });
      }
    }

    // ── 3. Clean up destroyed assets & propagate ───────────────────────────
    // Remove dead ships from ship arrays and fleet shipId lists
    for (const e of present) {
      const aliveIds = new Set(w.ships.get(e.id)!.filter(s => s.hp > 0).map(s => s.id));
      if (aliveIds.size !== w.ships.get(e.id)!.length) changed.add(e.id);
      w.ships.set(e.id, w.ships.get(e.id)!.filter(s => s.hp > 0));
      let fleetList = w.fleets.get(e.id)!.map(f => ({
        ...f,
        shipIds: f.shipIds.filter(sid => aliveIds.has(sid)),
      }));
      // Disband fleets that lost all ships
      const beforeCount = fleetList.length;
      fleetList = fleetList.filter(f => f.shipIds.length > 0);
      if (fleetList.length !== beforeCount) changed.add(e.id);
      w.fleets.set(e.id, fleetList);
    }

    // Remove destroyed orbital structures
    for (const e of present) {
      const before = w.orbitals.get(e.id)!.length;
      const survivors = w.orbitals.get(e.id)!.filter(o => o.hp > 0);
      if (survivors.length !== before) {
        changed.add(e.id);
        w.orbitals.set(e.id, survivors);
      }
    }

    // Remove destroyed stations & clear ownership if owner lost last station here
    for (const e of present) {
      const stationsHere = w.stations.get(e.id)!.filter(s => s.systemId === sysId);
      const destroyed    = stationsHere.filter(s => (s.hp ?? 0) <= 0);
      if (destroyed.length === 0) continue;
      changed.add(e.id);
      w.stations.set(e.id, w.stations.get(e.id)!.filter(s => (s.hp ?? 0) > 0 || s.systemId !== sysId));

      const stillHasStation = w.stations.get(e.id)!.some(s => s.systemId === sysId);
      const wasOwner = game.systemStates[sysId]?.ownerId === e.id;
      if (!stillHasStation && wasOwner) {
        // Free the system — becomes neutral
        ownershipCleared.push(sysId);
        w.controlled.set(e.id, w.controlled.get(e.id)!.filter(id => id !== sysId));
        controlledChanged.add(e.id);
        events.push({
          id: `evt_${tick}_conq_${sysId}_${e.id}`,
          type: 'conquest',
          message: `${e.username}'s station at ${sysName} was destroyed — the system is now contested`,
          tick, empireId: e.id, systemId: sysId,
        });
      }
    }

    // ── 4. Planet bombardment: fleets with attack_planet decolonise defenceless planets ──
    for (const e of present) {
      for (const f of w.fleets.get(e.id)!) {
        if (f.systemId !== sysId) continue;
        if (f.task?.type !== 'attack_planet' || !f.task.targetPlanetId || !f.task.targetEmpireId) continue;
        const targetId  = f.task.targetEmpireId;
        const planetId  = f.task.targetPlanetId;
        const targetEmp = empById.get(targetId);
        if (!targetEmp) continue;
        // Planet is defended if owner has any active orbital structure on it
        const planetDefended = w.orbitals.get(targetId)!.some(o => o.planetId === planetId && o.hp > 0);
        const ownerColonized = w.colonized.get(targetId)!.includes(planetId);
        if (!planetDefended && ownerColonized) {
          w.colonized.set(targetId, w.colonized.get(targetId)!.filter(id => id !== planetId));
          // also remove ground ops / infra tied to that planet stay (owner keeps system if station intact)
          changed.add(targetId);
          colonizedChanged.add(targetId);
          events.push({
            id: `evt_${tick}_bomb_${planetId}_${e.id}`,
            type: 'conquest',
            message: `${e.username} bombarded ${sysName} into submission — a colony was lost`,
            tick, empireId: e.id, targetEmpireId: targetId, systemId: sysId, planetId,
          });
        }
      }
    }

    // ── 5. One combat-summary event per system per tick ─────────────────────
    if (lossSummary.length > 0) {
      const parts = lossSummary
        .filter(l => l.shipsLost + l.stationsLost + l.structsLost > 0)
        .map(l => {
          const emp = empById.get(l.empireId);
          const bits: string[] = [];
          if (l.shipsLost > 0)   bits.push(`${l.shipsLost} ship${l.shipsLost > 1 ? 's' : ''}`);
          if (l.stationsLost > 0) bits.push(`${l.stationsLost} station${l.stationsLost > 1 ? 's' : ''}`);
          if (l.structsLost > 0)  bits.push(`${l.structsLost} structure${l.structsLost > 1 ? 's' : ''}`);
          return bits.length ? `${emp?.username ?? l.empireId} lost ${bits.join(', ')}` : null;
        })
        .filter(Boolean);
      if (parts.length > 0) {
        events.push({
          id: `evt_${tick}_battle_${sysId}`,
          type: 'combat',
          message: `Battle at ${sysName}: ${parts.join('; ')}`,
          tick, empireId: present[0].id, systemId: sysId,
        });
      }
    }
  }

  // ── 6. Finalise fleet states: fighting if engaged, else clear stale fighting ──
  for (const e of empires) {
    const list = w.fleets.get(e.id)!;
    let mutated = false;
    const next = list.map(f => {
      if (fightingFleetIds.has(f.id)) {
        if (f.state !== 'fighting') { mutated = true; return { ...f, state: 'fighting' as const }; }
        return f;
      }
      // Was fighting but no longer engaged → return to idle (clear attack task)
      if (f.state === 'fighting') {
        mutated = true;
        const cleared = { ...f, state: 'idle' as const };
        if (cleared.task && ATTACK_TASKS.has(cleared.task.type)) delete cleared.task;
        return cleared;
      }
      // Clear attack tasks whose target empire is gone from the fleet's system
      if (f.task && ATTACK_TASKS.has(f.task.type) && f.task.targetEmpireId) {
        const targetEmp = empById.get(f.task.targetEmpireId);
        const targetStillHere =
          targetEmp && (
            (w.fleets.get(targetEmp.id) ?? []).some(tf => tf.systemId === f.systemId) ||
            (w.stations.get(targetEmp.id) ?? []).some(s => s.systemId === f.systemId) ||
            (w.orbitals.get(targetEmp.id) ?? []).some(o => o.systemId === f.systemId)
          );
        if (!targetStillHere) {
          mutated = true;
          const cleared = { ...f };
          delete cleared.task;
          return cleared;
        }
      }
      return f;
    });
    if (mutated) { w.fleets.set(e.id, next); changed.add(e.id); }
  }

  // ── 7. Build deltas (only for changed empires) ──────────────────────────────
  const deltas: CombatDeltas = {
    shipUpdates: {}, fleetUpdates: {}, stationUpdates: {}, orbitalUpdates: {},
    colonizedUpdates: {}, controlledUpdates: {},
    ownershipCleared, events, changedEmpireIds: changed,
    controlledChanged, colonizedChanged,
  };
  for (const eid of Array.from(changed)) {
    deltas.shipUpdates[eid]       = w.ships.get(eid)!;
    deltas.fleetUpdates[eid]      = w.fleets.get(eid)!;
    deltas.stationUpdates[eid]    = w.stations.get(eid)!;
    deltas.orbitalUpdates[eid]    = w.orbitals.get(eid)!;
  }
  for (const eid of Array.from(controlledChanged)) deltas.controlledUpdates[eid] = w.controlled.get(eid)!;
  for (const eid of Array.from(colonizedChanged))  deltas.colonizedUpdates[eid]  = w.colonized.get(eid)!;
  return deltas;
}
