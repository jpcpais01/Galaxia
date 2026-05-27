import type { PlanetType, StarType, InfraType, StationType, Resources } from '@/types/game';

export const GAME_TICK_MS = 6000;
export const BOT_THINK_EVERY_N_TICKS = 2;
export const GALAXY_WIDTH = 2000;
export const GALAXY_HEIGHT = 2000;
export const SYSTEM_COUNT = 100;
export const MIN_SYSTEM_DISTANCE = 120;
export const CONNECTION_MAX_DISTANCE = 350;

export const STARTING_RESOURCES: Resources = {
  energy: 80,
  food: 80,
  minerals: 250,
  research: 0,
  compute: 0,
  credits: 500,
  population: 10,
};

export const PLANET_CONFIG: Record<PlanetType, {
  colonizable: boolean;
  groundColor: string;
  waterColor: string;
  cloudColor: string;
  label: string;
}> = {
  continental: { colonizable: true, groundColor: '#3a6b4a', waterColor: '#1a4f7a', cloudColor: '#cce8ff', label: 'Continental' },
  ocean:       { colonizable: true, groundColor: '#2a5c8a', waterColor: '#0a2f5a', cloudColor: '#aad4ff', label: 'Ocean' },
  arid:        { colonizable: true, groundColor: '#c08030', waterColor: '#6a4010', cloudColor: '#e8d090', label: 'Arid' },
  tundra:      { colonizable: true, groundColor: '#7aa0b8', waterColor: '#3a6080', cloudColor: '#e0f0ff', label: 'Tundra' },
  jungle:      { colonizable: true, groundColor: '#1a6a30', waterColor: '#1a5070', cloudColor: '#88dd88', label: 'Jungle' },
  savanna:     { colonizable: true, groundColor: '#c8a030', waterColor: '#608020', cloudColor: '#e8d888', label: 'Savanna' },
  arctic:      { colonizable: true, groundColor: '#d0e8f8', waterColor: '#6090c0', cloudColor: '#ffffff', label: 'Arctic' },
  volcanic:    { colonizable: true, groundColor: '#8a1a10', waterColor: '#1a1a1a', cloudColor: '#664444', label: 'Volcanic' },
  fungal:      { colonizable: true, groundColor: '#6a2a8a', waterColor: '#3a1a50', cloudColor: '#aa66cc', label: 'Fungal' },
  swamp:       { colonizable: true, groundColor: '#2a5820', waterColor: '#0a3010', cloudColor: '#88aa44', label: 'Swamp' },
  gas_giant:   { colonizable: false, groundColor: '#d08028', waterColor: '#a05818', cloudColor: '#e8b870', label: 'Gas Giant' },
  ice_giant:   { colonizable: false, groundColor: '#5090d0', waterColor: '#2060a0', cloudColor: '#88bbee', label: 'Ice Giant' },
  barren:      { colonizable: false, groundColor: '#606060', waterColor: '#404040', cloudColor: '#808080', label: 'Barren' },
  molten:      { colonizable: false, groundColor: '#cc2210', waterColor: '#882200', cloudColor: '#ff6644', label: 'Molten' },
  toxic:       { colonizable: false, groundColor: '#88a000', waterColor: '#506000', cloudColor: '#aacc00', label: 'Toxic' },
  irradiated:  { colonizable: false, groundColor: '#c8a000', waterColor: '#806000', cloudColor: '#eedd44', label: 'Irradiated' },
  desert:      { colonizable: false, groundColor: '#e0a060', waterColor: '#c07830', cloudColor: '#f0c898', label: 'Desert' },
  frozen:      { colonizable: false, groundColor: '#c0d8f0', waterColor: '#80a8d0', cloudColor: '#ffffff', label: 'Frozen' },
  deep_ocean:  { colonizable: false, groundColor: '#102840', waterColor: '#061420', cloudColor: '#446688', label: 'Deep Ocean' },
  storm:       { colonizable: false, groundColor: '#606880', waterColor: '#404858', cloudColor: '#8890aa', label: 'Storm' },
};

