'use client';
import { create } from 'zustand';
import {
  doc, collection, setDoc, updateDoc, onSnapshot, getDocs,
  query, orderBy, limit, runTransaction, addDoc, arrayUnion, getDoc, deleteDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type {
  GameMeta, Empire, GameEvent, UIState, SystemState,
  InfraType, StationType, GroundOpType, Resources,
  PendingSurvey, PendingColonization, Civilization,
  Fleet, FleetTask, OrbitalStructureType, OrbitalStructure, Ship,
} from '@/types/game';
import { generateGalaxy, findHomeSystem } from '@/lib/game/galaxy-generator';
import { createBotEmpire, decideBotAction } from '@/lib/game/bot-ai';
import { applyTick, canAfford, deductCosts, countUsedSlots } from '@/lib/game/economy';
import { INFRA_CONFIG, STATION_CONFIG, GROUND_OP_CONFIG, ORBITAL_CONFIG, EMPIRE_COLORS, STARTING_RESOURCES, GAME_TICK_MS, SYSTEM_COUNT } from '@/lib/game/constants';
import { STARTER_DESIGNS } from '@/lib/game/ship-designer';
import { combatRound, computeFleetDamageToStation } from '@/lib/game/combat';
import { SeededRandom } from '@/lib/noise';

interface GameStore {
  // Lobby
  games: GameMeta[];
  loadGames: () => Promise<void>;
  createGame: (name: string, maxPlayers: number, botCount: number, hostPlayerId: string, hostUsername: string, starCount?: number, civilization?: Civilization) => Promise<string>;
  joinGame: (gameId: string, playerId: string, username: string, color: string, civilization?: Civilization) => Promise<void>;
  startGame: (gameId: string) => Promise<void>;
  deleteGame: (gameId: string) => Promise<void>;

  // Active game
  currentGame: GameMeta | null;
  myEmpire: Empire | null;
  empires: Empire[];
  events: GameEvent[];
  ui: UIState;

  subscribeToGame: (gameId: string, playerId: string) => () => void;
  unsubscribe: () => void;
  _unsubs: (() => void)[];

  // UI
  setView: (view: UIState['view']) => void;
  selectSystem: (id: string | null) => void;
  selectPlanet: (id: string | null) => void;
  selectFleet: (fleetId: string | null) => void;
  setPanel: (panel: UIState['activePanel']) => void;
  setCamera: (x: number, y: number, zoom: number) => void;
  setHoverSystem: (id: string | null) => void;

  // Actions
  surveySystem:   (systemId: string) => Promise<void>;
  buildStation:   (systemId: string, type: StationType) => Promise<void>;
  colonizePlanet: (systemId: string, planetId: string) => Promise<void>;
  buildInfra:     (systemId: string, planetId: string, type: InfraType) => Promise<void>;
  startResearch:  (nodeId: string) => Promise<void>;
  buildShip:      (designId: string, systemId: string) => Promise<void>;
  buildGroundOp:  (systemId: string, targetId: string, type: GroundOpType) => Promise<void>;
  destroyInfra:   (infraId: string) => Promise<void>;
  destroyGroundOp: (opId: string) => Promise<void>;
  saveShipDesign: (design: Empire['shipDesigns'][0]) => Promise<void>;
  proposeDiplomacy: (targetEmpireId: string, status: string) => Promise<void>;
  acceptDiplomacy:  (targetEmpireId: string) => Promise<void>;
  proposeAssemblyVote: (title: string, description: string, effect: string) => Promise<void>;
  castAssemblyVote: (voteId: string, vote: boolean) => Promise<void>;

  // Fleets
  createFleet: (name: string, shipIds: string[]) => Promise<void>;
  disbandFleet: (fleetId: string) => Promise<void>;
  addShipsToFleet: (fleetId: string, shipIds: string[]) => Promise<void>;
  removeShipFromFleet: (fleetId: string, shipId: string) => Promise<void>;
  setFleetTask: (fleetId: string, task: FleetTask | null) => Promise<void>;
  moveFleet: (fleetId: string, targetSystemId: string) => Promise<void>;
  moveFleetInSystem: (fleetId: string, posX: number, posY: number) => Promise<void>;

  // Orbital structures
  buildOrbitalStructure: (planetId: string, systemId: string, type: OrbitalStructureType) => Promise<void>;
  destroyOrbitalStructure: (structureId: string) => Promise<void>;

  // Tick
  processTick: () => Promise<void>;
}

// ─── Civilization helpers ──────────────────────────────────────────────────────

function applyOriginBonus(resources: Resources, civ?: Civilization): Resources {
  if (!civ) return resources;
  const r = { ...resources };
  switch (civ.origin) {
    case 'ancient_empire':
      r.research += 200;
      r.compute  += 100;
      break;
    case 'recent_uplift':
      r.credits  += 500;
      r.minerals += 300;
      break;
    case 'merchant_guild':
      r.credits  += 600;
      break;
    // 'warrior_clans': +25% combat — applied at ship-build time
    // 'refugee_fleet': +3 ships — complex, skip starting ships for now
  }
  return r;
}

const DEFAULT_UI: UIState = {
  view: 'galaxy',
  selectedSystemId: null,
  selectedPlanetId: null,
  selectedFleetId: null,
  activePanel: 'none',
  hoverSystemId: null,
  cameraX: 2000,    // galaxy center (GALAXY_WIDTH  / 2)
  cameraY: 2000,    // galaxy center (GALAXY_HEIGHT / 2)
  cameraZoom: 0.25, // zoomed out to see the full 4000-unit galaxy on entry
};

export const useGameStore = create<GameStore>((set, get) => ({
  games: [],
  currentGame: null,
  myEmpire: null,
  empires: [],
  events: [],
  ui: DEFAULT_UI,
  _unsubs: [],

  loadGames: async () => {
    const snap = await getDocs(query(collection(db, 'games'), orderBy('createdAt', 'desc'), limit(20)));
    const games = snap.docs.map(d => d.data() as GameMeta);
    set({ games });
  },

  createGame: async (name, maxPlayers, botCount, hostPlayerId, hostUsername, starCount = SYSTEM_COUNT, civilization?) => {
    const seed = Math.floor(Math.random() * 99999) + 1;
    const galaxy = generateGalaxy(seed, starCount);

    const gameId        = `game_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const hostEmpireId  = `empire_${hostPlayerId}`;
    const homeId        = findHomeSystem(galaxy, 0);
    const homeSystem    = galaxy.systems.find(s => s.id === homeId)!;
    const homePlanet    = homeSystem.planets.filter(p => p.colonizable).sort((a, b) => b.similarity - a.similarity)[0] ?? null;
    const homeStation   = { id: `stn_home_${hostEmpireId}`, type: 'space_station' as StationType, systemId: homeId, level: 1, ownerId: hostEmpireId, buildStartedTick: 0, buildCompletedTick: 0 };
    const startPop      = homePlanet ? 10 + (homePlanet.size - 1) * 2 : 10;

    const systemStates: Record<string, SystemState> = {};
    for (const sys of galaxy.systems) {
      systemStates[sys.id] = { systemId: sys.id, surveyedBy: [] };
    }
    systemStates[homeId] = { systemId: homeId, surveyedBy: [], ownerId: hostEmpireId, stationId: homeStation.id };

    const game: GameMeta = {
      id: gameId, name, status: 'lobby',
      createdBy: hostPlayerId, createdByUsername: hostUsername,
      createdAt: Date.now(), maxPlayers, botCount,
      currentPlayers: 1, tick: 0, lastTickTime: Date.now(),
      seed, starCount, galaxy, systemStates, assembly: [],
    };

    const { galaxy: _g, ...gameDoc } = game;
    await setDoc(doc(db, 'games', gameId), gameDoc);

    const startResources = applyOriginBonus(
      { ...STARTING_RESOURCES, population: startPop },
      civilization
    );
    const empire: Empire = {
      id: hostEmpireId,
      playerId: hostPlayerId,
      username: hostUsername,
      color: civilization?.primaryColor ?? EMPIRE_COLORS[0],
      isBot: false,
      homeSystemId: homeId,
      resources: startResources,
      resourceRates: { energy: 5, food: 0, minerals: 0, research: 5, compute: 0, credits: 10, population: 0 },
      controlledSystems: [homeId],
      colonizedPlanets: homePlanet ? [homePlanet.id] : [],
      infrastructure: [],
      groundOps: [],
      stations: [homeStation],
      ships: [],
      fleets: [],
      orbitalStructures: [],
      shipDesigns: STARTER_DESIGNS.map((d, i) => ({ ...d, id: `design_${hostPlayerId}_${i}` })),
      completedResearch: [],
      researchQueue: null,
      researchProgress: 0,
      diplomacy: [],
      surveyedSystems: [homeId],
      pendingSurveys: [],
      pendingColonizations: [],
      ...(civilization   ? { civilization }              : {}),
      ...(homePlanet     ? { homePlanetId: homePlanet.id } : {}),
      isOnline: true,
      lastSeen: Date.now(),
      score: 0,
    };

    await setDoc(doc(db, 'games', gameId, 'empires', empire.id), empire);
    return gameId;
  },

  joinGame: async (gameId, playerId, username, color, civilization?) => {
    const snap = await getDoc(doc(db, 'games', gameId));
    const rawGame = snap.data() as Omit<GameMeta, 'galaxy'> & { seed: number; starCount?: number };
    const galaxy = generateGalaxy(rawGame.seed, rawGame.starCount ?? SYSTEM_COUNT);

    const existingEmpires = await getDocs(collection(db, 'games', gameId, 'empires'));
    // Idempotent: if this player already has an empire, do nothing
    if (existingEmpires.docs.some(d => d.data().playerId === playerId)) return;
    const count = existingEmpires.size;

    const homeId      = findHomeSystem(galaxy, count);
    const homeSystem  = galaxy.systems.find(s => s.id === homeId)!;
    const homePlanet  = homeSystem.planets.filter(p => p.colonizable).sort((a, b) => b.similarity - a.similarity)[0] ?? null;
    const empireId    = `empire_${playerId}`;
    const homeStation = { id: `stn_home_${empireId}`, type: 'space_station' as StationType, systemId: homeId, level: 1, ownerId: empireId, buildStartedTick: 0, buildCompletedTick: 0 };
    const startPop    = homePlanet ? 10 + (homePlanet.size - 1) * 2 : 10;

    const startResources = applyOriginBonus(
      { ...STARTING_RESOURCES, population: startPop },
      civilization
    );
    const empire: Empire = {
      id: empireId,
      playerId,
      username,
      color: civilization?.primaryColor ?? color,
      isBot: false,
      homeSystemId: homeId,
      resources: startResources,
      resourceRates: { energy: 5, food: 0, minerals: 0, research: 5, compute: 0, credits: 10, population: 0 },
      controlledSystems: [homeId],
      colonizedPlanets: homePlanet ? [homePlanet.id] : [],
      infrastructure: [],
      groundOps: [],
      stations: [homeStation],
      ships: [],
      fleets: [],
      orbitalStructures: [],
      shipDesigns: STARTER_DESIGNS.map((d, i) => ({ ...d, id: `design_${playerId}_${i}` })),
      completedResearch: [],
      researchQueue: null,
      researchProgress: 0,
      diplomacy: [],
      surveyedSystems: [homeId],
      pendingSurveys: [],
      pendingColonizations: [],
      ...(civilization ? { civilization }              : {}),
      ...(homePlanet   ? { homePlanetId: homePlanet.id } : {}),
      isOnline: true,
      lastSeen: Date.now(),
      score: 0,
    };

    await setDoc(doc(db, 'games', gameId, 'empires', empire.id), empire);
    await updateDoc(doc(db, 'games', gameId), {
      currentPlayers: count + 1,
      [`systemStates.${homeId}.ownerId`]: empireId,
      [`systemStates.${homeId}.stationId`]: homeStation.id,
    });
  },

  startGame: async (gameId) => {
    const snap = await getDoc(doc(db, 'games', gameId));
    const rawGame = snap.data() as Omit<GameMeta, 'galaxy'> & { seed: number; starCount?: number };
    const game: GameMeta = { ...rawGame, galaxy: generateGalaxy(rawGame.seed, rawGame.starCount ?? SYSTEM_COUNT) };
    const empireSnap = await getDocs(collection(db, 'games', gameId, 'empires'));
    const existingCount = empireSnap.size;

    const bots: Empire[] = [];
    for (let i = 0; i < game.botCount; i++) {
      const homeId     = findHomeSystem(game.galaxy, existingCount + i);
      const homeSystem = game.galaxy.systems.find(s => s.id === homeId)!;
      const homePlanet = homeSystem.planets.filter(p => p.colonizable).sort((a, b) => b.similarity - a.similarity)[0] ?? null;
      const botId      = `bot_empire_${i}`;
      const homeStation = { id: `stn_home_${botId}`, type: 'space_station' as StationType, systemId: homeId, level: 1, ownerId: botId, buildStartedTick: 0, buildCompletedTick: 0 };

      const botData = createBotEmpire(i, homeId, existingCount + game.botCount);
      const botStartPop = homePlanet ? 10 + (homePlanet.size - 1) * 2 : 10;
      const bot: Empire = {
        ...botData,
        id: botId,
        resources: { ...botData.resources, population: botStartPop },
        controlledSystems: [homeId],
        colonizedPlanets: homePlanet ? [homePlanet.id] : [],
        stations: [homeStation],
        groundOps: [],
        fleets: [],
        orbitalStructures: [],
        pendingSurveys: [],
        pendingColonizations: [],
      };
      bots.push(bot);
      await setDoc(doc(db, 'games', gameId, 'empires', bot.id), bot);
      await updateDoc(doc(db, 'games', gameId), {
        [`systemStates.${homeId}.ownerId`]: botId,
        [`systemStates.${homeId}.stationId`]: homeStation.id,
      });
    }

    await updateDoc(doc(db, 'games', gameId), {
      status: 'playing',
      lastTickTime: Date.now(),
      hostEmpireId: empireSnap.docs[0]?.id,
    });
  },

  deleteGame: async (gameId) => {
    // Delete subcollections first (empires, events), then the game doc
    const [empireSnap, eventSnap] = await Promise.all([
      getDocs(collection(db, 'games', gameId, 'empires')),
      getDocs(collection(db, 'games', gameId, 'events')),
    ]);
    await Promise.all([
      ...empireSnap.docs.map(d => deleteDoc(d.ref)),
      ...eventSnap.docs.map(d => deleteDoc(d.ref)),
    ]);
    await deleteDoc(doc(db, 'games', gameId));
    // Refresh local list
    set(s => ({ games: s.games.filter(g => g.id !== gameId) }));
  },

  subscribeToGame: (gameId, playerId) => {
    const unsubs: (() => void)[] = [];

    let cachedGalaxy: import('@/types/game').GalaxyData | null = null;
    const gameSub = onSnapshot(doc(db, 'games', gameId), snap => {
      if (!snap.exists()) return;
      const raw = snap.data() as Omit<GameMeta, 'galaxy'> & { seed: number; starCount?: number };
      // Generate galaxy once and reuse — it never changes
      if (!cachedGalaxy || cachedGalaxy.seed !== raw.seed) {
        cachedGalaxy = generateGalaxy(raw.seed, raw.starCount ?? SYSTEM_COUNT);
      }
      set({ currentGame: { ...raw, galaxy: cachedGalaxy } });
    });
    unsubs.push(gameSub);

    const empireSub = onSnapshot(collection(db, 'games', gameId, 'empires'), snap => {
      const empires = snap.docs.map(d => d.data() as Empire);
      const myEmpire = empires.find(e => e.playerId === playerId) ?? null;
      // Apply per-empire galaxy mutations (deterministic on all clients)
      if (cachedGalaxy) {
        for (const empire of empires) {
          const homeSys = cachedGalaxy.systems.find(s => s.id === empire.homeSystemId);
          if (!homeSys) continue;
          // Mark home-system colonizable planets as resource-rich
          homeSys.planets.forEach(p => { if (p.colonizable) p.hasResources = true; });
          // Override home planet type to match civilization's chosen homeWorldType
          if (empire.homePlanetId && empire.civilization?.homeWorldType) {
            const hp = homeSys.planets.find(p => p.id === empire.homePlanetId);
            if (hp) {
              hp.type = empire.civilization.homeWorldType;
              hp.colonizable = true;
            }
          }
        }
      }
      set({ empires, myEmpire });
    });
    unsubs.push(empireSub);

    const eventSub = onSnapshot(
      query(collection(db, 'games', gameId, 'events'), orderBy('tick', 'desc'), limit(50)),
      snap => {
        const events = snap.docs.map(d => d.data() as GameEvent);
        set({ events });
      }
    );
    unsubs.push(eventSub);

    set({ _unsubs: unsubs });
    return () => unsubs.forEach(u => u());
  },

  unsubscribe: () => {
    get()._unsubs.forEach(u => u());
    set({ _unsubs: [], currentGame: null, myEmpire: null, empires: [], events: [], ui: DEFAULT_UI });
  },

  setView:       (view)    => set(s => ({ ui: { ...s.ui, view } })),
  selectSystem:  (id)      => set(s => ({ ui: { ...s.ui, selectedSystemId: id, selectedPlanetId: null, selectedFleetId: null, activePanel: 'none' } })),
  selectPlanet:  (id)      => set(s => ({ ui: { ...s.ui, selectedPlanetId: id, activePanel: 'none' } })),
  selectFleet:   (id)      => set(s => ({ ui: { ...s.ui, selectedFleetId: id } })),
  setPanel:      (panel)   => set(s => ({ ui: { ...s.ui, activePanel: panel } })),
  setCamera:     (x,y,z)   => set(s => ({ ui: { ...s.ui, cameraX: x, cameraY: y, cameraZoom: z } })),
  setHoverSystem:(id)      => set(s => ({ ui: { ...s.ui, hoverSystemId: id } })),

  surveySystem: async (systemId) => {
    const { currentGame, myEmpire } = get();
    if (!currentGame || !myEmpire) return;
    if (myEmpire.surveyedSystems.includes(systemId)) return;
    if ((myEmpire.pendingSurveys ?? []).some(s => s.systemId === systemId)) return;

    // Must be adjacent to an already-surveyed system
    const targetSystem = currentGame.galaxy.systems.find(s => s.id === systemId);
    if (!targetSystem) return;
    const hasAdjacentSurveyed = targetSystem.connections.some(
      id => myEmpire.surveyedSystems.includes(id)
    );
    if (!hasAdjacentSurveyed) return;

    const pendingSurvey: PendingSurvey = {
      systemId,
      completesAtTick: currentGame.tick + 20,
    };
    await updateDoc(doc(db, 'games', currentGame.id, 'empires', myEmpire.id), {
      pendingSurveys: [...(myEmpire.pendingSurveys ?? []), pendingSurvey],
    });

    await addDoc(collection(db, 'games', currentGame.id, 'events'), {
      id: `evt_${Date.now()}`, type: 'survey',
      message: `${myEmpire.username} dispatched surveyors to ${targetSystem.name}`,
      tick: currentGame.tick, empireId: myEmpire.id, systemId,
    });
  },

  buildStation: async (systemId, type = 'space_station') => {
    const { currentGame, myEmpire } = get();
    if (!currentGame || !myEmpire) return;
    const cfg = STATION_CONFIG[type];
    if (!canAfford(myEmpire.resources, cfg)) return;
    if (!myEmpire.surveyedSystems.includes(systemId)) return;

    const state = currentGame.systemStates[systemId];
    if (state?.ownerId) return;

    const newResources = deductCosts(myEmpire.resources, cfg);
    const station = {
      id: `station_${Date.now()}`,
      type, systemId,
      level: 1,
      ownerId: myEmpire.id,
      buildStartedTick: currentGame.tick,
      buildCompletedTick: currentGame.tick + cfg.buildTicks,
    };

    const updatedStations = [...myEmpire.stations, station];

    // Don't claim the system yet — it becomes controlled when the station finishes
    // building (processTick watches for buildCompletedTick). We do reserve the
    // slot immediately so nobody else can start building here.
    await updateDoc(doc(db, 'games', currentGame.id, 'empires', myEmpire.id), {
      resources: newResources,
      stations: updatedStations,
    });

    await updateDoc(doc(db, 'games', currentGame.id), {
      // stationId reserves the system; ownerId is set when construction completes
      [`systemStates.${systemId}.stationId`]: station.id,
    });

    await addDoc(collection(db, 'games', currentGame.id, 'events'), {
      id: `evt_${Date.now()}`, type: 'build',
      message: `${myEmpire.username} built a ${type.replace('_', ' ')} in ${systemId}`,
      tick: currentGame.tick, empireId: myEmpire.id, systemId,
    });
  },

  colonizePlanet: async (systemId, planetId) => {
    const { currentGame, myEmpire } = get();
    if (!currentGame || !myEmpire) return;
    if (!myEmpire.controlledSystems.includes(systemId)) return;
    if (myEmpire.colonizedPlanets.includes(planetId)) return;
    if ((myEmpire.pendingColonizations ?? []).some(c => c.planetId === planetId)) return;
    if (myEmpire.resources.credits < 150) return;

    const planet = currentGame.galaxy.systems
      .find(s => s.id === systemId)?.planets
      .find(p => p.id === planetId);
    if (!planet?.colonizable) return;

    const newResources = { ...myEmpire.resources, credits: myEmpire.resources.credits - 150 };
    const pending: PendingColonization = {
      planetId, systemId,
      completesAtTick: currentGame.tick + 50,
    };

    await updateDoc(doc(db, 'games', currentGame.id, 'empires', myEmpire.id), {
      resources: newResources,
      pendingColonizations: [...(myEmpire.pendingColonizations ?? []), pending],
    });

    await addDoc(collection(db, 'games', currentGame.id, 'events'), {
      id: `evt_${Date.now()}`, type: 'colonize',
      message: `${myEmpire.username} dispatched colony ships to ${planet.name}`,
      tick: currentGame.tick, empireId: myEmpire.id, systemId, planetId,
    });
  },

  buildInfra: async (systemId, planetId, type) => {
    const { currentGame, myEmpire } = get();
    if (!currentGame || !myEmpire) return;
    if (!myEmpire.colonizedPlanets.includes(planetId)) return;

    const cfg = INFRA_CONFIG[type];
    if (!canAfford(myEmpire.resources, cfg)) return;

    const planet = currentGame.galaxy.systems
      .find(s => s.id === systemId)?.planets
      .find(p => p.id === planetId);
    if (!planet) return;

    const usedSlots = countUsedSlots(planetId, myEmpire.infrastructure);
    if (usedSlots + cfg.slots > planet.infraSlots) return;

    const newResources = deductCosts(myEmpire.resources, cfg);
    const infra = {
      id: `infra_${Date.now()}`,
      type, level: 1, planetId, systemId,
      buildStartedTick: currentGame.tick,
      buildCompletedTick: currentGame.tick + cfg.buildTicks,
      active: false,
    };

    await updateDoc(doc(db, 'games', currentGame.id, 'empires', myEmpire.id), {
      resources: newResources,
      infrastructure: [...myEmpire.infrastructure, infra],
    });
  },

  buildGroundOp: async (systemId, targetId, type) => {
    const { currentGame, myEmpire } = get();
    if (!currentGame || !myEmpire) return;
    if (!myEmpire.controlledSystems.includes(systemId)) return;

    const cfg = GROUND_OP_CONFIG[type];
    if (!canAfford(myEmpire.resources, cfg)) return;

    // One op of each type per target
    if ((myEmpire.groundOps ?? []).some(g => g.targetId === targetId && g.type === type)) return;

    const newResources = deductCosts(myEmpire.resources, cfg);
    const groundOp = {
      id: `gop_${Date.now()}`,
      type, targetId, systemId,
      buildStartedTick: currentGame.tick,
      buildCompletedTick: currentGame.tick + cfg.buildTicks,
      active: false,
    };

    await updateDoc(doc(db, 'games', currentGame.id, 'empires', myEmpire.id), {
      resources: newResources,
      groundOps: [...(myEmpire.groundOps ?? []), groundOp],
    });
  },

  destroyInfra: async (infraId) => {
    const { currentGame, myEmpire } = get();
    if (!currentGame || !myEmpire) return;
    const updated = myEmpire.infrastructure.filter(i => i.id !== infraId);
    await updateDoc(doc(db, 'games', currentGame.id, 'empires', myEmpire.id), {
      infrastructure: updated,
    });
  },

  destroyGroundOp: async (opId) => {
    const { currentGame, myEmpire } = get();
    if (!currentGame || !myEmpire) return;
    const updated = (myEmpire.groundOps ?? []).filter(g => g.id !== opId);
    await updateDoc(doc(db, 'games', currentGame.id, 'empires', myEmpire.id), {
      groundOps: updated,
    });
  },

  startResearch: async (nodeId) => {
    const { currentGame, myEmpire } = get();
    if (!currentGame || !myEmpire) return;
    if (myEmpire.researchQueue) return;
    if (myEmpire.completedResearch.includes(nodeId)) return;

    await updateDoc(doc(db, 'games', currentGame.id, 'empires', myEmpire.id), {
      researchQueue: nodeId,
      researchProgress: 0,
    });
  },

  buildShip: async (designId, systemId) => {
    const { currentGame, myEmpire } = get();
    if (!currentGame || !myEmpire) return;
    const design = myEmpire.shipDesigns.find(d => d.id === designId);
    if (!design) return;
    if (!canAfford(myEmpire.resources, design)) return;

    const hasGroundShipyard = myEmpire.infrastructure.some(
      i => i.type === 'shipyard' && i.active && i.systemId === systemId
    );
    const hasOrbitalShipyard = (myEmpire.orbitalStructures ?? []).some(
      o => o.type === 'orbital_shipyard' && o.active && o.systemId === systemId
    );
    if (!hasGroundShipyard && !hasOrbitalShipyard) return;

    // Apply civilization bonuses to ship stats at build time
    const civ = myEmpire.civilization;
    let hpMult    = 1;
    let speedMult = 1;
    let atkMult   = 1;
    let defMult   = 1;
    if (civ) {
      if (civ.traits.includes('resilient'))      hpMult    *= 1.20;
      if (civ.traits.includes('fragile'))        hpMult    *= 0.80;
      if (civ.traits.includes('swift'))          speedMult *= 1.20;
      if (civ.traits.includes('sluggish'))       speedMult *= 0.80;
      if (civ.culturalFocus === 'militaristic')  { hpMult *= 1.15; atkMult *= 1.15; }
      if (civ.culturalFocus === 'isolationist')  defMult   *= 1.35;
      if (civ.government   === 'military_junta') atkMult   *= 1.25;
      if (civ.origin       === 'warrior_clans')  atkMult   *= 1.25;
      if (civ.speciesType  === 'fungal')         speedMult *= 0.85;
      if (civ.speciesType  === 'crystalline')    hpMult    *= 0.85; // -15% ship HP
    }
    const baseHp = design.tiles.reduce((s, t) => s + t.hp, 0);
    const ship = {
      id: `ship_${Date.now()}`,
      designId: design.id,
      designName: design.name,
      name: `${design.name} ${myEmpire.ships.length + 1}`,
      ownerId: myEmpire.id,
      systemId,
      hp:      Math.max(1, Math.round(baseHp           * hpMult)),
      maxHp:   Math.max(1, Math.round(baseHp           * hpMult)),
      attack:  Math.round(design.attack  * atkMult),
      defense: Math.round(design.defense * defMult),
      speed:   Math.max(1, Math.round(design.speed     * speedMult)),
      tiles: design.tiles.map(t => ({ ...t })),
      buildCompletedTick: currentGame.tick + design.buildTicks,
    };

    const newResources = deductCosts(myEmpire.resources, design);
    await updateDoc(doc(db, 'games', currentGame.id, 'empires', myEmpire.id), {
      resources: newResources,
      ships: [...myEmpire.ships, ship],
    });
  },

  saveShipDesign: async (design) => {
    const { currentGame, myEmpire } = get();
    if (!currentGame || !myEmpire) return;
    const idx = myEmpire.shipDesigns.findIndex(d => d.id === design.id);
    const designs = idx >= 0
      ? myEmpire.shipDesigns.map((d, i) => i === idx ? design : d)
      : [...myEmpire.shipDesigns, design];
    await updateDoc(doc(db, 'games', currentGame.id, 'empires', myEmpire.id), { shipDesigns: designs });
  },

  proposeDiplomacy: async (targetEmpireId, status) => {
    const { currentGame, myEmpire } = get();
    if (!currentGame || !myEmpire) return;

    const proposal = {
      type: status as import('@/types/game').DiplomacyStatus | 'trade',
      fromEmpireId: myEmpire.id,
      expiresAtTick: currentGame.tick + 10,
    };

    const targetEmpire = get().empires.find(e => e.id === targetEmpireId);
    if (!targetEmpire) return;

    const updatedDiplomacy = [...(targetEmpire.diplomacy ?? [])];
    const rel = updatedDiplomacy.find(d => d.empireId === myEmpire.id);
    if (rel) {
      rel.proposalPending = proposal;
    } else {
      updatedDiplomacy.push({ empireId: myEmpire.id, status: 'neutral', tradeDeals: [], proposalPending: proposal });
    }

    await updateDoc(doc(db, 'games', currentGame.id, 'empires', targetEmpireId), {
      diplomacy: updatedDiplomacy,
    });
  },

  acceptDiplomacy: async (fromEmpireId) => {
    const { currentGame, myEmpire } = get();
    if (!currentGame || !myEmpire) return;

    const myRel = myEmpire.diplomacy.find(d => d.empireId === fromEmpireId);
    if (!myRel?.proposalPending) return;

    const newStatus = myRel.proposalPending.type as any;
    const myUpdated = myEmpire.diplomacy.map(d =>
      d.empireId === fromEmpireId
        ? { ...d, status: newStatus, proposalPending: undefined }
        : d
    );

    const fromEmpire = get().empires.find(e => e.id === fromEmpireId);
    if (!fromEmpire) return;
    const fromUpdated = (fromEmpire.diplomacy ?? []).map(d =>
      d.empireId === myEmpire.id
        ? { ...d, status: newStatus }
        : d
    );
    if (!fromUpdated.find(d => d.empireId === myEmpire.id)) {
      fromUpdated.push({ empireId: myEmpire.id, status: newStatus, tradeDeals: [] });
    }

    await updateDoc(doc(db, 'games', currentGame.id, 'empires', myEmpire.id), { diplomacy: myUpdated });
    await updateDoc(doc(db, 'games', currentGame.id, 'empires', fromEmpireId), { diplomacy: fromUpdated });
  },

  proposeAssemblyVote: async (title, description, effect) => {
    const { currentGame, myEmpire } = get();
    if (!currentGame || !myEmpire) return;

    const vote = {
      id: `vote_${Date.now()}`,
      title, description,
      proposedBy: myEmpire.id,
      proposedAtTick: currentGame.tick,
      closesAtTick: currentGame.tick + 20,
      votes: { [myEmpire.id]: true },
      effect,
    };

    await updateDoc(doc(db, 'games', currentGame.id), {
      assembly: [...(currentGame.assembly ?? []), vote],
    });
  },

  castAssemblyVote: async (voteId, vote) => {
    const { currentGame, myEmpire } = get();
    if (!currentGame || !myEmpire) return;

    const updated = (currentGame.assembly ?? []).map(v =>
      v.id === voteId ? { ...v, votes: { ...v.votes, [myEmpire.id]: vote } } : v
    );
    await updateDoc(doc(db, 'games', currentGame.id), { assembly: updated });
  },

  // ─── Fleets ──────────────────────────────────────────────────────────────────
  createFleet: async (name, shipIds) => {
    const { currentGame, myEmpire } = get();
    if (!currentGame || !myEmpire || shipIds.length === 0) return;
    // Pick a system from the first valid ship
    const firstShip = myEmpire.ships.find(s => shipIds.includes(s.id));
    if (!firstShip) return;
    // Filter to only ships in the same system
    const validShipIds = myEmpire.ships
      .filter(s => shipIds.includes(s.id) && s.systemId === firstShip.systemId)
      .map(s => s.id);

    const fleet: Fleet = {
      id: `fleet_${Date.now()}_${myEmpire.id}`,
      name,
      empireId: myEmpire.id,
      systemId: firstShip.systemId,
      posX: 0.5 + (Math.random() - 0.5) * 0.4,
      posY: 0.5 + (Math.random() - 0.5) * 0.4,
      shipIds: validShipIds,
      state: 'idle',
    };

    await updateDoc(doc(db, 'games', currentGame.id, 'empires', myEmpire.id), {
      fleets: [...(myEmpire.fleets ?? []), fleet],
    });
  },

  disbandFleet: async (fleetId) => {
    const { currentGame, myEmpire } = get();
    if (!currentGame || !myEmpire) return;
    const updated = (myEmpire.fleets ?? []).filter(f => f.id !== fleetId);
    await updateDoc(doc(db, 'games', currentGame.id, 'empires', myEmpire.id), {
      fleets: updated,
    });
  },

  addShipsToFleet: async (fleetId, shipIds) => {
    const { currentGame, myEmpire } = get();
    if (!currentGame || !myEmpire) return;
    const updated = (myEmpire.fleets ?? []).map(f =>
      f.id === fleetId
        ? { ...f, shipIds: Array.from(new Set([...f.shipIds, ...shipIds])) }
        : f
    );
    await updateDoc(doc(db, 'games', currentGame.id, 'empires', myEmpire.id), {
      fleets: updated,
    });
  },

  removeShipFromFleet: async (fleetId, shipId) => {
    const { currentGame, myEmpire } = get();
    if (!currentGame || !myEmpire) return;
    const updated = (myEmpire.fleets ?? []).map(f =>
      f.id === fleetId
        ? { ...f, shipIds: f.shipIds.filter(id => id !== shipId) }
        : f
    );
    await updateDoc(doc(db, 'games', currentGame.id, 'empires', myEmpire.id), {
      fleets: updated,
    });
  },

  setFleetTask: async (fleetId, task) => {
    const { currentGame, myEmpire } = get();
    if (!currentGame || !myEmpire) return;
    const updated = (myEmpire.fleets ?? []).map(f =>
      f.id === fleetId
        ? (task === null ? { ...f, task: undefined } : { ...f, task })
        : f
    );
    await updateDoc(doc(db, 'games', currentGame.id, 'empires', myEmpire.id), {
      fleets: updated,
    });
  },

  moveFleet: async (fleetId, targetSystemId) => {
    const { currentGame, myEmpire } = get();
    if (!currentGame || !myEmpire) return;
    const fleet = (myEmpire.fleets ?? []).find(f => f.id === fleetId);
    if (!fleet) return;
    if (fleet.systemId === targetSystemId) return;
    const updated = (myEmpire.fleets ?? []).map(f =>
      f.id === fleetId
        ? {
            ...f,
            state: 'in_transit' as const,
            transitFromSystemId: f.systemId,
            transitToSystemId: targetSystemId,
            transitProgress: 0,
            task: { type: 'move_system' as const, targetSystemId },
          }
        : f
    );
    await updateDoc(doc(db, 'games', currentGame.id, 'empires', myEmpire.id), {
      fleets: updated,
    });
  },

  moveFleetInSystem: async (fleetId, posX, posY) => {
    const { currentGame, myEmpire } = get();
    if (!currentGame || !myEmpire) return;
    const updated = (myEmpire.fleets ?? []).map(f =>
      f.id === fleetId
        ? {
            ...f,
            state: 'moving' as const,
            targetPosX: posX,
            targetPosY: posY,
          }
        : f
    );
    await updateDoc(doc(db, 'games', currentGame.id, 'empires', myEmpire.id), {
      fleets: updated,
    });
  },

  // ─── Orbital structures ──────────────────────────────────────────────────────
  buildOrbitalStructure: async (planetId, systemId, type) => {
    const { currentGame, myEmpire } = get();
    if (!currentGame || !myEmpire) return;
    if (!myEmpire.controlledSystems.includes(systemId)) return;
    const cfg = ORBITAL_CONFIG[type];
    if (!canAfford(myEmpire.resources, cfg)) return;

    // Only one of each type per planet
    if ((myEmpire.orbitalStructures ?? []).some(o => o.planetId === planetId && o.type === type)) return;

    const newResources = deductCosts(myEmpire.resources, cfg);
    const structure: OrbitalStructure = {
      id: `orb_${Date.now()}`,
      type, planetId, systemId,
      buildStartedTick: currentGame.tick,
      buildCompletedTick: currentGame.tick + cfg.buildTicks,
      active: false,
      hp: cfg.hp,
      maxHp: cfg.hp,
    };

    await updateDoc(doc(db, 'games', currentGame.id, 'empires', myEmpire.id), {
      resources: newResources,
      orbitalStructures: [...(myEmpire.orbitalStructures ?? []), structure],
    });
  },

  destroyOrbitalStructure: async (structureId) => {
    const { currentGame, myEmpire } = get();
    if (!currentGame || !myEmpire) return;
    const updated = (myEmpire.orbitalStructures ?? []).filter(o => o.id !== structureId);
    await updateDoc(doc(db, 'games', currentGame.id, 'empires', myEmpire.id), {
      orbitalStructures: updated,
    });
  },

  processTick: async () => {
    const { currentGame, empires } = get();
    if (!currentGame || currentGame.status !== 'playing') return;

    const now = Date.now();
    if (now - currentGame.lastTickTime < GAME_TICK_MS) return;

    const gameRef = doc(db, 'games', currentGame.id);

    let tickAdvanced = false;
    let actualNewTick = 0;

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(gameRef);
        const g = snap.data() as GameMeta;
        if (now - g.lastTickTime < GAME_TICK_MS) return;

        actualNewTick = g.tick + 1;
        tx.update(gameRef, { tick: actualNewTick, lastTickTime: now });
        tickAdvanced = true;
      });
    } catch { return; }

    if (!tickAdvanced) return;

    const newTick = actualNewTick;

    // Snapshot of empires after applyTick for cross-empire combat processing
    const empiresAfterTick: Record<string, Empire> = {};

    for (const empire of empires) {
      const updates = applyTick(empire, newTick);

      // Process fleet movement & transit
      const updatedFleets = (empire.fleets ?? []).map(f => processFleetMovement(f, empire.ships));
      const updatedShips = applyShipSystemFromTransitedFleets(empire.ships, updatedFleets);

      const allUpdates = {
        ...updates,
        fleets: updatedFleets,
        ships: updatedShips,
      };

      empiresAfterTick[empire.id] = { ...empire, ...allUpdates } as Empire;

      await updateDoc(doc(db, 'games', currentGame.id, 'empires', empire.id), allUpdates);

      // Push newly completed surveys to game-level systemStates
      const oldSurveyed = empire.surveyedSystems ?? [];
      const newSurveyed = (updates as any).surveyedSystems ?? oldSurveyed;
      for (const sysId of newSurveyed) {
        if (!oldSurveyed.includes(sysId)) {
          await updateDoc(doc(db, 'games', currentGame.id), {
            [`systemStates.${sysId}.surveyedBy`]: arrayUnion(empire.id),
          });
        }
      }

      // Claim systems for stations whose build timer has completed (and haven't been claimed yet)
      const newlyBuiltStations = empire.stations.filter(
        s => s.buildCompletedTick <= newTick && !empire.controlledSystems.includes(s.systemId)
      );
      if (newlyBuiltStations.length > 0) {
        const newControlled = Array.from(new Set([
          ...empire.controlledSystems,
          ...newlyBuiltStations.map(s => s.systemId),
        ]));
        await updateDoc(doc(db, 'games', currentGame.id, 'empires', empire.id), {
          controlledSystems: newControlled,
        });
        for (const stn of newlyBuiltStations) {
          await updateDoc(doc(db, 'games', currentGame.id), {
            [`systemStates.${stn.systemId}.ownerId`]: empire.id,
          });
        }
      }

      if (empire.isBot && newTick % 2 === 0) {
        const action = decideBotAction({ ...empire, ...updates } as Empire, currentGame, newTick);
        await executeBotAction(action, { ...empire, ...updates } as Empire, currentGame, newTick);
      }
    }

    // ─── Fleet combat resolution (single round per tick) ──────────────────────
    const combatResults = resolveFleetCombat(Object.values(empiresAfterTick), newTick);
    for (const [empireId, shipPatch] of Object.entries(combatResults.shipUpdates)) {
      await updateDoc(doc(db, 'games', currentGame.id, 'empires', empireId), {
        ships: shipPatch,
        fleets: combatResults.fleetUpdates[empireId] ?? empiresAfterTick[empireId].fleets,
      });
    }
  },
}));

// ─── Fleet movement helpers ────────────────────────────────────────────────────
function processFleetMovement(fleet: Fleet, ships: Ship[]): Fleet {
  const fleetShips = ships.filter(s => fleet.shipIds.includes(s.id));
  const fleetSpeed = fleetShips.length > 0
    ? Math.max(1, Math.min(...fleetShips.map(s => s.speed || 5)))
    : 5;

  // In-transit (between systems)
  if (fleet.state === 'in_transit' && fleet.transitToSystemId !== undefined) {
    const progress = (fleet.transitProgress ?? 0) + fleetSpeed / 500;
    if (progress >= 1) {
      // Arrived; strip all transit/movement fields (Firestore rejects `undefined`)
      const { transitToSystemId, transitFromSystemId, transitProgress, targetPosX, targetPosY, task, ...rest } = fleet;
      return {
        ...rest,
        systemId: transitToSystemId,
        posX: 0.1,
        posY: 0.5,
        state: 'idle' as const,
      };
    }
    return { ...fleet, transitProgress: progress };
  }

  // In-system movement
  if (fleet.state === 'moving' && fleet.targetPosX !== undefined && fleet.targetPosY !== undefined) {
    const dx = fleet.targetPosX - fleet.posX;
    const dy = fleet.targetPosY - fleet.posY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.02) {
      // Strip movement fields — Firestore rejects `undefined` values
      const { targetPosX, targetPosY, ...rest } = fleet;
      return {
        ...rest,
        posX: targetPosX,
        posY: targetPosY,
        state: 'idle' as const,
      };
    }
    const step = fleetSpeed * 0.003;
    const dxNorm = (dx / dist) * Math.min(step, dist);
    const dyNorm = (dy / dist) * Math.min(step, dist);
    return {
      ...fleet,
      posX: fleet.posX + dxNorm,
      posY: fleet.posY + dyNorm,
    };
  }

  return fleet;
}

function applyShipSystemFromTransitedFleets(ships: Ship[], fleets: Fleet[]): Ship[] {
  // For each fleet that just arrived in a new system, update ship.systemId
  const shipToSystem = new Map<string, string>();
  for (const fleet of fleets) {
    if (fleet.state === 'idle' || fleet.state === 'moving') {
      for (const sid of fleet.shipIds) {
        shipToSystem.set(sid, fleet.systemId);
      }
    }
  }
  return ships.map(s => {
    const target = shipToSystem.get(s.id);
    return target && target !== s.systemId ? { ...s, systemId: target } : s;
  });
}

function resolveFleetCombat(
  empires: Empire[],
  tick: number
): {
  shipUpdates: Record<string, Ship[]>;
  fleetUpdates: Record<string, Fleet[]>;
} {
  const shipUpdates: Record<string, Ship[]> = {};
  const fleetUpdates: Record<string, Fleet[]> = {};

  // Build (systemId -> fleets[]) of fleets NOT in transit
  const fleetsBySystem = new Map<string, { fleet: Fleet; empire: Empire }[]>();
  for (const empire of empires) {
    for (const fleet of (empire.fleets ?? [])) {
      if (fleet.state === 'in_transit') continue;
      const list = fleetsBySystem.get(fleet.systemId) ?? [];
      list.push({ fleet, empire });
      fleetsBySystem.set(fleet.systemId, list);
    }
  }

  // For each system with multiple fleets, find hostile pairs
  fleetsBySystem.forEach((fleetList) => {
    if (fleetList.length < 2) return;
    for (let i = 0; i < fleetList.length; i++) {
      for (let j = i + 1; j < fleetList.length; j++) {
        const A = fleetList[i];
        const B = fleetList[j];
        if (A.empire.id === B.empire.id) continue;
        const aRel = (A.empire.diplomacy ?? []).find((d: { empireId: string }) => d.empireId === B.empire.id);
        if (aRel?.status !== 'at_war') continue;

        const aShipsCurrent = shipUpdates[A.empire.id] ?? A.empire.ships;
        const bShipsCurrent = shipUpdates[B.empire.id] ?? B.empire.ships;
        const aFleetShips = aShipsCurrent.filter(s => A.fleet.shipIds.includes(s.id));
        const bFleetShips = bShipsCurrent.filter(s => B.fleet.shipIds.includes(s.id));
        if (aFleetShips.length === 0 || bFleetShips.length === 0) continue;

        const rng = new SeededRandom(tick * 1000 + i * 31 + j);
        const result = combatRound(aFleetShips, bFleetShips, rng);

        // Merge back
        const survivingA = new Set(result.attackerShips.map(s => s.id));
        const survivingB = new Set(result.defenderShips.map(s => s.id));
        const newAShips = aShipsCurrent
          .map(s => {
            if (A.fleet.shipIds.includes(s.id)) {
              return result.attackerShips.find(r => r.id === s.id) ?? null;
            }
            return s;
          })
          .filter((s): s is Ship => s !== null && (survivingA.has(s.id) || !A.fleet.shipIds.includes(s.id)));
        const newBShips = bShipsCurrent
          .map(s => {
            if (B.fleet.shipIds.includes(s.id)) {
              return result.defenderShips.find(r => r.id === s.id) ?? null;
            }
            return s;
          })
          .filter((s): s is Ship => s !== null && (survivingB.has(s.id) || !B.fleet.shipIds.includes(s.id)));

        shipUpdates[A.empire.id] = newAShips;
        shipUpdates[B.empire.id] = newBShips;

        // Mark fleets as fighting; remove destroyed ships from shipIds
        const aFleetsNow = fleetUpdates[A.empire.id] ?? A.empire.fleets ?? [];
        const bFleetsNow = fleetUpdates[B.empire.id] ?? B.empire.fleets ?? [];
        fleetUpdates[A.empire.id] = aFleetsNow.map(f =>
          f.id === A.fleet.id
            ? { ...f, state: 'fighting' as const, shipIds: f.shipIds.filter(sid => survivingA.has(sid)) }
            : f
        );
        fleetUpdates[B.empire.id] = bFleetsNow.map(f =>
          f.id === B.fleet.id
            ? { ...f, state: 'fighting' as const, shipIds: f.shipIds.filter(sid => survivingB.has(sid)) }
            : f
        );
      }
    }
  });

  // Process fleet vs station attacks
  for (const empire of empires) {
    for (const fleet of (empire.fleets ?? [])) {
      if (fleet.task?.type !== 'attack_station') continue;
      if (fleet.state === 'in_transit') continue;
      const targetEmpire = empires.find(e => e.id === fleet.task?.targetEmpireId);
      if (!targetEmpire) continue;
      const targetStation = targetEmpire.stations.find(s => s.systemId === fleet.systemId);
      if (!targetStation) continue;
      const fleetShips = (shipUpdates[empire.id] ?? empire.ships).filter(s => fleet.shipIds.includes(s.id));
      if (fleetShips.length === 0) continue;
      const stnCfg = STATION_CONFIG[targetStation.type];
      const damage = computeFleetDamageToStation(fleet, fleetShips, stnCfg.hp / 10);
      // Apply damage to station (we treat the station HP loosely here)
      const updatedStations = targetEmpire.stations.map(s =>
        s.id === targetStation.id ? { ...s } : s
      );
      // (Station HP not tracked in current schema beyond config — placeholder for future use)
      void damage;
      void updatedStations;
    }
  }

  return { shipUpdates, fleetUpdates };
}

async function executeBotAction(action: ReturnType<typeof decideBotAction>, empire: Empire, game: GameMeta, tick: number) {
  const store = useGameStore.getState();
  const empireRef = doc(db, 'games', game.id, 'empires', empire.id);

  switch (action.type) {
    case 'survey': {
      const { systemId } = action.payload as { systemId: string };
      if (!empire.surveyedSystems.includes(systemId)) {
        await updateDoc(empireRef, { surveyedSystems: [...empire.surveyedSystems, systemId] });
        await updateDoc(doc(db, 'games', game.id), {
          [`systemStates.${systemId}.surveyedBy`]: arrayUnion(empire.id),
        });
      }
      break;
    }
    case 'build_station': {
      const { systemId } = action.payload as { systemId: string };
      const cfg = STATION_CONFIG.space_station;
      if (!canAfford(empire.resources, cfg)) break;
      const state = game.systemStates[systemId];
      if (state?.ownerId || state?.stationId) break; // already owned or being built

      const station = {
        id: `station_${Date.now()}_${empire.id}`,
        type: 'space_station' as StationType,
        systemId, level: 1, ownerId: empire.id,
        buildStartedTick: tick, buildCompletedTick: tick + cfg.buildTicks,
      };
      const newResources = deductCosts(empire.resources, cfg);
      // Reserve slot; ownership is granted when construction completes (in processTick)
      await updateDoc(empireRef, {
        resources: newResources,
        stations: [...empire.stations, station],
      });
      await updateDoc(doc(db, 'games', game.id), {
        [`systemStates.${systemId}.stationId`]: station.id,
      });
      break;
    }
    case 'colonize': {
      const { systemId, planetId } = action.payload as { systemId: string; planetId: string };
      if (empire.colonizedPlanets.includes(planetId as string)) break;
      if (empire.resources.credits < 150) break;
      await updateDoc(empireRef, {
        colonizedPlanets: [...empire.colonizedPlanets, planetId],
        resources: { ...empire.resources, credits: empire.resources.credits - 150 },
      });
      break;
    }
    case 'build_infra': {
      const { planetId, systemId, type } = action.payload as { planetId: string; systemId: string; type: InfraType };
      if (!empire.colonizedPlanets.includes(planetId as string)) break;
      const cfg = INFRA_CONFIG[type];
      if (!canAfford(empire.resources, cfg)) break;
      const usedSlots = countUsedSlots(planetId as string, empire.infrastructure);
      const planet = game.galaxy.systems.find(s => s.id === systemId)?.planets.find(p => p.id === planetId);
      if (!planet || usedSlots + cfg.slots > planet.infraSlots) break;

      const infra = {
        id: `infra_${Date.now()}_${empire.id}`,
        type, level: 1, planetId, systemId,
        buildStartedTick: tick,
        buildCompletedTick: tick + cfg.buildTicks,
        active: false,
      };
      await updateDoc(empireRef, {
        resources: deductCosts(empire.resources, cfg),
        infrastructure: [...empire.infrastructure, infra],
      });
      break;
    }
  }
}
