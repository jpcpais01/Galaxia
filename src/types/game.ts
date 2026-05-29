export type PlanetType =
  | 'continental' | 'ocean' | 'arid' | 'tundra' | 'jungle'
  | 'savanna' | 'arctic' | 'volcanic' | 'fungal' | 'swamp'
  | 'gas_giant' | 'ice_giant' | 'barren' | 'molten' | 'toxic'
  | 'irradiated' | 'desert' | 'frozen' | 'deep_ocean' | 'storm';

export type StarType = 'yellow' | 'red_dwarf' | 'blue_giant' | 'orange' | 'white_dwarf' | 'neutron' | 'black_hole';

export type StationType = 'space_station' | 'mining_station' | 'military_outpost' | 'research_station' | 'stargate';

export type InfraType =
  | 'solar_farm' | 'fusion_plant' | 'hydroponic_farm' | 'mining_complex'
  | 'research_lab' | 'ai_datacenter' | 'trade_hub' | 'colony_hub'
  | 'defense_battery' | 'shipyard';

export type GroundOpType = 'mineral_extractor' | 'atmospheric_processor' | 'deep_scanner' | 'solar_collector';

export type ResearchPath = 'physics' | 'biology' | 'engineering' | 'ai';

export type ShipTileType =
  | 'cockpit' | 'crew_quarters' | 'cargo_hold'
  | 'laser_cannon' | 'missile_launcher' | 'railgun'
  | 'shield_generator' | 'armor_plate'
  | 'thruster' | 'hyperdrive'
  | 'sensor_array' | 'ecm' | 'repair_bay' | 'empty';

export type OrbitalStructureType =
  | 'orbital_shipyard' | 'defense_platform' | 'orbital_sensor' | 'supply_depot';

export type FleetTaskType =
  | 'move_system' | 'attack_fleet' | 'attack_station' | 'attack_planet';

export type DiplomacyStatus = 'neutral' | 'allied' | 'at_war' | 'trade_partner' | 'non_aggression';

export type AnomalyType =
  | 'ancient_ruins' | 'derelict_ship' | 'quantum_fissure' | 'dark_matter_cloud'
  | 'time_anomaly' | 'precursor_artifact' | 'psionic_resonance' | 'void_rift';

export interface Resources {
  energy: number;
  food: number;
  minerals: number;
  research: number;
  compute: number;
  credits: number;
  population: number;
}

export interface Moon {
  id: string;
  name: string;
  type: PlanetType;
  hasResources: boolean;
  seed: number;
}

export interface Planet {
  id: string;
  name: string;
  type: PlanetType;
  size: number;
  moons: Moon[];
  colonizable: boolean;
  similarity: number;
  hasResources: boolean;
  hasAnomaly: boolean;
  anomalyType?: AnomalyType;
  anomalyRevealed?: boolean;
  infraSlots: number;
  orbit: number;
  seed: number;
}

export interface Star {
  id: string;
  type: StarType;
  size: number;
}

export interface StarSystem {
  id: string;
  name: string;
  x: number;
  y: number;
  stars: Star[];
  planets: Planet[];
  connections: string[];
  isBlackHole?: boolean;
}

export interface Infrastructure {
  id: string;
  type: InfraType;
  level: number;
  planetId: string;
  systemId: string;
  buildStartedTick: number;
  buildCompletedTick: number;
  active: boolean;
}

export interface GroundOp {
  id: string;
  type: GroundOpType;
  targetId: string;   // planet.id or moon.id
  systemId: string;
  buildStartedTick: number;
  buildCompletedTick: number;
  active: boolean;
}

export interface PendingSurvey {
  systemId: string;
  completesAtTick: number;
}

export interface PendingColonization {
  planetId: string;
  systemId: string;
  completesAtTick: number;
}

export interface PendingInvestigation {
  planetId: string;
  systemId: string;
  anomalyType: string;
  completesAtTick: number;
  outcomes?: Partial<Resources>;   // filled in once the AI result returns
}

export interface AnomalyReport {
  id: string;          // == planetId
  empireId: string;
  systemId: string;
  planetId: string;
  anomalyType: string;
  status: 'generating' | 'ready';
  text?: string;
  imagePrompt?: string;
  imageDataUrl?: string;
  outcomes?: Partial<Resources>;
  summary?: string;
  createdTick: number;
}

