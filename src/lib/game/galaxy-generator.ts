import type { GalaxyData, StarSystem, Star, Planet, Moon, StarType, PlanetType } from '@/types/game';
import { SeededRandom } from '@/lib/noise';
import {
  GALAXY_WIDTH, GALAXY_HEIGHT, SYSTEM_COUNT, MIN_SYSTEM_DISTANCE,
  CONNECTION_MAX_DISTANCE, COLONIZABLE_TYPES, ANOMALY_TYPES, PLANET_TYPE_LIST,
} from './constants';

const STAR_WEIGHTS: { type: StarType; weight: number }[] = [
  { type: 'yellow',      weight: 35 },
  { type: 'orange',      weight: 25 },
  { type: 'red_dwarf',   weight: 20 },
  { type: 'blue_giant',  weight: 10 },
  { type: 'white_dwarf', weight: 8  },
  { type: 'neutron',     weight: 2  },
];

const SYS_NAME_PREFIXES = [
  'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Theta', 'Kappa',
  'Sigma', 'Omega', 'Nova', 'Proxima', 'Cygni', 'Vega', 'Lyrae', 'Aquilae',
  'Eridani', 'Ceti', 'Hydra', 'Ophiuchi', 'Tauri', 'Orionis', 'Cassio',
  'Draconis', 'Androm', 'Persei', 'Velorum', 'Centauri', 'Carinae',
];

const SYS_NAME_SUFFIXES = [
  ' Prime', ' Major', ' Minor', ' Secundus', ' III', ' IV', ' VII',
  ' B', ' C', '-I', '-II', ' Magna', ' Nova', ' Ultima', '',
];

const PLANET_SYLLABLES = [
  'Ker', 'Dun', 'Val', 'Nar', 'Tor', 'Zel', 'Pyr', 'Ax',
  'Mir', 'Sol', 'Lun', 'Ast', 'Orb', 'Vex', 'Hex', 'Qua',
  'Xen', 'Phy', 'Cry', 'Gal', 'Neb', 'Pul', 'Qua', 'Rift',
];

function pickWeighted<T>(rng: SeededRandom, items: { type: T; weight: number }[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rng.next() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item.type;
  }
  return items[items.length - 1].type;
}

function systemName(rng: SeededRandom): string {
  const pre = rng.pick(SYS_NAME_PREFIXES);
  const suf = rng.pick(SYS_NAME_SUFFIXES);
  return pre + suf;
}

function planetName(rng: SeededRandom): string {
  const syl1 = rng.pick(PLANET_SYLLABLES);
  const syl2 = rng.pick(PLANET_SYLLABLES);
  const num = rng.int(1, 9);
  return `${syl1}${syl2.toLowerCase()} ${num}`;
}

function moonName(parentName: string, index: number): string {
  return `${parentName}-${String.fromCharCode(97 + index)}`;
}

function pickPlanetType(rng: SeededRandom, orbit: number, totalOrbits: number): PlanetType {
  const normalized = orbit / totalOrbits;
  const colonizableTypes: PlanetType[] = [
    'continental', 'ocean', 'arid', 'tundra', 'jungle',
    'savanna', 'arctic', 'volcanic', 'fungal', 'swamp',
  ];
  const hotTypes: PlanetType[] = ['molten', 'volcanic', 'irradiated', 'desert'];
  const coldTypes: PlanetType[] = ['frozen', 'arctic', 'tundra', 'ice_giant'];
  const midTypes: PlanetType[] = ['continental', 'ocean', 'arid', 'jungle', 'savanna', 'swamp', 'fungal'];
  const giantTypes: PlanetType[] = ['gas_giant', 'ice_giant', 'storm', 'deep_ocean'];
  const barrenTypes: PlanetType[] = ['barren', 'toxic', 'desert', 'storm'];

  const lifeProbability = normalized > 0.1 && normalized < 0.7 ? 0.35 : 0.05;

  if (rng.next() < lifeProbability) return rng.pick(colonizableTypes);
  if (normalized <= 0.15) return rng.pick(hotTypes);
  if (normalized <= 0.55 && rng.next() < 0.5) return rng.pick(midTypes);
  if (normalized >= 0.7 && rng.next() < 0.6) return rng.pick(giantTypes);
  if (normalized >= 0.85) return rng.pick(coldTypes);
  return rng.pick(barrenTypes);
}

