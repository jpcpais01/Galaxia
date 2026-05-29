import type { PlanetType, StarType, InfraType, StationType, GroundOpType, Resources, OrbitalStructureType } from '@/types/game';

// 1-second ticks. Everything measured in ticks/costs is 6× larger than the old
// 6-second cadence so real-time pacing is unchanged (per-tick rates are kept).
export const GAME_TICK_MS = 1000;
export const BOT_THINK_EVERY_N_TICKS = 12;
export const GALAXY_WIDTH = 4000;
export const GALAXY_HEIGHT = 4000;
export const SYSTEM_COUNT = 100;
export const MIN_SYSTEM_DISTANCE = 240;
export const CONNECTION_MAX_DISTANCE = 700;

export const STARTING_RESOURCES: Resources = {
  energy: 360,    // ~20s of buffer to power a starter base while you build solar
  food: 600,      // buffer to get a hydroponic farm running
  minerals: 1680, // ~3-4 core buildings of seed capital
  research: 0,
  compute: 0,
  credits: 2100,  // a couple of builds + one colonization or anomaly probe
  population: 8,
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
  black_hole:  { color: '#220011', glowColor: '#ff3300', baseRadius: 18, label: 'Black Hole' },
};

export const INFRA_CONFIG: Record<InfraType, {
  label: string;
  slots: number;
  buildTicks: number;
  mineralCost: number;
  energyCost: number;   // one-time energy spent to construct
  creditCost: number;
  output: Partial<Resources>;
  upkeep: number;       // ongoing energy drawn from the power grid while active
  icon: string;
}> = {
  // Power producers (no upkeep — they feed the grid)
  solar_farm:      { label: 'Solar Farm',      slots: 1, buildTicks: 36,  mineralCost: 240,  energyCost: 0,   creditCost: 90,   output: { energy: 12 },     upkeep: 0,  icon: 'solar_farm' },
  fusion_plant:    { label: 'Fusion Plant',    slots: 2, buildTicks: 132, mineralCost: 1320, energyCost: 0,   creditCost: 720,  output: { energy: 48 },     upkeep: 0,  icon: 'fusion_plant' },
  // Economy (draw power)
  hydroponic_farm: { label: 'Hydro Farm',      slots: 1, buildTicks: 48,  mineralCost: 270,  energyCost: 0,   creditCost: 150,  output: { food: 14 },       upkeep: 2,  icon: 'hydroponic_farm' },
  mining_complex:  { label: 'Mining Complex',  slots: 2, buildTicks: 72,  mineralCost: 420,  energyCost: 60,  creditCost: 270,  output: { minerals: 14 },   upkeep: 3,  icon: 'mining_complex' },
  research_lab:    { label: 'Research Lab',    slots: 1, buildTicks: 84,  mineralCost: 540,  energyCost: 90,  creditCost: 420,  output: { research: 10 },   upkeep: 4,  icon: 'research_lab' },
  ai_datacenter:   { label: 'AI Datacenter',   slots: 3, buildTicks: 168, mineralCost: 1440, energyCost: 360, creditCost: 1080, output: { compute: 12 },    upkeep: 10, icon: 'ai_datacenter' },
  trade_hub:       { label: 'Trade Hub',       slots: 1, buildTicks: 60,  mineralCost: 420,  energyCost: 0,   creditCost: 300,  output: { credits: 16 },    upkeep: 2,  icon: 'trade_hub' },
  // Colony hub: no per-tick output — it raises population housing capacity (see economy.ts)
  colony_hub:      { label: 'Colony Hub',      slots: 2, buildTicks: 120, mineralCost: 900,  energyCost: 120, creditCost: 720,  output: {},                 upkeep: 5,  icon: 'colony_hub' },
  defense_battery: { label: 'Defense Battery', slots: 2, buildTicks: 150, mineralCost: 1200, energyCost: 180, creditCost: 900,  output: {},                 upkeep: 4,  icon: 'defense_battery' },
  shipyard:        { label: 'Shipyard',        slots: 4, buildTicks: 270, mineralCost: 2700, energyCost: 480, creditCost: 1680, output: {},                 upkeep: 8,  icon: 'shipyard' },
};

