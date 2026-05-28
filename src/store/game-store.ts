'use client';
import { create } from 'zustand';
import {
  doc, collection, setDoc, updateDoc, onSnapshot, getDocs,
  query, orderBy, limit, runTransaction, addDoc, arrayUnion, getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type {
  GameMeta, Empire, GameEvent, UIState, SystemState,
  InfraType, StationType, Resources,
} from '@/types/game';
import { generateGalaxy, findHomeSystem } from '@/lib/game/galaxy-generator';
import { createBotEmpire, decideBotAction } from '@/lib/game/bot-ai';
import { applyTick, canAfford, deductCosts, countUsedSlots } from '@/lib/game/economy';
import { INFRA_CONFIG, STATION_CONFIG, EMPIRE_COLORS, STARTING_RESOURCES, GAME_TICK_MS } from '@/lib/game/constants';
import { STARTER_DESIGNS } from '@/lib/game/ship-designer';
import { SeededRandom } from '@/lib/noise';

interface GameStore {
  // Lobby
  games: GameMeta[];
  loadGames: () => Promise<void>;
  createGame: (name: string, maxPlayers: number, botCount: number, hostPlayerId: string, hostUsername: string) => Promise<string>;
  joinGame: (gameId: string, playerId: string, username: string, color: string) => Promise<void>;
  startGame: (gameId: string) => Promise<void>;

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
  cameraX: 0,
  cameraY: 0,
  cameraZoom: 1,
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

  createGame: async (name, maxPlayers, botCount, hostPlayerId, hostUsername) => {
    const seed = Math.floor(Math.random() * 99999) + 1;
    const galaxy = generateGalaxy(seed);

    const systemStates: Record<string, SystemState> = {};
    for (const sys of galaxy.systems) {
      systemStates[sys.id] = { systemId: sys.id, surveyedBy: [] };
    }

    const gameId = `game_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const game: GameMeta = {
      id: gameId, name, status: 'lobby',
      createdBy: hostPlayerId, createdByUsername: hostUsername,
      createdAt: Date.now(), maxPlayers, botCount,
      currentPlayers: 1, tick: 0, lastTickTime: Date.now(),
      seed, galaxy, systemStates, assembly: [],
    };

    // Strip galaxy — clients regenerate it from seed; only store lightweight metadata
    const { galaxy: _g, ...gameDoc } = game;
    await setDoc(doc(db, 'games', gameId), gameDoc);

    // Create host empire
    const homeId = findHomeSystem(galaxy, 0);
    const empire: Empire = {
      id: `empire_${hostPlayerId}`,
      playerId: hostPlayerId,
      username: hostUsername,
      color: EMPIRE_COLORS[0],
      isBot: false,
      homeSystemId: homeId,
      resources: { ...STARTING_RESOURCES },
      resourceRates: { energy: 5, food: 0, minerals: 0, research: 5, compute: 0, credits: 10, population: 0 },
      controlledSystems: [],
      colonizedPlanets: [],
      infrastructure: [],
      stations: [],
      ships: [],
      shipDesigns: STARTER_DESIGNS.map((d, i) => ({ ...d, id: `design_${hostPlayerId}_${i}` })),
      completedResearch: [],
      researchQueue: null,
      researchProgress: 0,
      diplomacy: [],
      surveyedSystems: [homeId],
      isOnline: true,
      lastSeen: Date.now(),
      score: 0,
    };

    await setDoc(doc(db, 'games', gameId, 'empires', empire.id), empire);
    return gameId;
  },

  joinGame: async (gameId, playerId, username, color) => {
    const snap = await getDoc(doc(db, 'games', gameId));
    const rawGame = snap.data() as Omit<GameMeta, 'galaxy'> & { seed: number };
    const galaxy = generateGalaxy(rawGame.seed);

    const existingEmpires = await getDocs(collection(db, 'games', gameId, 'empires'));
    // Idempotent: if this player already has an empire, do nothing
    if (existingEmpires.docs.some(d => d.data().playerId === playerId)) return;
    const count = existingEmpires.size;

    const homeId = findHomeSystem(galaxy, count);
    const empire: Empire = {
      id: `empire_${playerId}`,
      playerId,
      username,
      color,
      isBot: false,
      homeSystemId: homeId,
      resources: { ...STARTING_RESOURCES },
      resourceRates: { energy: 5, food: 0, minerals: 0, research: 5, compute: 0, credits: 10, population: 0 },
      controlledSystems: [],
      colonizedPlanets: [],
      infrastructure: [],
      stations: [],
      ships: [],
      shipDesigns: STARTER_DESIGNS.map((d, i) => ({ ...d, id: `design_${playerId}_${i}` })),
      completedResearch: [],
      researchQueue: null,
      researchProgress: 0,
      diplomacy: [],
      surveyedSystems: [homeId],
      isOnline: true,
      lastSeen: Date.now(),
      score: 0,
    };

    await setDoc(doc(db, 'games', gameId, 'empires', empire.id), empire);
    await updateDoc(doc(db, 'games', gameId), { currentPlayers: count + 1 });
  },

  startGame: async (gameId) => {
    const snap = await getDoc(doc(db, 'games', gameId));
    const rawGame = snap.data() as Omit<GameMeta, 'galaxy'> & { seed: number };
    const game: GameMeta = { ...rawGame, galaxy: generateGalaxy(rawGame.seed) };
    const empireSnap = await getDocs(collection(db, 'games', gameId, 'empires'));
    const existingCount = empireSnap.size;

    const bots: Empire[] = [];
    for (let i = 0; i < game.botCount; i++) {
      const homeId = findHomeSystem(game.galaxy, existingCount + i);
      const botData = createBotEmpire(i, homeId, existingCount + game.botCount);
      const bot: Empire = { ...botData, id: `bot_empire_${i}` };
      bots.push(bot);
      await setDoc(doc(db, 'games', gameId, 'empires', bot.id), bot);
    }

    await updateDoc(doc(db, 'games', gameId), {
      status: 'playing',
      lastTickTime: Date.now(),
      hostEmpireId: empireSnap.docs[0]?.id,
    });
  },

  subscribeToGame: (gameId, playerId) => {
    const unsubs: (() => void)[] = [];

    let cachedGalaxy: import('@/types/game').GalaxyData | null = null;
    const gameSub = onSnapshot(doc(db, 'games', gameId), snap => {
      if (!snap.exists()) return;
      const raw = snap.data() as Omit<GameMeta, 'galaxy'> & { seed: number };
      // Generate galaxy once and reuse — it never changes
      if (!cachedGalaxy || cachedGalaxy.seed !== raw.seed) {
        cachedGalaxy = generateGalaxy(raw.seed);
      }
      set({ currentGame: { ...raw, galaxy: cachedGalaxy } });
    });
    unsubs.push(gameSub);

    const empireSub = onSnapshot(collection(db, 'games', gameId, 'empires'), snap => {
      const empires = snap.docs.map(d => d.data() as Empire);
      const myEmpire = empires.find(e => e.playerId === playerId) ?? null;
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
  selectSystem:  (id)      => set(s => ({ ui: { ...s.ui, selectedSystemId: id, selectedPlanetId: null } })),
  selectPlanet:  (id)      => set(s => ({ ui: { ...s.ui, selectedPlanetId: id } })),
  setPanel:      (panel)   => set(s => ({ ui: { ...s.ui, activePanel: panel } })),
  setCamera:     (x,y,z)   => set(s => ({ ui: { ...s.ui, cameraX: x, cameraY: y, cameraZoom: z } })),
  setHoverSystem:(id)      => set(s => ({ ui: { ...s.ui, hoverSystemId: id } })),

  surveySystem: async (systemId) => {
    const { currentGame, myEmpire } = get();
    if (!currentGame || !myEmpire) return;
    if (myEmpire.surveyedSystems.includes(systemId)) return;

    const updated = { surveyedSystems: [...myEmpire.surveyedSystems, systemId] };
    await updateDoc(doc(db, 'games', currentGame.id, 'empires', myEmpire.id), updated);

    const stateRef = doc(db, 'games', currentGame.id);
    await updateDoc(stateRef, {
      [`systemStates.${systemId}.surveyedBy`]: arrayUnion(myEmpire.id),
    });

    await addDoc(collection(db, 'games', currentGame.id, 'events'), {
      id: `evt_${Date.now()}`, type: 'survey',
      message: `${myEmpire.username} surveyed system ${systemId}`,
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
    if (myEmpire.resources.credits < 150) return;

    const planet = currentGame.galaxy.systems
      .find(s => s.id === systemId)?.planets
      .find(p => p.id === planetId);
    if (!planet?.colonizable) return;

    const newColonized = [...myEmpire.colonizedPlanets, planetId];
    const newResources = { ...myEmpire.resources, credits: myEmpire.resources.credits - 150 };

    await updateDoc(doc(db, 'games', currentGame.id, 'empires', myEmpire.id), {
      colonizedPlanets: newColonized,
      resources: newResources,
    });

    await addDoc(collection(db, 'games', currentGame.id, 'events'), {
      id: `evt_${Date.now()}`, type: 'colonize',
      message: `${myEmpire.username} colonized ${planet.name}`,
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
