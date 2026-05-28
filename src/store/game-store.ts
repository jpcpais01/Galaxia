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
  PendingSurvey, PendingColonization,
} from '@/types/game';
import { generateGalaxy, findHomeSystem } from '@/lib/game/galaxy-generator';
import { createBotEmpire, decideBotAction } from '@/lib/game/bot-ai';
import { applyTick, canAfford, deductCosts, countUsedSlots } from '@/lib/game/economy';
import { INFRA_CONFIG, STATION_CONFIG, GROUND_OP_CONFIG, EMPIRE_COLORS, STARTING_RESOURCES, GAME_TICK_MS, SYSTEM_COUNT } from '@/lib/game/constants';
import { STARTER_DESIGNS } from '@/lib/game/ship-designer';
import { SeededRandom } from '@/lib/noise';

interface GameStore {
  // Lobby
  games: GameMeta[];
  loadGames: () => Promise<void>;
  createGame: (name: string, maxPlayers: number, botCount: number, hostPlayerId: string, hostUsername: string, starCount?: number) => Promise<string>;
  joinGame: (gameId: string, playerId: string, username: string, color: string) => Promise<void>;
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

  // Tick
  processTick: () => Promise<void>;
}

const DEFAULT_UI: UIState = {
  view: 'galaxy',
  selectedSystemId: null,
  selectedPlanetId: null,
  activePanel: 'none',
  hoverSystemId: null,
  cameraX: 1000,   // galaxy center (GALAXY_WIDTH / 2)
  cameraY: 1000,   // galaxy center (GALAXY_HEIGHT / 2)
  cameraZoom: 0.5, // zoomed out enough to see the full galaxy on entry
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

  createGame: async (name, maxPlayers, botCount, hostPlayerId, hostUsername, starCount = SYSTEM_COUNT) => {
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

    const empire: Empire = {
      id: hostEmpireId,
      playerId: hostPlayerId,
      username: hostUsername,
      color: EMPIRE_COLORS[0],
      isBot: false,
      homeSystemId: homeId,
      resources: { ...STARTING_RESOURCES, population: startPop },
      resourceRates: { energy: 5, food: 0, minerals: 0, research: 5, compute: 0, credits: 10, population: 0 },
      controlledSystems: [homeId],
      colonizedPlanets: homePlanet ? [homePlanet.id] : [],
      infrastructure: [],
      groundOps: [],
      stations: [homeStation],
      ships: [],
      shipDesigns: STARTER_DESIGNS.map((d, i) => ({ ...d, id: `design_${hostPlayerId}_${i}` })),
      completedResearch: [],
      researchQueue: null,
      researchProgress: 0,
      diplomacy: [],
      surveyedSystems: [homeId],
      pendingSurveys: [],
      pendingColonizations: [],
      isOnline: true,
      lastSeen: Date.now(),
      score: 0,
    };

    await setDoc(doc(db, 'games', gameId, 'empires', empire.id), empire);
    return gameId;
  },

  joinGame: async (gameId, playerId, username, color) => {
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

    const empire: Empire = {
      id: empireId,
      playerId,
      username,
      color,
      isBot: false,
      homeSystemId: homeId,
      resources: { ...STARTING_RESOURCES, population: startPop },
      resourceRates: { energy: 5, food: 0, minerals: 0, research: 5, compute: 0, credits: 10, population: 0 },
      controlledSystems: [homeId],
      colonizedPlanets: homePlanet ? [homePlanet.id] : [],
      infrastructure: [],
      groundOps: [],
      stations: [homeStation],
      ships: [],
      shipDesigns: STARTER_DESIGNS.map((d, i) => ({ ...d, id: `design_${playerId}_${i}` })),
      completedResearch: [],
      researchQueue: null,
      researchProgress: 0,
      diplomacy: [],
      surveyedSystems: [homeId],
      pendingSurveys: [],
      pendingColonizations: [],
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
      // Mark colonizable planets in every empire's home system as resource-rich
      if (cachedGalaxy) {
        for (const empire of empires) {
          const homeSys = cachedGalaxy.systems.find(s => s.id === empire.homeSystemId);
          if (homeSys) homeSys.planets.forEach(p => { if (p.colonizable) p.hasResources = true; });
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
  selectSystem:  (id)      => set(s => ({ ui: { ...s.ui, selectedSystemId: id, selectedPlanetId: null, activePanel: 'none' } })),
  selectPlanet:  (id)      => set(s => ({ ui: { ...s.ui, selectedPlanetId: id, activePanel: 'none' } })),
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
    const updatedSystems = Array.from(new Set([...myEmpire.controlledSystems, systemId]));

    await updateDoc(doc(db, 'games', currentGame.id, 'empires', myEmpire.id), {
      resources: newResources,
      stations: updatedStations,
      controlledSystems: updatedSystems,
    });

    await updateDoc(doc(db, 'games', currentGame.id), {
      [`systemStates.${systemId}.ownerId`]: myEmpire.id,
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

    const hasShipyard = myEmpire.infrastructure.some(
      i => i.type === 'shipyard' && i.active && i.systemId === systemId
    );
    if (!hasShipyard) return;

    const ship = {
      id: `ship_${Date.now()}`,
      designId: design.id,
      designName: design.name,
      name: `${design.name} ${myEmpire.ships.length + 1}`,
      ownerId: myEmpire.id,
      systemId,
      hp: design.tiles.reduce((s, t) => s + t.hp, 0),
      maxHp: design.tiles.reduce((s, t) => s + t.hp, 0),
      attack: design.attack,
      defense: design.defense,
      speed: design.speed,
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

  processTick: async () => {
    const { currentGame, empires } = get();
    if (!currentGame || currentGame.status !== 'playing') return;

    const now = Date.now();
    if (now - currentGame.lastTickTime < GAME_TICK_MS) return;

    const gameRef = doc(db, 'games', currentGame.id);

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(gameRef);
        const g = snap.data() as GameMeta;
        if (now - g.lastTickTime < GAME_TICK_MS) return;

        const newTick = g.tick + 1;
        tx.update(gameRef, { tick: newTick, lastTickTime: now });
      });
    } catch { return; }

    const newTick = currentGame.tick + 1;

    for (const empire of empires) {
      const updates = applyTick(empire, newTick);
      await updateDoc(doc(db, 'games', currentGame.id, 'empires', empire.id), updates);

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

      if (empire.isBot && newTick % 2 === 0) {
        const action = decideBotAction({ ...empire, ...updates } as Empire, currentGame, newTick);
        await executeBotAction(action, { ...empire, ...updates } as Empire, currentGame, newTick);
      }
    }
  },
}));

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
      if (state?.ownerId) break;

      const station = {
        id: `station_${Date.now()}_${empire.id}`,
        type: 'space_station' as StationType,
        systemId, level: 1, ownerId: empire.id,
        buildStartedTick: tick, buildCompletedTick: tick + cfg.buildTicks,
      };
      const newResources = deductCosts(empire.resources, cfg);
      await updateDoc(empireRef, {
        resources: newResources,
        stations: [...empire.stations, station],
        controlledSystems: Array.from(new Set([...empire.controlledSystems, systemId])),
      });
      await updateDoc(doc(db, 'games', game.id), {
        [`systemStates.${systemId}.ownerId`]: empire.id,
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