export const STAR_CONFIG: Record<StarType, {
  color: string;
  glowColor: string;
  baseRadius: number;
  label: string;
}> = {
  yellow:      { color: '#FFE066', glowColor: '#FF8C00', baseRadius: 24, label: 'Yellow Star' },
  red_dwarf:   { color: '#FF5566', glowColor: '#CC1122', baseRadius: 16, label: 'Red Dwarf' },
  blue_giant:  { color: '#88AAFF', glowColor: '#4455EE', baseRadius: 36, label: 'Blue Giant' },
  orange:      { color: '#FF8844', glowColor: '#CC5500', baseRadius: 22, label: 'Orange Star' },
  white_dwarf: { color: '#EEEEFF', glowColor: '#AAAACC', baseRadius: 12, label: 'White Dwarf' },
  neutron:     { color: '#AAEEFF', glowColor: '#00CCFF', baseRadius: 10, label: 'Neutron Star' },
};

export const INFRA_CONFIG: Record<InfraType, {
  label: string;
  slots: number;
  buildTicks: number;
  mineralCost: number;
  energyCost: number;
  creditCost: number;
  output: Partial<Resources>;
  icon: string;
}> = {
  solar_farm:      { label: 'Solar Farm',      slots: 1, buildTicks: 6,  mineralCost: 50,  energyCost: 0,  creditCost: 20,  output: { energy: 12 },      icon: '☀' },
  fusion_plant:    { label: 'Fusion Plant',    slots: 2, buildTicks: 20, mineralCost: 200, energyCost: 0,  creditCost: 100, output: { energy: 40 },      icon: '⚡' },
  hydroponic_farm: { label: 'Hydro Farm',      slots: 1, buildTicks: 8,  mineralCost: 40,  energyCost: 10, creditCost: 30,  output: { food: 12 },        icon: '🌿' },
  mining_complex:  { label: 'Mining Complex',  slots: 2, buildTicks: 12, mineralCost: 60,  energyCost: 15, creditCost: 50,  output: { minerals: 18 },    icon: '⛏' },
  research_lab:    { label: 'Research Lab',    slots: 1, buildTicks: 15, mineralCost: 100, energyCost: 20, creditCost: 80,  output: { research: 12 },    icon: '🔬' },
  ai_datacenter:   { label: 'AI Datacenter',   slots: 3, buildTicks: 30, mineralCost: 300, energyCost: 50, creditCost: 200, output: { compute: 25 },     icon: '💻' },
  trade_hub:       { label: 'Trade Hub',       slots: 1, buildTicks: 10, mineralCost: 80,  energyCost: 10, creditCost: 60,  output: { credits: 24 },     icon: '💱' },
  colony_hub:      { label: 'Colony Hub',      slots: 2, buildTicks: 20, mineralCost: 150, energyCost: 20, creditCost: 100, output: { population: 6 },   icon: '🏛' },
  defense_battery: { label: 'Defense Battery', slots: 2, buildTicks: 25, mineralCost: 200, energyCost: 30, creditCost: 150, output: {},                  icon: '🛡' },
  shipyard:        { label: 'Shipyard',        slots: 4, buildTicks: 50, mineralCost: 500, energyCost: 80, creditCost: 300, output: {},                  icon: '🚀' },
};

export const STATION_CONFIG: Record<StationType, {
  label: string;
  buildTicks: number;
  mineralCost: number;
  energyCost: number;
  creditCost: number;
  icon: string;
}> = {
  space_station:    { label: 'Space Station',    buildTicks: 30, mineralCost: 300, energyCost: 0,  creditCost: 200, icon: '🛰' },
  mining_station:   { label: 'Mining Station',   buildTicks: 20, mineralCost: 200, energyCost: 0,  creditCost: 100, icon: '⛏' },
  military_outpost: { label: 'Military Outpost', buildTicks: 40, mineralCost: 400, energyCost: 40, creditCost: 250, icon: '🔫' },
  research_station: { label: 'Research Station', buildTicks: 35, mineralCost: 350, energyCost: 30, creditCost: 200, icon: '🔭' },
  stargate:         { label: 'Stargate',         buildTicks: 100, mineralCost: 1000, energyCost: 200, creditCost: 800, icon: '🌀' },
};