export const STATION_CONFIG: Record<StationType, {
  label: string;
  buildTicks: number;
  mineralCost: number;
  energyCost: number;
  creditCost: number;
  icon: string;
  hp: number;
  attack: number;   // damage dealt to hostile fleets per combat round
  defense: number;  // mitigates incoming damage
}> = {
  space_station:    { label: 'Space Station',    buildTicks: 270, mineralCost: 1500, energyCost: 0,    creditCost: 900,  icon: '🛰', hp: 3000, attack: 15, defense: 20 },
  mining_station:   { label: 'Mining Station',   buildTicks: 108, mineralCost: 1080, energyCost: 0,    creditCost: 540,  icon: '⛏', hp: 1800, attack: 0,  defense: 10 },
  military_outpost: { label: 'Military Outpost', buildTicks: 228, mineralCost: 2280, energyCost: 240,  creditCost: 1440, icon: '🔫', hp: 4800, attack: 40, defense: 30 },
  research_station: { label: 'Research Station', buildTicks: 180, mineralCost: 1800, energyCost: 180,  creditCost: 1080, icon: '🔭', hp: 2400, attack: 0,  defense: 10 },
  stargate:         { label: 'Stargate',         buildTicks: 540, mineralCost: 5400, energyCost: 1200, creditCost: 4200, icon: '🌀', hp: 7200, attack: 0,  defense: 40 },
};

