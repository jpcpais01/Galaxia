import type { ResearchNode, ResearchPath } from '@/types/game';

const node = (
  id: string, name: string, description: string,
  path: ResearchPath, tier: number, costResearch: number, costCompute: number,
  prerequisites: string[],
  effects: ResearchNode['effects']
): ResearchNode => ({ id, name, description, path, tier, costResearch, costCompute, prerequisites, effects });

// Cost-by-tier curve (research points). Compute cost layered on the upper tiers.
const RC = [0, 60, 150, 280, 460, 700, 1000, 1380, 1850, 2450, 3200, 4200, 5400];

export const RESEARCH_TREE: ResearchNode[] = [
  // ─── PHYSICS — sensors, weapons, shields, energy, FTL ────────────────────────
  node('phys_1', 'Basic Sensors', 'Long-range scanners reveal systems bordering your territory.',
    'physics', 1, RC[1], 0, [],
    [{ type: 'ship_stat', target: 'sensorRange', value: 1 }]),
  node('phys_2', 'Particle Weapons', 'Coilguns and railguns — kinetic firepower.',
    'physics', 2, RC[2], 0, ['phys_1'],
    [{ type: 'ship_stat', target: 'attack', value: 15 }, { type: 'unlock', target: 'railgun', value: 1 }]),
  node('phys_3', 'Deflector Shields', 'Energy shielding hardens your hulls.',
    'physics', 3, RC[3], 20, ['phys_2'],
    [{ type: 'ship_stat', target: 'defense', value: 20 }]),
  node('phys_4', 'FTL Drive', 'Faster-than-light hyperdrives.',
    'physics', 4, RC[4], 40, ['phys_3'],
    [{ type: 'ship_stat', target: 'speed', value: 25 }, { type: 'unlock', target: 'hyperdrive', value: 1 }]),
  node('phys_5', 'Quantum Computing', 'Quantum processors boost compute yields.',
    'physics', 5, RC[5], 60, ['phys_4'],
    [{ type: 'resource_rate', target: 'compute', value: 30 }]),
  node('phys_6', 'Plasma Cannons', 'Superheated plasma tears through armour.',
    'physics', 6, RC[6], 80, ['phys_2'],
    [{ type: 'ship_stat', target: 'attack', value: 20 }]),
  node('phys_7', 'Graviton Shielding', 'Gravity-warped deflectors.',
    'physics', 7, RC[7], 110, ['phys_3', 'phys_6'],
    [{ type: 'ship_stat', target: 'defense', value: 25 }, { type: 'ship_stat', target: 'hp', value: 10 }]),
  node('phys_8', 'Tachyon Sensors', 'See deep into uncharted space; faster targeting.',
    'physics', 8, RC[8], 150, ['phys_5'],
    [{ type: 'ship_stat', target: 'sensorRange', value: 2 }, { type: 'ship_stat', target: 'speed', value: 10 }]),
  node('phys_9', 'Antimatter Reactors', 'Antimatter annihilation powers everything.',
    'physics', 9, RC[9], 200, ['phys_8'],
    [{ type: 'resource_rate', target: 'energy', value: 60 }]),
  node('phys_10', 'Zero-Point Energy', 'Tap the vacuum itself.',
    'physics', 10, RC[10], 280, ['phys_9'],
    [{ type: 'resource_rate', target: 'energy', value: 100 }, { type: 'resource_rate', target: 'compute', value: 30 }]),
  node('phys_11', 'Singularity Cannon', 'Weaponised micro black holes.',
    'physics', 11, RC[11], 380, ['phys_7', 'phys_9'],
    [{ type: 'ship_stat', target: 'attack', value: 35 }]),
  node('phys_12', 'Dimensional Shields', 'Phase armour across folded space.',
    'physics', 12, RC[12], 500, ['phys_10', 'phys_11'],
    [{ type: 'ship_stat', target: 'defense', value: 40 }, { type: 'ship_stat', target: 'hp', value: 25 }]),

  // ─── BIOLOGY — food, population, growth, research ────────────────────────────
  node('bio_1', 'Agri-Tech', 'Improved hydroponic yields.',
    'biology', 1, RC[1], 0, [],
    [{ type: 'resource_rate', target: 'food', value: 20 }]),
  node('bio_2', 'Population Growth', 'Better housing and healthcare.',
    'biology', 2, RC[2], 0, ['bio_1'],
    [{ type: 'resource_rate', target: 'population', value: 15 }]),
  node('bio_3', 'Terraforming I', 'Light planetary modification feeds more colonists.',
    'biology', 3, RC[3], 10, ['bio_2'],
    [{ type: 'resource_rate', target: 'food', value: 25 }]),
  node('bio_4', 'Advanced Genetics', 'Hardier, faster-breeding populations.',
    'biology', 4, RC[4], 30, ['bio_3'],
    [{ type: 'resource_rate', target: 'population', value: 25 }]),
  node('bio_5', 'Transcendence', 'Cognitive enhancement boosts science.',
    'biology', 5, RC[5], 60, ['bio_4'],
    [{ type: 'resource_rate', target: 'research', value: 40 }]),
  node('bio_6', 'Gene Editing', 'Engineer resilient crews and colonists.',
    'biology', 6, RC[6], 80, ['bio_4'],
    [{ type: 'ship_stat', target: 'hp', value: 15 }, { type: 'resource_rate', target: 'population', value: 15 }]),
  node('bio_7', 'Hydroponics II', 'Vertical mega-farms.',
    'biology', 7, RC[7], 110, ['bio_3'],
    [{ type: 'resource_rate', target: 'food', value: 45 }]),
  node('bio_8', 'Cloning Vats', 'Accelerated population replacement.',
    'biology', 8, RC[8], 150, ['bio_6', 'bio_7'],
    [{ type: 'resource_rate', target: 'population', value: 35 }]),
  node('bio_9', 'Neural Uplift', 'Augmented minds across the population.',
    'biology', 9, RC[9], 200, ['bio_5'],
    [{ type: 'resource_rate', target: 'research', value: 50 }]),
  node('bio_10', 'Synthetic Biology', 'Living factories and farms.',
    'biology', 10, RC[10], 280, ['bio_8', 'bio_9'],
    [{ type: 'resource_rate', target: 'food', value: 60 }, { type: 'resource_rate', target: 'credits', value: 25 }]),
  node('bio_11', 'Ascendant Minds', 'A galaxy of geniuses.',
    'biology', 11, RC[11], 380, ['bio_9'],
    [{ type: 'resource_rate', target: 'research', value: 80 }]),
  node('bio_12', 'Galactic Gardens', 'Worlds reshaped into paradise.',
    'biology', 12, RC[12], 500, ['bio_10', 'bio_11'],
    [{ type: 'resource_rate', target: 'population', value: 60 }, { type: 'resource_rate', target: 'food', value: 60 }]),

  // ─── ENGINEERING — build speed, minerals, energy, megastructures ─────────────
  node('eng_1', 'Industrial Automation', 'Faster infrastructure construction.',
    'engineering', 1, RC[1], 0, [],
    [{ type: 'build_speed', target: 'infrastructure', value: 25 }]),
  node('eng_2', 'Advanced Metallurgy', 'Richer mineral extraction.',
    'engineering', 2, RC[2], 0, ['eng_1'],
    [{ type: 'resource_rate', target: 'minerals', value: 20 }]),
  node('eng_3', 'Orbital Construction', 'Faster, cheaper stations.',
    'engineering', 3, RC[3], 20, ['eng_2'],
    [{ type: 'build_speed', target: 'station', value: 30 }]),
  node('eng_4', 'Nanoassembly', 'Molecular fabrication speeds shipbuilding.',
    'engineering', 4, RC[4], 40, ['eng_3'],
    [{ type: 'build_speed', target: 'ship', value: 35 }]),
  node('eng_5', 'Megastructures', 'Orbital energy collection at scale.',
    'engineering', 5, RC[5], 60, ['eng_4'],
    [{ type: 'resource_rate', target: 'energy', value: 80 }]),
  node('eng_6', 'Deep Mining', 'Boreholes into planetary cores.',
    'engineering', 6, RC[6], 80, ['eng_2'],
    [{ type: 'resource_rate', target: 'minerals', value: 40 }]),
  node('eng_7', 'Automated Shipyards', 'Drone-built fleets.',
    'engineering', 7, RC[7], 110, ['eng_4'],
    [{ type: 'build_speed', target: 'ship', value: 30 }, { type: 'build_speed', target: 'station', value: 20 }]),
  node('eng_8', 'Mass Drivers', 'Magnetic accelerators arm your ships and yards.',
    'engineering', 8, RC[8], 150, ['eng_6', 'eng_7'],
    [{ type: 'ship_stat', target: 'attack', value: 15 }, { type: 'build_speed', target: 'ship', value: 15 }]),
  node('eng_9', 'Fusion Refinement', 'Cleaner, denser power.',
    'engineering', 9, RC[9], 200, ['eng_5'],
    [{ type: 'resource_rate', target: 'energy', value: 60 }, { type: 'resource_rate', target: 'minerals', value: 20 }]),
  node('eng_10', 'Self-Replicating Factories', 'Factories that build factories.',
    'engineering', 10, RC[10], 280, ['eng_8', 'eng_9'],
    [{ type: 'build_speed', target: 'infrastructure', value: 40 }, { type: 'resource_rate', target: 'minerals', value: 30 }]),
  node('eng_11', 'Ringworld Engineering', 'Habitable rings around stars.',
    'engineering', 11, RC[11], 380, ['eng_9'],
    [{ type: 'resource_rate', target: 'energy', value: 120 }, { type: 'resource_rate', target: 'credits', value: 40 }]),
  node('eng_12', 'Dyson Swarm', 'Envelop a star in collectors.',
    'engineering', 12, RC[12], 500, ['eng_10', 'eng_11'],
    [{ type: 'resource_rate', target: 'energy', value: 200 }]),

  // ─── ARTIFICIAL INTELLIGENCE — compute, credits, combat AI, research ─────────
  node('ai_1', 'Expert Systems', 'Automated colony management; unlocks AI Datacenters.',
    'ai', 1, RC[1], 0, [],
    [{ type: 'resource_rate', target: 'compute', value: 15 }, { type: 'unlock', target: 'ai_datacenter', value: 1 }]),
  node('ai_2', 'Predictive Analytics', 'Forecast markets and logistics.',
    'ai', 2, RC[2], 10, ['ai_1'],
    [{ type: 'resource_rate', target: 'credits', value: 20 }]),
  node('ai_3', 'Combat AI', 'Autonomous battle coordination; unlocks ECM.',
    'ai', 3, RC[3], 30, ['ai_2'],
    [{ type: 'ship_stat', target: 'attack', value: 10 }, { type: 'ship_stat', target: 'defense', value: 10 }, { type: 'unlock', target: 'ecm', value: 1 }]),
  node('ai_4', 'Self-Improving AI', 'Recursive optimisation boosts research.',
    'ai', 4, RC[4], 50, ['ai_3'],
    [{ type: 'resource_rate', target: 'research', value: 40 }]),
  node('ai_5', 'The Singularity', 'An intelligence explosion.',
    'ai', 5, RC[5], 80, ['ai_4'],
    [{ type: 'resource_rate', target: 'compute', value: 80 }]),
  node('ai_6', 'Swarm Intelligence', 'Coordinated drone tactics.',
    'ai', 6, RC[6], 100, ['ai_3'],
    [{ type: 'ship_stat', target: 'attack', value: 15 }, { type: 'ship_stat', target: 'speed', value: 10 }]),
  node('ai_7', 'Quantum Networks', 'Instant galaxy-wide computation.',
    'ai', 7, RC[7], 140, ['ai_5'],
    [{ type: 'resource_rate', target: 'compute', value: 60 }, { type: 'resource_rate', target: 'credits', value: 30 }]),
  node('ai_8', 'Autonomous Economy', 'Self-running markets.',
    'ai', 8, RC[8], 190, ['ai_2', 'ai_7'],
    [{ type: 'resource_rate', target: 'credits', value: 50 }]),
  node('ai_9', 'Strategic AI', 'Grand-strategy combat doctrine.',
    'ai', 9, RC[9], 250, ['ai_6'],
    [{ type: 'ship_stat', target: 'attack', value: 20 }, { type: 'ship_stat', target: 'defense', value: 20 }]),
  node('ai_10', 'Recursive Optimization', 'AI redesigns itself endlessly.',
    'ai', 10, RC[10], 340, ['ai_8', 'ai_9'],
    [{ type: 'resource_rate', target: 'research', value: 80 }, { type: 'resource_rate', target: 'compute', value: 50 }]),
  node('ai_11', 'Hyperintelligence', 'Minds beyond comprehension.',
    'ai', 11, RC[11], 460, ['ai_10'],
    [{ type: 'resource_rate', target: 'compute', value: 120 }]),
  node('ai_12', 'Transcendent Network', 'A galactic consciousness.',
    'ai', 12, RC[12], 600, ['ai_11'],
    [{ type: 'resource_rate', target: 'research', value: 100 }, { type: 'resource_rate', target: 'credits', value: 60 }]),
];