export const EMPIRE_COLORS = [
  '#4488FF', '#FF4455', '#44FF88', '#FFAA00',
  '#FF44FF', '#44FFFF', '#FF8844', '#8844FF',
  '#FF4488', '#88FF44', '#FFFFFF', '#FF6600',
];

export const PLANET_TYPE_LIST: PlanetType[] = [
  'continental', 'ocean', 'arid', 'tundra', 'jungle',
  'savanna', 'arctic', 'volcanic', 'fungal', 'swamp',
  'gas_giant', 'ice_giant', 'barren', 'molten', 'toxic',
  'irradiated', 'desert', 'frozen', 'deep_ocean', 'storm',
];

export const COLONIZABLE_TYPES = new Set<PlanetType>([
  'continental', 'ocean', 'arid', 'tundra', 'jungle',
  'savanna', 'arctic', 'volcanic', 'fungal', 'swamp',
]);

export const ANOMALY_TYPES = [
  'ancient_ruins', 'derelict_ship', 'quantum_fissure', 'dark_matter_cloud',
  'time_anomaly', 'precursor_artifact', 'psionic_resonance', 'void_rift',
] as const;

export const ANOMALY_EFFECTS: Record<string, string> = {
  ancient_ruins:      '+500 Credits, +20 Research',
  derelict_ship:      'Gain a free cruiser-class ship design',
  quantum_fissure:    '+50% Research output on this system',
  dark_matter_cloud:  '+30 Energy / tick for this system',
  time_anomaly:       'Reduce all build times by 20%',
  precursor_artifact: '+100 Compute, unlock AI tier bonus',
  psionic_resonance:  '+2 Diplomacy influence with all empires',
  void_rift:          'Access to Void Gate: teleport between two systems',
};

export const TILE_CONFIG: Record<string, { label: string; color: string; hp: number; attack: number; defense: number; speed: number }> = {
  cockpit:          { label: 'Cockpit',        color: '#88AAFF', hp: 40,  attack: 0,  defense: 0,  speed: 0  },
  crew_quarters:    { label: 'Crew Quarters',  color: '#6688AA', hp: 30,  attack: 0,  defense: 2,  speed: 0  },
  cargo_hold:       { label: 'Cargo',          color: '#446688', hp: 25,  attack: 0,  defense: 0,  speed: 0  },
  laser_cannon:     { label: 'Laser',          color: '#FF4444', hp: 20,  attack: 12, defense: 0,  speed: 0  },
  missile_launcher: { label: 'Missiles',       color: '#FF8844', hp: 20,  attack: 18, defense: 0,  speed: 0  },
  railgun:          { label: 'Railgun',        color: '#FFAA00', hp: 15,  attack: 25, defense: 0,  speed: 0  },
  shield_generator: { label: 'Shield',         color: '#44AAFF', hp: 30,  attack: 0,  defense: 20, speed: 0  },
  armor_plate:      { label: 'Armor',          color: '#8888AA', hp: 50,  attack: 0,  defense: 10, speed: 0  },
  thruster:         { label: 'Thruster',       color: '#FF6600', hp: 25,  attack: 0,  defense: 0,  speed: 8  },
  hyperdrive:       { label: 'Hyperdrive',     color: '#AA44FF', hp: 20,  attack: 0,  defense: 0,  speed: 15 },
  sensor_array:     { label: 'Sensors',        color: '#44FFAA', hp: 20,  attack: 2,  defense: 0,  speed: 2  },
  ecm:              { label: 'ECM',            color: '#AAFF44', hp: 15,  attack: 0,  defense: 5,  speed: 0  },
  repair_bay:       { label: 'Repair Bay',     color: '#44FF44', hp: 25,  attack: 0,  defense: 8,  speed: 0  },
  empty:            { label: 'Empty',          color: '#111122', hp: 0,   attack: 0,  defense: 0,  speed: 0  },
};