export const GROUND_OP_CONFIG: Record<GroundOpType, {
  label: string;
  buildTicks: number;
  mineralCost: number;
  energyCost: number;
  creditCost: number;
  output: Partial<Resources>;
  icon: string;
  description: string;
}> = {
  mineral_extractor:     { label: 'Mineral Extractor',  buildTicks: 60, mineralCost: 270, energyCost: 30, creditCost: 150, output: { minerals: 10 },          icon: 'mineral_extractor',     description: 'Extracts mineral deposits without colonization' },
  atmospheric_processor: { label: 'Atmo Processor',     buildTicks: 90, mineralCost: 360, energyCost: 60, creditCost: 210, output: { energy: 10, credits: 5 },icon: 'atmospheric_processor', description: 'Harvests atmospheric gases for energy and trade' },
  deep_scanner:          { label: 'Deep Scanner',       buildTicks: 48, mineralCost: 330, energyCost: 48, creditCost: 180, output: { research: 7 },            icon: 'deep_scanner',          description: 'Scans the planetary core for research data' },
  solar_collector:       { label: 'Solar Collector',    buildTicks: 72, mineralCost: 360, energyCost: 0,  creditCost: 240, output: { energy: 14 },            icon: 'solar_collector',       description: 'Orbital array harvesting direct stellar radiation' },
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

export type DamageType = 'kinetic' | 'energy' | 'explosive';

export const TILE_CONFIG: Record<string, {
  label: string; color: string; hp: number; attack: number; defense: number; speed: number; icon: string;
  damageType?: DamageType;   // for weapons: what kind of damage they deal
  resistType?: DamageType;   // for defenses: which damage type they resist
  requiresResearch?: string; // research node id needed before this tile can be placed
}> = {
  cockpit:          { label: 'Cockpit',        color: '#88AAFF', hp: 240, attack: 0,  defense: 0,  speed: 0,  icon: 'tile_cockpit' },
  crew_quarters:    { label: 'Crew Quarters',  color: '#6688AA', hp: 180, attack: 0,  defense: 2,  speed: 0,  icon: 'tile_crew' },
  cargo_hold:       { label: 'Cargo',          color: '#446688', hp: 150, attack: 0,  defense: 0,  speed: 0,  icon: 'tile_cargo' },
  laser_cannon:     { label: 'Laser',          color: '#FF4444', hp: 120, attack: 12, defense: 0,  speed: 0,  icon: 'tile_laser',   damageType: 'energy' },
  missile_launcher: { label: 'Missiles',       color: '#FF8844', hp: 120, attack: 18, defense: 0,  speed: 0,  icon: 'tile_missile', damageType: 'explosive' },
  railgun:          { label: 'Railgun',        color: '#FFAA00', hp: 90,  attack: 25, defense: 0,  speed: 0,  icon: 'tile_railgun', damageType: 'kinetic', requiresResearch: 'phys_2' },
  shield_generator: { label: 'Shield',         color: '#44AAFF', hp: 180, attack: 0,  defense: 20, speed: 0,  icon: 'tile_shield',  resistType: 'energy' },
  armor_plate:      { label: 'Armor',          color: '#8888AA', hp: 300, attack: 0,  defense: 10, speed: 0,  icon: 'tile_armor',   resistType: 'kinetic' },
  thruster:         { label: 'Thruster',       color: '#FF6600', hp: 150, attack: 0,  defense: 0,  speed: 8,  icon: 'tile_thruster' },
  hyperdrive:       { label: 'Hyperdrive',     color: '#AA44FF', hp: 120, attack: 0,  defense: 0,  speed: 15, icon: 'tile_hyperdrive', requiresResearch: 'phys_4' },
  sensor_array:     { label: 'Sensors',        color: '#44FFAA', hp: 120, attack: 2,  defense: 0,  speed: 2,  icon: 'tile_sensor',  damageType: 'kinetic' },
  ecm:              { label: 'ECM',            color: '#AAFF44', hp: 90,  attack: 0,  defense: 5,  speed: 0,  icon: 'tile_ecm',     resistType: 'explosive', requiresResearch: 'ai_3' },
  repair_bay:       { label: 'Repair Bay',     color: '#44FF44', hp: 150, attack: 0,  defense: 8,  speed: 0,  icon: 'tile_repair' },
  empty:            { label: 'Empty',          color: '#111122', hp: 0,   attack: 0,  defense: 0,  speed: 0,  icon: '' },
};

// Infrastructure / buildables gated behind research unlocks.
export const INFRA_RESEARCH_REQUIRED: Partial<Record<InfraType, string>> = {
  ai_datacenter: 'ai_1',
};

export const ORBITAL_CONFIG: Record<OrbitalStructureType, {
  label: string; buildTicks: number;
  mineralCost: number; energyCost: number; creditCost: number;
  hp: number; defense: number; attack: number;
  output: Partial<Resources>;
  icon: string; description: string;
}> = {
  orbital_shipyard: { label: 'Orbital Shipyard', buildTicks: 180, mineralCost: 2400, energyCost: 300, creditCost: 1500, hp: 1800, defense: 10, attack: 0,  output: {},                              icon: 'shipyard',        description: 'Constructs warships in orbit' },
  defense_platform: { label: 'Defense Platform', buildTicks: 120, mineralCost: 1800, energyCost: 180, creditCost: 900,  hp: 2400, defense: 30, attack: 25, output: {},                              icon: 'defense_battery', description: 'Orbital weapons platform' },
  orbital_sensor:   { label: 'Sensor Array',     buildTicks: 90,  mineralCost: 1200, energyCost: 120, creditCost: 600,  hp: 720,  defense: 5,  attack: 0,  output: { research: 10 },                icon: 'deep_scanner',    description: 'Deep space sensor array' },
  supply_depot:     { label: 'Supply Depot',     buildTicks: 150, mineralCost: 1500, energyCost: 120, creditCost: 1200, hp: 1200, defense: 8,  attack: 0,  output: { credits: 18, minerals: 6 },    icon: 'trade_hub',       description: 'Orbital logistics hub' },
};
