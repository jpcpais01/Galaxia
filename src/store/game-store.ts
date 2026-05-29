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
  PendingSurvey, PendingColonization, PendingInvestigation, AnomalyReport, Civilization,
  Fleet, FleetTask, OrbitalStructureType, OrbitalStructure, Ship,
} from '@/types/game';
import { generateGalaxy, findHomeSystem, findPath, systemDistance } from '@/lib/game/galaxy-generator';
import { createBotEmpire, runBotTurn } from '@/lib/game/bot-ai';
import { applyTick, canAfford, deductCosts, countUsedSlots } from '@/lib/game/economy';
import { resolveAssembly, checkVictory, ANOMALY_GRANTS } from '@/lib/game/world';
import { ANOMALY_EFFECTS } from '@/lib/game/constants';
import { INFRA_CONFIG, STATION_CONFIG, GROUND_OP_CONFIG, ORBITAL_CONFIG, EMPIRE_COLORS, STARTING_RESOURCES, GAME_TICK_MS, SYSTEM_COUNT } from '@/lib/game/constants';
import { STARTER_DESIGNS, instantiateShip } from '@/lib/game/ship-designer';
import { resolveAllCombat } from '@/lib/game/combat';

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
  anomalies: AnomalyReport[];
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
  investigateAnomaly: (systemId: string, planetId: string) => Promise<void>;
  buildInfra:     (systemId: string, planetId: string, type: InfraType) => Promise<void>;
  startResearch:  (nodeId: string) => Promise<void>;
  buildShip:      (designId: string, systemId: string) => Promise<void>;
  buildGroundOp:  (systemId: string, targetId: string, type: GroundOpType) => Promise<void>;
  destroyInfra:   (infraId: string) => Promise<void>;
  destroyGroundOp: (opId: string) => Promise<void>;
  saveShipDesign: (design: Empire['shipDesigns'][0]) => Promise<void>;
  proposeDiplomacy: (targetEmpireId: string, status: string) => Promise<void>;
  acceptDiplomacy:  (targetEmpireId: string) => Promise<void>;
  declineDiplomacy: (fromEmpireId: string) => Promise<void>;
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
  anomalies: [],
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
    const homeStation   = { id: `stn_home_${hostEmpireId}`, type: 'space_station' as StationType, systemId: homeId, level: 1, ownerId: hostEmpireId, buildStartedTick: 0, buildCompletedTick: 0, hp: STATION_CONFIG.space_station.hp, maxHp: STATION_CONFIG.space_station.hp };
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
      maxTick: 2000,
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
    const homeStation = { id: `stn_home_${empireId}`, type: 'space_station' as StationType, systemId: homeId, level: 1, ownerId: empireId, buildStartedTick: 0, buildCompletedTick: 0, hp: STATION_CONFIG.space_station.hp, maxHp: STATION_CONFIG.space_station.hp };
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
      const homeStation = { id: `stn_home_${botId}`, type: 'space_station' as StationType, systemId: homeId, level: 1, ownerId: botId, buildStartedTick: 0, buildCompletedTick: 0, hp: STATION_CONFIG.space_station.hp, maxHp: STATION_CONFIG.space_station.hp };

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

    const anomalySub = onSnapshot(collection(db, 'games', gameId, 'anomalies'), snap => {
      const anomalies = snap.docs.map(d => d.data() as AnomalyReport);
      set({ anomalies });
    });
    unsubs.push(anomalySub);

    set({ _unsubs: unsubs });
    return () => unsubs.forEach(u => u());
  },

  unsubscribe: () => {
    get()._unsubs.forEach(u => u());
    set({ _unsubs: [], currentGame: null, myEmpire: null, empires: [], events: [], anomalies: [], ui: DEFAULT_UI });
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
      hp: cfg.hp,
      maxHp: cfg.hp,
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

  investigateAnomaly: async (systemId, planetId) => {
    const { currentGame, myEmpire } = get();
    if (!currentGame || !myEmpire) return;
    if (!myEmpire.surveyedSystems.includes(systemId)) return;
    if ((myEmpire.resolvedAnomalies ?? []).includes(planetId)) return;
    if ((myEmpire.pendingInvestigations ?? []).some(p => p.planetId === planetId)) return;
    // Cost: credits + research
    if (myEmpire.resources.credits < 120 || myEmpire.resources.research < 40) return;

    const sys = currentGame.galaxy.systems.find(s => s.id === systemId);
    const planet = sys?.planets.find(p => p.id === planetId);
    if (!planet?.hasAnomaly || !planet.anomalyType) return;

    const anomalyType = planet.anomalyType;
    const INVESTIGATE_TICKS = 6;
    const completesAtTick = currentGame.tick + INVESTIGATE_TICKS;

    const newResources = {
      ...myEmpire.resources,
      credits:  myEmpire.resources.credits  - 120,
      research: myEmpire.resources.research - 40,
    };
    const pending: PendingInvestigation = { planetId, systemId, anomalyType, completesAtTick };

    await updateDoc(doc(db, 'games', currentGame.id, 'empires', myEmpire.id), {
      resources: newResources,
      pendingInvestigations: [...(myEmpire.pendingInvestigations ?? []), pending],
    });

    // Placeholder report (status: generating) — drives the UI spinner
    const reportRef = doc(db, 'games', currentGame.id, 'anomalies', planetId);
    await setDoc(reportRef, {
      id: planetId, empireId: myEmpire.id, systemId, planetId, anomalyType,
      status: 'generating', createdTick: currentGame.tick,
    } as AnomalyReport);

    await addDoc(collection(db, 'games', currentGame.id, 'events'), {
      id: `evt_${Date.now()}`, type: 'anomaly',
      message: `${myEmpire.username} began investigating an anomaly at ${planet.name}`,
      tick: currentGame.tick, empireId: myEmpire.id, systemId, planetId,
    });

    // Kick off AI generation (text + image). Falls back to fixed grants on failure.
    const gameId = currentGame.id;
    const empireId = myEmpire.id;
    (async () => {
      let outcomes: Partial<Resources> = ANOMALY_GRANTS[anomalyType] ?? { credits: 200 };
      let text = '';
      let summary = '';
      let imageDataUrl: string | undefined;
      let imagePrompt = '';
      try {
        const resp = await fetch('/api/anomaly', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            anomalyType,
            flavor: ANOMALY_EFFECTS[anomalyType] ?? '',
            systemName: sys?.name ?? '',
            planetName: planet.name,
            planetType: planet.type,
          }),
        });
        const data = await resp.json();
        if (data?.aiUsed) {
          if (data.text) text = data.text;
          if (data.summary) summary = data.summary;
          if (data.imagePrompt) imagePrompt = data.imagePrompt;
          if (data.imageDataUrl) imageDataUrl = data.imageDataUrl;
          if (data.outcomes && Object.keys(data.outcomes).length > 0) outcomes = data.outcomes;
        }
      } catch { /* keep fallbacks */ }

      if (!text) text = `Your survey team investigates the ${anomalyType.replace(/_/g, ' ')} and catalogues their findings.`;

      // Write the finished report (retry without image if the doc is too large)
      const report: AnomalyReport = {
        id: planetId, empireId, systemId, planetId, anomalyType,
        status: 'ready', text, summary, imagePrompt, outcomes,
        createdTick: currentGame.tick,
        ...(imageDataUrl ? { imageDataUrl } : {}),
      };
      try {
        await setDoc(doc(db, 'games', gameId, 'anomalies', planetId), report);
      } catch {
        const { imageDataUrl: _drop, ...noImg } = report;
        await setDoc(doc(db, 'games', gameId, 'anomalies', planetId), noImg as AnomalyReport);
      }

      // Patch the pending investigation with the resolved outcomes so the host
      // applies them when the timer elapses.
      const latest = get().myEmpire;
      if (latest && latest.id === empireId) {
        const updatedPending = (latest.pendingInvestigations ?? []).map(p =>
          p.planetId === planetId ? { ...p, outcomes } : p);
        await updateDoc(doc(db, 'games', gameId, 'empires', empireId), {
          pendingInvestigations: updatedPending,
        });
      }
    })();
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

    const ship = instantiateShip(myEmpire, design, systemId, currentGame.tick, myEmpire.ships.length + 1);

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

    const targetEmpire = get().empires.find(e => e.id === targetEmpireId);
    if (!targetEmpire) return;

    // Declaring war is unilateral — no consent required (sets both sides at_war).
    if (status === 'at_war') {
      const mine = [...(myEmpire.diplomacy ?? [])];
      const mineRel = mine.find(d => d.empireId === targetEmpireId);
      if (mineRel) { mineRel.status = 'at_war'; mineRel.proposalPending = undefined; }
      else mine.push({ empireId: targetEmpireId, status: 'at_war', tradeDeals: [] });

      const theirs = [...(targetEmpire.diplomacy ?? [])];
      const theirRel = theirs.find(d => d.empireId === myEmpire.id);
      if (theirRel) { theirRel.status = 'at_war'; theirRel.proposalPending = undefined; }
      else theirs.push({ empireId: myEmpire.id, status: 'at_war', tradeDeals: [] });

      await updateDoc(doc(db, 'games', currentGame.id, 'empires', myEmpire.id), { diplomacy: mine });
      await updateDoc(doc(db, 'games', currentGame.id, 'empires', targetEmpireId), { diplomacy: theirs });
      await addDoc(collection(db, 'games', currentGame.id, 'events'), {
        id: `evt_${Date.now()}_war`, type: 'diplomacy',
        message: `${myEmpire.username} declared WAR on ${targetEmpire.username}`,
        tick: currentGame.tick, empireId: myEmpire.id, targetEmpireId,
      });
      return;
    }

    const proposal = {
      type: status as import('@/types/game').DiplomacyStatus | 'trade',
      fromEmpireId: myEmpire.id,
      expiresAtTick: currentGame.tick + 10,
    };

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

  declineDiplomacy: async (fromEmpireId) => {
    const { currentGame, myEmpire } = get();
    if (!currentGame || !myEmpire) return;
    const updated = (myEmpire.diplomacy ?? []).map(d =>
      d.empireId === fromEmpireId ? { ...d, proposalPending: undefined } : d);
    await updateDoc(doc(db, 'games', currentGame.id, 'empires', myEmpire.id), { diplomacy: updated });
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

    // Path along hyperlanes through systems we know about
    const allowed = new Set([...(myEmpire.surveyedSystems ?? []), ...(myEmpire.controlledSystems ?? [])]);
    const path = findPath(currentGame.galaxy, fleet.systemId, targetSystemId, allowed) ?? [targetSystemId];
    if (path.length === 0) return;

    const updated = (myEmpire.fleets ?? []).map(f =>
      f.id === fleetId
        ? {
            ...f,
            state: 'in_transit' as const,
            transitFromSystemId: f.systemId,
            transitToSystemId: path[0],
            transitPath: path,
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
    const galaxy = currentGame.galaxy;

    // Snapshot of empires after this tick (used by combat / assembly / victory)
    const empiresAfterTick: Record<string, Empire> = {};
    const eventsToEmit: GameEvent[] = [];

    for (const empire of empires) {
      const updates = applyTick(empire, newTick);

      // ── Fleet movement & transit (distance-based, multi-hop) ──────────────
      const movedFleets  = (empire.fleets ?? []).map(f => processFleetMovement(f, empire.ships, galaxy));
      let   updatedShips = applyShipSystemFromTransitedFleets(empire.ships, movedFleets);
      // ── Ship repair / regen (non-fighting ships in friendly space) ────────
      updatedShips = repairShips({ ...empire, ...updates } as Empire, updatedShips, movedFleets, newTick);

      let resources = (updates.resources ?? empire.resources) as Resources;
      const oldSurveyed   = new Set(empire.surveyedSystems ?? []);
      const newSurveyed   = (updates.surveyedSystems ?? empire.surveyedSystems) as string[];
      const newlySurveyed = newSurveyed.filter(s => !oldSurveyed.has(s));

      // ── Anomaly investigations: apply outcomes when the timer elapses ─────
      let resolvedAnomalies = empire.resolvedAnomalies;
      let pendingInvestigations = empire.pendingInvestigations;
      const doneInv = (empire.pendingInvestigations ?? []).filter(p => p.completesAtTick <= newTick);
      if (doneInv.length > 0) {
        resources = { ...resources };
        const resolvedIds: string[] = [];
        for (const inv of doneInv) {
          const grant = inv.outcomes ?? ANOMALY_GRANTS[inv.anomalyType] ?? {};
          for (const [k, v] of Object.entries(grant) as [keyof Resources, number][]) {
            resources[k] = Math.max(0, (resources[k] ?? 0) + v);
          }
          resolvedIds.push(inv.planetId);
          const sysName = galaxy.systems.find(s => s.id === inv.systemId)?.name ?? inv.systemId;
          eventsToEmit.push({
            id: `evt_${newTick}_anomdone_${inv.planetId}`,
            type: 'anomaly',
            message: `${empire.username} completed an anomaly investigation at ${sysName}`,
            tick: newTick, empireId: empire.id, systemId: inv.systemId, planetId: inv.planetId,
          });
        }
        resolvedAnomalies = Array.from(new Set([...(empire.resolvedAnomalies ?? []), ...resolvedIds]));
        pendingInvestigations = (empire.pendingInvestigations ?? []).filter(p => p.completesAtTick > newTick);
      }

      // ── Diplomacy: expire stale proposals ─────────────────────────────────
      let diplomacy = empire.diplomacy;
      if ((empire.diplomacy ?? []).some(d => d.proposalPending && d.proposalPending.expiresAtTick <= newTick)) {
        diplomacy = (empire.diplomacy ?? []).map(d =>
          d.proposalPending && d.proposalPending.expiresAtTick <= newTick ? { ...d, proposalPending: undefined } : d);
      }

      // ── Claim systems for stations that finished building ─────────────────
      let controlled = [...empire.controlledSystems];
      const newlyBuilt = empire.stations.filter(s => s.buildCompletedTick <= newTick && !controlled.includes(s.systemId));
      if (newlyBuilt.length > 0) {
        controlled = Array.from(new Set([...controlled, ...newlyBuilt.map(s => s.systemId)]));
      }

      // ── Assemble the merged empire state ──────────────────────────────────
      let merged: Empire = {
        ...empire,
        ...updates,
        resources,
        fleets: movedFleets,
        ships: updatedShips,
        controlledSystems: controlled,
        diplomacy,
        ...(resolvedAnomalies ? { resolvedAnomalies } : {}),
        ...(pendingInvestigations !== undefined ? { pendingInvestigations } : {}),
      } as Empire;

      // ── Bot turn (produces a patch we merge before writing) ───────────────
      const botSSW: { path: string; value: unknown }[] = [];
      if (empire.isBot && newTick % 2 === 0) {
        const res = runBotTurn(merged, currentGame, newTick);
        merged = { ...merged, ...res.patch } as Empire;
        eventsToEmit.push(...res.events);
        botSSW.push(...res.systemStateWrites);
      }

      empiresAfterTick[empire.id] = merged;

      // ── Single empire write ───────────────────────────────────────────────
      await updateDoc(doc(db, 'games', currentGame.id, 'empires', empire.id), {
        resources:            merged.resources,
        resourceRates:        merged.resourceRates,
        infrastructure:       merged.infrastructure,
        groundOps:            merged.groundOps,
        orbitalStructures:    merged.orbitalStructures,
        surveyedSystems:      merged.surveyedSystems,
        pendingSurveys:       merged.pendingSurveys,
        colonizedPlanets:     merged.colonizedPlanets,
        pendingColonizations: merged.pendingColonizations,
        researchProgress:     merged.researchProgress,
        researchQueue:        merged.researchQueue,
        completedResearch:    merged.completedResearch,
        score:                merged.score,
        fleets:               merged.fleets,
        ships:                merged.ships,
        stations:             merged.stations,
        controlledSystems:    merged.controlledSystems,
        diplomacy:            merged.diplomacy,
        ...(merged.resolvedAnomalies ? { resolvedAnomalies: merged.resolvedAnomalies } : {}),
        ...(merged.pendingInvestigations !== undefined ? { pendingInvestigations: merged.pendingInvestigations } : {}),
      });

      // ── Game-doc systemState writes ───────────────────────────────────────
      for (const sysId of newlySurveyed) {
        await updateDoc(gameRef, { [`systemStates.${sysId}.surveyedBy`]: arrayUnion(empire.id) });
      }
      for (const stn of newlyBuilt) {
        await updateDoc(gameRef, { [`systemStates.${stn.systemId}.ownerId`]: empire.id });
      }
      for (const w of botSSW) {
        const value = w.value === 'ARRAY_UNION' ? arrayUnion(empire.id) : w.value;
        await updateDoc(gameRef, { [w.path]: value });
      }
    }

    // ─── Combat resolution (one simultaneous round per tick) ──────────────────
    const deltas = resolveAllCombat(Object.values(empiresAfterTick), currentGame, newTick);

    for (const empireId of Array.from(deltas.changedEmpireIds)) {
      const patch: Record<string, unknown> = {
        ships:             deltas.shipUpdates[empireId],
        fleets:            deltas.fleetUpdates[empireId],
        stations:          deltas.stationUpdates[empireId],
        orbitalStructures: deltas.orbitalUpdates[empireId],
      };
      if (deltas.controlledChanged.has(empireId)) patch.controlledSystems = deltas.controlledUpdates[empireId];
      if (deltas.colonizedChanged.has(empireId))  patch.colonizedPlanets  = deltas.colonizedUpdates[empireId];
      await updateDoc(doc(db, 'games', currentGame.id, 'empires', empireId), patch);

      // Reflect combat results in the in-memory snapshot for assembly/victory
      const e = empiresAfterTick[empireId];
      if (e) {
        e.ships = deltas.shipUpdates[empireId];
        e.fleets = deltas.fleetUpdates[empireId];
        e.stations = deltas.stationUpdates[empireId];
        e.orbitalStructures = deltas.orbitalUpdates[empireId];
        if (deltas.controlledChanged.has(empireId)) e.controlledSystems = deltas.controlledUpdates[empireId];
        if (deltas.colonizedChanged.has(empireId))  e.colonizedPlanets  = deltas.colonizedUpdates[empireId];
      }
    }

    for (const sysId of deltas.ownershipCleared) {
      await updateDoc(gameRef, {
        [`systemStates.${sysId}.ownerId`]: null,
        [`systemStates.${sysId}.stationId`]: null,
      });
    }
    eventsToEmit.push(...deltas.events);

    // ─── Galactic Assembly: close & apply resolutions ─────────────────────────
    const assembly = resolveAssembly(Object.values(empiresAfterTick), currentGame, newTick);
    if (assembly.changed) {
      await updateDoc(gameRef, { assembly: assembly.updatedAssembly });
      for (const [eid, grant] of Object.entries(assembly.grants)) {
        const e = empiresAfterTick[eid];
        if (!e) continue;
        const res = { ...e.resources };
        for (const [k, v] of Object.entries(grant) as [keyof Resources, number][]) res[k] = (res[k] ?? 0) + v;
        e.resources = res;
        await updateDoc(doc(db, 'games', currentGame.id, 'empires', eid), { resources: res });
      }
      for (const eid of Array.from(assembly.peaceEmpireIds)) {
        const e = empiresAfterTick[eid];
        if (!e || !(e.diplomacy ?? []).some(d => d.status === 'at_war')) continue;
        const dip = e.diplomacy.map(d => d.status === 'at_war' ? { ...d, status: 'neutral' as const } : d);
        e.diplomacy = dip;
        await updateDoc(doc(db, 'games', currentGame.id, 'empires', eid), { diplomacy: dip });
      }
      eventsToEmit.push(...assembly.events);
    }

    // ─── Victory check ────────────────────────────────────────────────────────
    const vic = checkVictory(Object.values(empiresAfterTick), { ...currentGame, tick: newTick }, newTick);
    if (vic) {
      await updateDoc(gameRef, {
        status: 'finished',
        winnerId: vic.winnerId,
        winnerName: vic.winnerName,
        victoryType: vic.victoryType,
      });
      eventsToEmit.push({
        id: `evt_${newTick}_victory`,
        type: 'conquest',
        message: `${vic.winnerName} has achieved a ${vic.victoryType.toUpperCase()} victory!`,
        tick: newTick, empireId: vic.winnerId,
      });
    }

    // ─── Emit all accumulated events ──────────────────────────────────────────
    for (const evt of eventsToEmit) {
      await addDoc(collection(db, 'games', currentGame.id, 'events'), evt);
    }
  },
}));

