import type { Empire, Ship, CombatReport, GameEvent } from '@/types/game';
import { SeededRandom } from '@/lib/noise';

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