export const RESEARCH_BY_ID: Record<string, ResearchNode> = Object.fromEntries(
  RESEARCH_TREE.map(n => [n.id, n])
);

export const RESEARCH_BY_PATH: Record<ResearchPath, ResearchNode[]> = {
  physics:      RESEARCH_TREE.filter(n => n.path === 'physics'),
  biology:      RESEARCH_TREE.filter(n => n.path === 'biology'),
  engineering:  RESEARCH_TREE.filter(n => n.path === 'engineering'),
  ai:           RESEARCH_TREE.filter(n => n.path === 'ai'),
};

// Human-readable summary of a node's effects (so the UI can show what it actually does).
export function describeEffects(node: ResearchNode): string[] {
  const RES_LABEL: Record<string, string> = {
    energy: 'Energy', food: 'Food', minerals: 'Minerals', research: 'Research',
    compute: 'Compute', credits: 'Credits', population: 'Population',
  };
  const UNLOCK_LABEL: Record<string, string> = {
    railgun: 'Railgun', hyperdrive: 'Hyperdrive', ecm: 'ECM', ai_datacenter: 'AI Datacenter',
  };
  return node.effects.map(e => {
    if (e.type === 'resource_rate') return `+${e.value}% ${RES_LABEL[e.target] ?? e.target} buildings`;
    if (e.type === 'build_speed')   return `+${e.value}% ${e.target} build speed`;
    if (e.type === 'ship_stat') {
      if (e.target === 'sensorRange') return 'Extends sensor range';
      return `+${e.value}% ship ${e.target}`;
    }
    if (e.type === 'unlock')   return `Unlocks ${UNLOCK_LABEL[e.target] ?? e.target}`;
    if (e.type === 'diplomacy') return `+${e.value} diplomacy`;
    return '';
  }).filter(Boolean);
}