// ─── Fleet movement helpers ────────────────────────────────────────────────────
function processFleetMovement(fleet: Fleet, ships: Ship[], galaxy: import('@/types/game').GalaxyData): Fleet {
  const fleetShips = ships.filter(s => fleet.shipIds.includes(s.id));
  const fleetSpeed = fleetShips.length > 0
    ? Math.max(1, Math.min(...fleetShips.map(s => s.speed || 5)))
    : 5;

  // In-transit (between systems) — travel time scales with hyperlane distance
  if (fleet.state === 'in_transit' && fleet.transitToSystemId !== undefined) {
    const from = fleet.transitFromSystemId ?? fleet.systemId;
    const to   = fleet.transitToSystemId;
    const legDist = Math.max(80, systemDistance(galaxy, from, to));
    const inc = Math.max(0.03, fleetSpeed / (legDist * 0.5));
    const progress = (fleet.transitProgress ?? 0) + inc;

    if (progress >= 1) {
      const remaining = (fleet.transitPath ?? [to]).slice(1); // drop the hop just completed
      if (remaining.length > 0) {
        // Continue to the next hop along the path (keep the attack/move task)
        const { targetPosX, targetPosY, ...rest } = fleet;
        return {
          ...rest,
          systemId: to,
          transitFromSystemId: to,
          transitToSystemId: remaining[0],
          transitPath: remaining,
          transitProgress: 0,
          state: 'in_transit' as const,
        };
      }
      // Final arrival — strip transit fields but KEEP task so attacks trigger
      const { transitToSystemId, transitFromSystemId, transitProgress, transitPath, targetPosX, targetPosY, ...rest } = fleet;
      return {
        ...rest,
        systemId: to,
        posX: 0.15,
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

// Heal non-fighting ships: faster in controlled space and at shipyards, plus
// any built-in repair_bay tiles. Ships still under construction don't regen.
function repairShips(empire: Empire, ships: Ship[], fleets: Fleet[], tick: number): Ship[] {
  const fighting = new Set<string>();
  for (const f of fleets) if (f.state === 'fighting') for (const sid of f.shipIds) fighting.add(sid);

  const controlled = new Set(empire.controlledSystems);
  const shipyardSystems = new Set<string>();
  for (const i of empire.infrastructure) if (i.type === 'shipyard' && i.active) shipyardSystems.add(i.systemId);
  for (const o of (empire.orbitalStructures ?? [])) if (o.type === 'orbital_shipyard' && o.active) shipyardSystems.add(o.systemId);

  return ships.map(s => {
    if (s.hp >= s.maxHp) return s;
    if (fighting.has(s.id)) return s;
    if ((s.buildCompletedTick ?? 0) > tick) return s;

    let regen = s.tiles.filter(t => t.type === 'repair_bay').length * 5;
    if (controlled.has(s.systemId))      regen += Math.ceil(s.maxHp * 0.04);
    if (shipyardSystems.has(s.systemId)) regen += Math.ceil(s.maxHp * 0.06);
    if (regen <= 0) return s;
    return { ...s, hp: Math.min(s.maxHp, s.hp + regen) };
  });
}
