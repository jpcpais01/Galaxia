import type { ResearchNode, ResearchPath } from '@/types/game';

const node = (
  id: string, name: string, description: string,
  path: ResearchPath, tier: number, costResearch: number, costCompute: number,
  prerequisites: string[],
  effects: ResearchNode['effects']
): ResearchNode => ({ id, name, description, path, tier, costResearch, costCompute, prerequisites, effects });

export const RESEARCH_TREE: ResearchNode[] = [
  // ─── Physics ───────────────────────────────────────────────────────────────
  node('phys_1', 'Basic Sensors', 'Improved detection range and scan quality.',
    'physics', 1, 80, 0, [],
    [{ type: 'ship_stat', target: 'sensorRange', value: 30 }]),
  node('phys_2', 'Particle Weapons', 'Enhanced laser and plasma weaponry.',
    'physics', 2, 180, 10, ['phys_1'],
    [{ type: 'ship_stat', target: 'attack', value: 15 }]),
  node('phys_3', 'Deflector Shields', 'Energy-based ship shielding.',
    'physics', 3, 300, 20, ['phys_2'],
    [{ type: 'ship_stat', target: 'defense', value: 20 }]),
  node('phys_4', 'FTL Drive', 'Faster-than-light hyperdrive technology.',
    'physics', 4, 500, 40, ['phys_3'],
    [{ type: 'ship_stat', target: 'speed', value: 25 }, { type: 'unlock', target: 'hyperdrive_tile', value: 1 }]),
  node('phys_5', 'Quantum Computing', 'Quantum processor arrays increase compute yields.',
    'physics', 5, 800, 80, ['phys_4'],
    [{ type: 'resource_rate', target: 'compute', value: 30 }]),

  // ─── Biology ───────────────────────────────────────────────────────────────
  node('bio_1', 'Agri-Tech', 'Improved hydroponic yields.',
    'biology', 1, 60, 0, [],
    [{ type: 'resource_rate', target: 'food', value: 20 }]),
  node('bio_2', 'Population Growth', 'Better colonization and housing.',
    'biology', 2, 150, 0, ['bio_1'],
    [{ type: 'resource_rate', target: 'population', value: 15 }]),
  node('bio_3', 'Terraforming I', 'Light planetary modification.',
    'biology', 3, 280, 20, ['bio_2'],
    [{ type: 'unlock', target: 'terraforming_basic', value: 1 }]),
  node('bio_4', 'Advanced Genetics', 'Superhuman resilience; colonize harsher worlds.',
    'biology', 4, 450, 40, ['bio_3'],
    [{ type: 'unlock', target: 'colonize_threshold', value: 40 }]),
  node('bio_5', 'Transcendence', 'Post-biological consciousness uplift.',
    'biology', 5, 900, 100, ['bio_4'],
    [{ type: 'resource_rate', target: 'research', value: 50 }]),

  // ─── Engineering ───────────────────────────────────────────────────────────
  node('eng_1', 'Industrial Automation', 'Faster infrastructure builds.',
    'engineering', 1, 70, 0, [],
    [{ type: 'build_speed', target: 'infrastructure', value: 20 }]),
  node('eng_2', 'Advanced Metallurgy', 'Better mineral extraction.',
    'engineering', 2, 160, 10, ['eng_1'],
    [{ type: 'resource_rate', target: 'minerals', value: 20 }]),
  node('eng_3', 'Orbital Construction', 'Faster and cheaper stations.',
    'engineering', 3, 300, 20, ['eng_2'],
    [{ type: 'build_speed', target: 'station', value: 30 }, { type: 'unlock', target: 'megastation', value: 1 }]),
  node('eng_4', 'Nanoassembly', 'Molecular fabrication for complex ships.',
    'engineering', 4, 500, 50, ['eng_3'],
    [{ type: 'build_speed', target: 'ship', value: 40 }]),
  node('eng_5', 'Megastructures', 'Ringworlds and Dyson Spheres.',
    'engineering', 5, 1200, 200, ['eng_4'],
    [{ type: 'resource_rate', target: 'energy', value: 100 }, { type: 'unlock', target: 'dyson_sphere', value: 1 }]),

  // ─── AI ────────────────────────────────────────────────────────────────────
  node('ai_1', 'Expert Systems', 'Automated colony management.',
    'ai', 1, 90, 20, [],
    [{ type: 'resource_rate', target: 'compute', value: 15 }]),
  node('ai_2', 'Predictive Analytics', 'Forecast resource needs and trade routes.',
    'ai', 2, 200, 40, ['ai_1'],
    [{ type: 'resource_rate', target: 'credits', value: 20 }]),
  node('ai_3', 'Combat AI', 'Autonomous ship battle coordination.',
    'ai', 3, 350, 60, ['ai_2'],
    [{ type: 'ship_stat', target: 'attack', value: 10 }, { type: 'ship_stat', target: 'defense', value: 10 }]),
  node('ai_4', 'Self-Improving AI', 'Recursive self-optimization exponentially boosts research.',
    'ai', 4, 600, 120, ['ai_3'],
    [{ type: 'resource_rate', target: 'research', value: 40 }]),
  node('ai_5', 'The Singularity', 'An intelligence explosion that remakes your empire.',
    'ai', 5, 1500, 300, ['ai_4'],
    [{ type: 'resource_rate', target: 'compute', value: 80 }, { type: 'unlock', target: 'singularity_victory', value: 1 }]),

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