export interface Station {
  id: string;
  type: StationType;
  systemId: string;
  planetId?: string;
  level: number;
  ownerId: string;
  buildStartedTick: number;
  buildCompletedTick: number;
  hp?: number;      // current hull; defaults to STATION_CONFIG hp when absent
  maxHp?: number;
}

export interface ShipTile {
  type: ShipTileType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
}

export interface ShipDesign {
  id: string;
  name: string;
  tiles: ShipTile[];
  attack: number;
  defense: number;
  speed: number;
  mineralCost: number;
  energyCost: number;
  creditCost: number;
  buildTicks: number;
}

export interface Ship {
  id: string;
  designId: string;
  designName: string;
  name: string;
  ownerId: string;
  systemId: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  tiles: ShipTile[];
  buildCompletedTick?: number;
}

export interface FleetTask {
  type: FleetTaskType;
  targetSystemId?: string;
  targetFleetId?: string;
  targetPlanetId?: string;
  targetEmpireId?: string;
}

export interface Fleet {
  id: string;
  name: string;
  empireId: string;
  systemId: string;
  posX: number;   // 0-1 normalized in system space
  posY: number;
  shipIds: string[];
  state: 'idle' | 'moving' | 'in_transit' | 'fighting';
  targetPosX?: number;
  targetPosY?: number;
  transitToSystemId?: string;     // next hop along the path
  transitFromSystemId?: string;   // system the current leg started from
  transitProgress?: number;       // 0-1 along the current leg
  transitPath?: string[];         // remaining systems to traverse (index 0 = next hop)
  task?: FleetTask;
}

export interface OrbitalStructure {
  id: string;
  type: OrbitalStructureType;
  planetId: string;
  systemId: string;
  buildStartedTick: number;
  buildCompletedTick: number;
  active: boolean;
  hp: number;
  maxHp: number;
}

export interface ResearchNode {
  id: string;
  name: string;
  description: string;
  path: ResearchPath;
  tier: number;
  costResearch: number;
  costCompute: number;
  prerequisites: string[];
  effects: ResearchEffect[];
}

export interface ResearchEffect {
  type: 'resource_rate' | 'build_speed' | 'ship_stat' | 'unlock' | 'diplomacy';
  target: string;
  value: number;
}

export interface DiplomacyRelation {
  empireId: string;
  status: DiplomacyStatus;
  tradeDeals: TradeDeal[];
  proposalPending?: DiplomacyProposal;
}

export interface TradeDeal {
  id: string;
  fromResource: keyof Resources;
  fromAmount: number;
  toResource: keyof Resources;
  toAmount: number;
  expiresAtTick: number;
}

export interface DiplomacyProposal {
  type: DiplomacyStatus | 'trade';
  fromEmpireId: string;
  data?: Partial<TradeDeal>;
  expiresAtTick: number;
}

export interface AssemblyVote {
  id: string;
  title: string;
  description: string;
  proposedBy: string;
  proposedAtTick: number;
  closesAtTick: number;
  votes: Record<string, boolean>;
  passed?: boolean;
  resolved?: boolean;   // tallied & applied after closesAtTick
  effect?: string;      // resolution key (see ASSEMBLY_RESOLUTIONS)
}

export interface BotMemory {
  targetSystemId?: string;
  phase: 'expand' | 'build' | 'research' | 'conquer';
  threatLevel: number;
  lastDecisionTick: number;
}

export interface Empire {
  id: string;
  playerId: string;
  username: string;
  color: string;
  isBot: boolean;
  botMemory?: BotMemory;
  homeSystemId: string;
  resources: Resources;
  resourceRates: Resources;
  controlledSystems: string[];
  colonizedPlanets: string[];
  infrastructure: Infrastructure[];
  groundOps: GroundOp[];
  stations: Station[];
  ships: Ship[];
  fleets: Fleet[];
  orbitalStructures: OrbitalStructure[];
  shipDesigns: ShipDesign[];
  completedResearch: string[];
  researchQueue: string | null;
  researchProgress: number;
  diplomacy: DiplomacyRelation[];
  surveyedSystems: string[];
  pendingSurveys: PendingSurvey[];
  pendingColonizations: PendingColonization[];
  pendingInvestigations?: PendingInvestigation[];
  resolvedAnomalies?: string[];   // planet ids whose anomaly this empire has claimed
  eliminated?: boolean;           // lost all systems/stations/ships
  civilization?: Civilization;
  homePlanetId?: string;
  isOnline: boolean;
  lastSeen: number;
  score: number;
}