function makePlanet(rng: SeededRandom, orbit: number, totalOrbits: number, systemId: string): Planet {
  const type = pickPlanetType(rng, orbit, totalOrbits);
  const colonizable = COLONIZABLE_TYPES.has(type);
  const size = rng.int(1, 5);
  const moonCount = type === 'gas_giant' || type === 'ice_giant'
    ? rng.int(1, 3)
    : rng.int(0, 2);

  const hasResources = rng.next() < 0.20;
  const hasAnomaly = rng.next() < 0.05;
  const infraSlots = colonizable ? rng.int(5, 20) : 0;

  const name = planetName(rng);
  const seed = rng.int(0, 99999);

  const moons: Moon[] = [];
  for (let i = 0; i < moonCount; i++) {
    moons.push({
      id: `${systemId}_${name}_m${i}`,
      name: moonName(name, i),
      type: rng.pick(['barren', 'frozen', 'desert', 'irradiated'] as PlanetType[]),
      hasResources: rng.next() < 0.15,
      seed: rng.int(0, 99999),
    });
  }

  const HOME_TYPE: PlanetType = 'continental';
  const typeSim: Partial<Record<PlanetType, number>> = {
    continental: 100, ocean: 65, arid: 50, jungle: 70,
    savanna: 60, swamp: 55, tundra: 45, arctic: 40,
    volcanic: 30, fungal: 35,
  };
  const similarity = typeSim[type] ?? 0;

  return {
    id: `${systemId}_p${orbit}`,
    name,
    type,
    size,
    moons,
    colonizable: colonizable && similarity >= 50,
    similarity,
    hasResources,
    hasAnomaly,
    anomalyType: hasAnomaly ? rng.pick(ANOMALY_TYPES) : undefined,
    anomalyRevealed: false,
    infraSlots,
    orbit,
    seed,
  };
}

function poissonDisk(rng: SeededRandom, width: number, height: number, count: number, minDist: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const margin = 150;
  const minDistSq = minDist * minDist;
  const cellSize = minDist;
  const cols = Math.ceil((width + cellSize) / cellSize);
  const grid = new Map<number, { x: number; y: number }[]>();

  for (let attempt = 0; attempt < count * 30 && points.length < count; attempt++) {
    const x = rng.range(margin, width - margin);
    const y = rng.range(margin, height - margin);
    const gx = Math.floor(x / cellSize);
    const gy = Math.floor(y / cellSize);

    let tooClose = false;
    outer: for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cell = grid.get((gx + dx) + (gy + dy) * cols);
        if (!cell) continue;
        for (const p of cell) {
          const ddx = p.x - x; const ddy = p.y - y;
          if (ddx * ddx + ddy * ddy < minDistSq) { tooClose = true; break outer; }
        }
      }
    }

    if (!tooClose) {
      points.push({ x, y });
      const key = gx + gy * cols;
      const cell = grid.get(key);
      if (cell) cell.push({ x, y }); else grid.set(key, [{ x, y }]);
    }
  }

  return points;
}

export function generateGalaxy(seed: number): GalaxyData {
  const rng = new SeededRandom(seed);

  const positions = poissonDisk(rng, GALAXY_WIDTH, GALAXY_HEIGHT, SYSTEM_COUNT, MIN_SYSTEM_DISTANCE);

  const systems: StarSystem[] = positions.map((pos, i) => {
    const sysRng = new SeededRandom(seed + i * 7919);
    const id = `sys_${i}`;

    const starCount = sysRng.next() < 0.70 ? 1 : sysRng.next() < 0.75 ? 2 : 3;
    const stars: Star[] = [];
    for (let s = 0; s < starCount; s++) {
      stars.push({
        id: `${id}_star${s}`,
        type: pickWeighted(sysRng, STAR_WEIGHTS),
        size: sysRng.int(1, 5),
      });
    }

    const planetCount = sysRng.int(0, 7);
    const planets: Planet[] = [];
    for (let p = 0; p < planetCount; p++) {
      planets.push(makePlanet(sysRng, p + 1, planetCount, id));
    }

    return {
      id,
      name: systemName(sysRng),
      x: Math.round(pos.x),
      y: Math.round(pos.y),
      stars,
      planets,
      connections: [],
    };
  });

  // Build connections: connect each system to nearby systems (Delaunay-ish)
  const maxDistSq = CONNECTION_MAX_DISTANCE * CONNECTION_MAX_DISTANCE;
  for (let i = 0; i < systems.length; i++) {
    const a = systems[i];
    const neighbors: { distSq: number; id: string }[] = [];

    for (let j = 0; j < systems.length; j++) {
      if (i === j) continue;
      const b = systems[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= maxDistSq) {
        neighbors.push({ distSq, id: b.id });
      }
    }

    neighbors.sort((a, b) => a.distSq - b.distSq);
    a.connections = neighbors.slice(0, 5).map(n => n.id);
  }

  // Ensure graph connectivity: connect isolated nodes to their nearest neighbor
  for (const sys of systems) {
    if (sys.connections.length === 0) {
      let nearest = systems[0] === sys ? systems[1] : systems[0];
      let nearestDistSq = Infinity;
      for (const other of systems) {
        if (other === sys) continue;
        const dx = sys.x - other.x;
        const dy = sys.y - other.y;
        const dSq = dx * dx + dy * dy;
        if (dSq < nearestDistSq) { nearestDistSq = dSq; nearest = other; }
      }
      sys.connections.push(nearest.id);
      nearest.connections.push(sys.id);
    }
  }

  return { systems, seed, width: GALAXY_WIDTH, height: GALAXY_HEIGHT };
}

export function findHomeSystem(galaxy: GalaxyData, empireIndex: number): string {
  const systems = [...galaxy.systems];
  const withColonizable = systems.filter(s =>
    s.planets.some(p => p.colonizable)
  );
  const pool = withColonizable.length >= 4 ? withColonizable : systems;
  const step = Math.floor(pool.length / 8);
  const idx = ((empireIndex * (step || 1)) + Math.floor(empireIndex / 2)) % pool.length;
  return pool[idx].id;
}