export interface SystemState {
  systemId: string;
  ownerId?: string;
  stationId?: string;
  surveyedBy: string[];
}

export interface GameEvent {
  id: string;
  type: 'combat' | 'colonize' | 'research' | 'diplomacy' | 'anomaly' | 'build' | 'survey' | 'conquest';
  message: string;
  tick: number;
  empireId: string;
  targetEmpireId?: string;
  systemId?: string;
  planetId?: string;
}

export interface CombatReport {
  id: string;
  tick: number;
  systemId: string;
  attackerId: string;
  defenderId: string;
  attackerShips: number;
  defenderShips: number;
  attackerLosses: number;
  defenderLosses: number;
  attackerWon: boolean;
}

export interface GalaxyData {
  systems: StarSystem[];
  seed: number;
  width: number;
  height: number;
  blackHoleSystemId?: string;
}

export interface GameMeta {
  id: string;
  name: string;
  status: 'lobby' | 'playing' | 'finished';
  createdBy: string;
  createdByUsername: string;
  createdAt: number;
  maxPlayers: number;
  botCount: number;
  currentPlayers: number;
  tick: number;
  lastTickTime: number;
  winnerId?: string;
  winnerName?: string;
  victoryType?: 'domination' | 'singularity' | 'score';
  maxTick?: number;
  seed: number;
  starCount: number;
  galaxy: GalaxyData; // never stored in Firestore — regenerated locally from seed
  systemStates: Record<string, SystemState>;
  assembly: AssemblyVote[];
  hostEmpireId?: string;
}

export interface Player {
  id: string;
  username: string;
  gamesPlayed: number;
  wins: number;
  createdAt: number;
  civilization?: Civilization;      // legacy / last-used
  civilizations?: Civilization[];   // all saved civilizations
}

// ─── Civilization ─────────────────────────────────────────────────────────────

export type SpeciesType =
  | 'humanoid' | 'insectoid' | 'fungal' | 'synthetic'
  | 'aquatic'  | 'crystalline' | 'psionic' | 'gaseous';

export type GovernmentType =
  | 'democracy' | 'hive_mind' | 'theocracy'
  | 'oligarchy' | 'military_junta' | 'federation';

export type CulturalFocus =
  | 'scientific' | 'militaristic' | 'commercial'
  | 'expansionist' | 'diplomatic' | 'isolationist';

export type CivTrait =
  | 'resilient'  | 'industrious' | 'intelligent' | 'entrepreneurial'
  | 'populous'   | 'swift'       | 'adaptive'    | 'psychic'
  | 'fragile'    | 'wasteful'    | 'xenophobic'   | 'sluggish'
  | 'primitive'  | 'hungry';

export type OriginType =
  | 'ancient_empire' | 'recent_uplift' | 'refugee_fleet'
  | 'merchant_guild' | 'warrior_clans';

export interface Civilization {
  speciesName:   string;
  speciesType:   SpeciesType;
  primaryColor:  string;
  emblem:        string;
  homeWorldType: PlanetType;
  government:    GovernmentType;
  culturalFocus: CulturalFocus;
  traits:        CivTrait[];   // typically 2 positive + 1 negative
  origin:        OriginType;
  motto:         string;
}

// ──────────────────────────────────────────────────────────────────────────────

export type GameView = 'galaxy' | 'system' | 'planet';

export interface UIState {
  view: GameView;
  selectedSystemId: string | null;
  selectedPlanetId: string | null;
  selectedFleetId: string | null;
  activePanel: 'none' | 'build' | 'research' | 'ships' | 'diplomacy' | 'assembly' | 'designer' | 'colonies' | 'fleets';
  hoverSystemId: string | null;
  cameraX: number;
  cameraY: number;
  cameraZoom: number;
}
