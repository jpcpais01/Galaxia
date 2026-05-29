'use client';
import { useRef, useEffect, useCallback } from 'react';
import { useGameStore } from '@/store/game-store';
import { STAR_CONFIG, PLANET_CONFIG, STATION_CONFIG } from '@/lib/game/constants';
import { renderPlanetSync, preloadPlanets } from '@/lib/game/planet-renderer';
import { PIXEL_ICONS } from '@/components/ui/PixelIcon';
import type { StarSystem, Fleet } from '@/types/game';

// 1-px deterministic pseudo-random per seed (for stable explosion jitter)
function hashf(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function drawPixelIcon(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, color: string, scale = 2) {
  const rows = PIXEL_ICONS[id];
  if (!rows) return;
  ctx.fillStyle = color;
  const halfW = 4 * scale;
  const halfH = 4 * scale;
  for (let py = 0; py < 8; py++) {
    const row = rows[py];
    for (let px = 0; px < 8; px++) {
      if (row & (0x80 >> px)) {
        ctx.fillRect(Math.round(x - halfW + px * scale), Math.round(y - halfH + py * scale), scale, scale);
      }
    }
  }
}

export default function SystemCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);
  const timeRef   = useRef<number>(0);
  // Screen-space positions captured each frame so the click handler can hit-test
  // exactly what's drawn (fleets + orbiting stations).
  const fleetHitsRef   = useRef<{ id: string; empireId: string; mine: boolean; x: number; y: number }[]>([]);
  const stationHitsRef = useRef<{ id: string; empireId: string; mine: boolean; x: number; y: number }[]>([]);

  const { currentGame, empires, myEmpire, ui, selectPlanet, setView, selectFleet, moveFleetInSystem, setFleetTask } = useGameStore();

  const system: StarSystem | undefined = currentGame?.galaxy.systems.find(
    s => s.id === ui.selectedSystemId
  );

  // Preload planet bitmaps
  useEffect(() => {
    if (!system) return;
    const entries = system.planets.flatMap(p => [
      { type: p.type, seed: p.seed },
      ...p.moons.map(m => ({ type: m.type, seed: m.seed })),
    ]);
    preloadPlanets(entries);
  }, [system?.id]);

  const draw = useCallback((ts: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !system) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    timeRef.current = ts;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#00000a';
    ctx.fillRect(0, 0, W, H);

    // Subtle starfield — seeded PRNG so positions are random but stable per system
    let rngState = system.id.split('').reduce((acc, c, i) => acc + c.charCodeAt(0) * (i + 1), 0) ^ 0xDEADBEEF;
    const rng = () => {
      rngState = (Math.imul(rngState ^ (rngState >>> 17), 0x45d9f3b) + 1013904223) | 0;
      return (rngState >>> 0) / 0x100000000;
    };
    for (let i = 0; i < 140; i++) {
      const sx = rng() * W;
      const sy = rng() * H;
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.06 + rng() * 0.22;
      ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
    }
    ctx.globalAlpha = 1;

    // Orbital rings
    const maxOrbit = system.planets.length > 0 ? system.planets.length + 1 : 2;
    const orbitScale = Math.min(cx, cy) * 0.85 / maxOrbit;

    for (let i = 0; i < system.planets.length; i++) {
      const orbitR = (i + 1.5) * orbitScale;
      ctx.strokeStyle = '#1a2a3a';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 8]);
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(cx, cy, orbitR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // Stars
    const primaryCfg = STAR_CONFIG[system.stars[0].type];
    const starR = Math.max(16, primaryCfg.baseRadius * 0.9);

    // Star glow
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, starR * 3);
    grd.addColorStop(0, primaryCfg.color + 'ff');
    grd.addColorStop(0.3, primaryCfg.glowColor + '88');
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, starR * 3, 0, Math.PI * 2);
    ctx.fill();

    // Star body
    ctx.fillStyle = primaryCfg.color;
    ctx.beginPath();
    ctx.arc(cx, cy, starR, 0, Math.PI * 2);
    ctx.fill();

    // Corona flare
    const flareCount = 8;
    for (let i = 0; i < flareCount; i++) {
      const angle = (i / flareCount) * Math.PI * 2 + ts * 0.0003;
      const len = starR * (1.3 + Math.sin(ts * 0.001 + i * 1.3) * 0.3);
      ctx.strokeStyle = primaryCfg.glowColor + '66';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * starR, cy + Math.sin(angle) * starR);
      ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
      ctx.stroke();
    }

    // Binary star
    if (system.stars.length > 1) {
      const cfg2 = STAR_CONFIG[system.stars[1].type];
      const r2 = Math.max(10, cfg2.baseRadius * 0.6);
      const bx = cx + starR * 2.2;
      const by = cy - starR * 0.5;
      const g2 = ctx.createRadialGradient(bx, by, 0, bx, by, r2 * 2.5);
      g2.addColorStop(0, cfg2.color);
      g2.addColorStop(1, 'transparent');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(bx, by, r2 * 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = cfg2.color;
      ctx.beginPath();
      ctx.arc(bx, by, r2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Planets + moons
    for (let i = 0; i < system.planets.length; i++) {
      const planet = system.planets[i];
      const orbitR = (i + 1.5) * orbitScale;
      const speed  = 0.15 / (i + 1);
      const angle  = ts * speed * 0.001 + (planet.seed * 0.01);

      const px = cx + Math.cos(angle) * orbitR;
      const py = cy + Math.sin(angle) * orbitR;

      const planetR = Math.max(5, 5 + planet.size * 2.5);

      renderPlanetSync(ctx, planet.type, planet.seed, px, py, planetR);

      // Colonized badge
      if (myEmpire?.colonizedPlanets.includes(planet.id)) {
        ctx.strokeStyle = myEmpire.color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(px, py, planetR + 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Anomaly indicator
      if (planet.hasAnomaly && !planet.anomalyRevealed) {
        ctx.fillStyle = '#ffaa00';
        ctx.font = '9px Share Tech Mono';
        ctx.textAlign = 'center';
        ctx.fillText('?', px, py - planetR - 3);
      }

      // Selected planet
      if (ui.selectedPlanetId === planet.id) {
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.8 + Math.sin(ts * 0.005) * 0.2;
        ctx.beginPath();
        ctx.arc(px, py, planetR + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Planet label
      const fontSize = Math.max(7, 8);
      ctx.font = `${fontSize}px Share Tech Mono`;
      ctx.textAlign = 'center';
      ctx.fillStyle = planet.colonizable ? '#88cc88' : '#5a7a8a';
      ctx.globalAlpha = 0.85;
      ctx.fillText(planet.name, px, py + planetR + 11);
      ctx.globalAlpha = 1;

      // Moons
      for (let m = 0; m < planet.moons.length; m++) {
        const moon = planet.moons[m];
        const moonOrbitR = planetR + 8 + m * 6;
        const moonSpeed  = speed * 4 + m * 0.5;
        const moonAngle  = ts * moonSpeed * 0.001 + m * 2.1;
        const mx = px + Math.cos(moonAngle) * moonOrbitR;
        const my = py + Math.sin(moonAngle) * moonOrbitR;
        renderPlanetSync(ctx, moon.type, moon.seed, mx, my, 2.5);
      }
    }

    // Fog of war: enemy assets in this system are only shown if we have vision
    // (we control it, surveyed it, or have a fleet present).
    const sysVisible = !!myEmpire && (
      myEmpire.controlledSystems.includes(system.id) ||
      myEmpire.surveyedSystems.includes(system.id) ||
      (myEmpire.fleets ?? []).some(f => f.systemId === system.id && f.state !== 'in_transit')
    );

    // Stations — orbit radius is a fraction of the viewport so they're always
    // on-screen, and indexed within THIS system (not the empire's whole fleet).
    const maxR = Math.min(cx, cy);
    const stationHits: typeof stationHitsRef.current = [];
    for (const empire of empires) {
      const isMine = empire.id === myEmpire?.id;
      if (!isMine && !sysVisible) continue;   // hide undiscovered empires' stations
      const here = empire.stations.filter(s => s.systemId === system.id);
      for (let li = 0; li < here.length; li++) {
        const station = here[li];
        const cfg = STATION_CONFIG[station.type];
        const angle = ts * 0.0002 + empire.id.charCodeAt(0) * 0.5 + li * 1.3;
        const stR = Math.min(maxR * 0.7, maxR * 0.22 + li * 18);
        const sx2 = cx + Math.cos(angle) * stR;
        const sy2 = cy + Math.sin(angle) * stR;

        const building = (station.buildCompletedTick ?? 0) > (currentGame?.tick ?? 0);
        const hp    = station.hp    ?? cfg.hp;
        const maxHp = station.maxHp ?? cfg.hp;
        const hpPct = Math.max(0, Math.min(1, hp / maxHp));

        // Glow ring
        ctx.strokeStyle = empire.color;
        ctx.globalAlpha = building ? 0.35 : 0.85;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx2, sy2, 9, 0, Math.PI * 2);
        ctx.stroke();

        // Station body: diamond hull with cross arms
        ctx.fillStyle = empire.color;
        ctx.globalAlpha = building ? 0.4 : 1;
        ctx.beginPath();
        ctx.moveTo(sx2, sy2 - 6);
        ctx.lineTo(sx2 + 6, sy2);
        ctx.lineTo(sx2, sy2 + 6);
        ctx.lineTo(sx2 - 6, sy2);
        ctx.closePath();
        ctx.fill();
        // Solar arms
        ctx.fillRect(sx2 - 10, sy2 - 1, 4, 2);
        ctx.fillRect(sx2 + 6,  sy2 - 1, 4, 2);
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = building ? 0.4 : 0.9;
        ctx.fillRect(sx2 - 1, sy2 - 1, 2, 2);
        ctx.globalAlpha = 1;

        // HP bar (only when damaged or hostile-relevant)
        if (!building && hpPct < 1) {
          const bw = 22;
          ctx.fillStyle = '#000000aa';
          ctx.fillRect(sx2 - bw / 2 - 1, sy2 - 17, bw + 2, 4);
          ctx.fillStyle = hpPct > 0.5 ? '#44ff88' : hpPct > 0.25 ? '#ffaa00' : '#ff4455';
          ctx.fillRect(sx2 - bw / 2, sy2 - 16, bw * hpPct, 2);
        }

        // Type label / building indicator
        ctx.font = '7px Share Tech Mono';
        ctx.textAlign = 'center';
        ctx.fillStyle = isMine ? '#8aa0b0' : '#aa7777';
        ctx.globalAlpha = 0.8;
        ctx.fillText(building ? `◐ ${cfg.label}` : cfg.label, sx2, sy2 + 17);
        ctx.globalAlpha = 1;

        if (!building) stationHits.push({ id: station.id, empireId: empire.id, mine: isMine, x: sx2, y: sy2 });
      }
    }
    stationHitsRef.current = stationHits;

    // ── Build a quick index of all in-system combat assets (for beam FX) ──
    const assetPos: { empireId: string; x: number; y: number }[] = [];
    for (const empire of empires) {
      if (empire.id !== myEmpire?.id && !sysVisible) continue;
      for (const fleet of (empire.fleets ?? [])) {
        if (fleet.systemId === system.id && fleet.state !== 'in_transit') {
          assetPos.push({ empireId: empire.id, x: fleet.posX * W, y: fleet.posY * H });
        }
      }
    }
    for (const sh of stationHits) assetPos.push({ empireId: sh.empireId, x: sh.x, y: sh.y });

    // Fleets
    const fleetHits: typeof fleetHitsRef.current = [];
    for (const empire of empires) {
      const isMineEmpire = empire.id === myEmpire?.id;
      if (!isMineEmpire && !sysVisible) continue;   // hide undiscovered empires' fleets
      for (const fleet of (empire.fleets ?? [])) {
        if (fleet.systemId !== system.id) continue;
        if (fleet.state === 'in_transit') continue;

        const fx = fleet.posX * W;
        const fy = fleet.posY * H;
        const isMine = empire.id === myEmpire?.id;
        const isSelected = fleet.id === ui.selectedFleetId;
        fleetHits.push({ id: fleet.id, empireId: empire.id, mine: isMine, x: fx, y: fy });

        // Fleet HP (sum of member ships)
        const fShips = empire.ships.filter(s => fleet.shipIds.includes(s.id));
        const fhp    = fShips.reduce((a, s) => a + s.hp, 0);
        const fmaxhp = fShips.reduce((a, s) => a + s.maxHp, 0) || 1;
        const hpPct  = Math.max(0, Math.min(1, fhp / fmaxhp));

        // ── Combat FX: animated weapon beams + muzzle flashes while fighting ──
        if (fleet.state === 'fighting') {
          const enemies = assetPos.filter(a => a.empireId !== empire.id);
          // nearest enemy asset
          let near: { x: number; y: number } | null = null;
          let nd = Infinity;
          for (const en of enemies) {
            const d = (en.x - fx) ** 2 + (en.y - fy) ** 2;
            if (d < nd) { nd = d; near = en; }
          }
          if (near) {
            const beat = (ts * 0.012) + fx * 0.05;
            const fire = (Math.sin(beat) + 1) / 2; // 0..1 pulse
            // Beam
            ctx.strokeStyle = empire.color;
            ctx.lineWidth = 1 + fire * 1.5;
            ctx.globalAlpha = 0.25 + fire * 0.55;
            ctx.beginPath();
            ctx.moveTo(fx, fy);
            // jitter the endpoint slightly for a "barrage" feel
            const jx = near.x + (hashf(Math.floor(ts * 0.02) + fx) - 0.5) * 10;
            const jy = near.y + (hashf(Math.floor(ts * 0.02) + fy) - 0.5) * 10;
            ctx.lineTo(jx, jy);
            ctx.stroke();
            // Muzzle flash at source
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = fire * 0.8;
            ctx.fillRect(fx - 1, fy - 1, 2, 2);
            // Impact explosion at target
            if (fire > 0.7) {
              const er = 2 + (fire - 0.7) * 14;
              const g = ctx.createRadialGradient(jx, jy, 0, jx, jy, er);
              g.addColorStop(0, '#ffffff');
              g.addColorStop(0.4, empire.color);
              g.addColorStop(1, 'transparent');
              ctx.fillStyle = g;
              ctx.globalAlpha = 0.7;
              ctx.beginPath();
              ctx.arc(jx, jy, er, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.globalAlpha = 1;
          }
        }

        // Empire color ring (pulses red-tinged when fighting)
        ctx.strokeStyle = fleet.state === 'fighting' ? '#ff5544' : empire.color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(fx, fy, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Ship sprite
        drawPixelIcon(ctx, 'fleet_ship', fx, fy, empire.color, 2);

        // Fleet HP bar
        if (hpPct < 1) {
          const bw = 24;
          ctx.fillStyle = '#000000aa';
          ctx.fillRect(fx - bw / 2 - 1, fy + 13, bw + 2, 4);
          ctx.fillStyle = hpPct > 0.5 ? '#44ff88' : hpPct > 0.25 ? '#ffaa00' : '#ff4455';
          ctx.fillRect(fx - bw / 2, fy + 14, bw * hpPct, 2);
        }

        // Selection brackets
        if (isSelected) {
          ctx.strokeStyle = '#44ffff';
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.8 + Math.sin(ts * 0.005) * 0.2;
          const b = 16;
          // Top-left
          ctx.beginPath();
          ctx.moveTo(fx - b, fy - b + 4);
          ctx.lineTo(fx - b, fy - b);
          ctx.lineTo(fx - b + 4, fy - b);
          // Top-right
          ctx.moveTo(fx + b - 4, fy - b);
          ctx.lineTo(fx + b, fy - b);
          ctx.lineTo(fx + b, fy - b + 4);
          // Bottom-left
          ctx.moveTo(fx - b, fy + b - 4);
          ctx.lineTo(fx - b, fy + b);
          ctx.lineTo(fx - b + 4, fy + b);
          // Bottom-right
          ctx.moveTo(fx + b - 4, fy + b);
          ctx.lineTo(fx + b, fy + b);
          ctx.lineTo(fx + b, fy + b - 4);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // Ship count badge
        ctx.fillStyle = empire.color;
        ctx.font = 'bold 8px Share Tech Mono';
        ctx.textAlign = 'center';
        ctx.fillText(String(fleet.shipIds.length), fx, fy - 14);

        // Name label
        ctx.font = '8px Share Tech Mono';
        ctx.fillStyle = isMine ? '#c0d0e0' : '#aa6666';
        ctx.globalAlpha = 0.85;
        ctx.fillText(fleet.name, fx, fy + 22);
        ctx.globalAlpha = 1;

        // Move target line
        if (isSelected && fleet.targetPosX !== undefined && fleet.targetPosY !== undefined) {
          ctx.strokeStyle = '#44ffff';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.moveTo(fx, fy);
          ctx.lineTo(fleet.targetPosX * W, fleet.targetPosY * H);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
      }
    }
    fleetHitsRef.current = fleetHits;

    animRef.current = requestAnimationFrame(draw);
  }, [system, empires, myEmpire, ui.selectedPlanetId, ui.selectedFleetId, currentGame]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  const onClick = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || !system) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const maxOrbit = system.planets.length > 0 ? system.planets.length + 1 : 2;
    const orbitScale = Math.min(cx, cy) * 0.85 / maxOrbit;
    const now = performance.now();

    const within = (x: number, y: number, r: number) => (mx - x) ** 2 + (my - y) ** 2 < r * r;

    // Is one of my fleets currently selected & present here? (enables attack/move orders)
    const selFleet = myEmpire?.fleets?.find(f => f.id === ui.selectedFleetId && f.systemId === system.id);

    // Hit-test using the exact screen positions captured during draw
    const hitFleet   = fleetHitsRef.current.find(h => within(h.x, h.y, 14));
    const hitStation = stationHitsRef.current.find(h => within(h.x, h.y, 12));

    // 1) With a fleet selected, clicking an ENEMY asset issues an attack order
    if (selFleet) {
      if (hitFleet && !hitFleet.mine) {
        setFleetTask(selFleet.id, {
          type: 'attack_fleet',
          targetFleetId: hitFleet.id,
          targetEmpireId: hitFleet.empireId,
        });
        return;
      }
      if (hitStation && !hitStation.mine) {
        setFleetTask(selFleet.id, {
          type: 'attack_station',
          targetEmpireId: hitStation.empireId,
        });
        return;
      }
    }

    // 2) Clicking any fleet selects it
    if (hitFleet) { selectFleet(hitFleet.id); return; }

    // 3) Planet click
    for (let i = 0; i < system.planets.length; i++) {
      const planet = system.planets[i];
      const orbitR = (i + 1.5) * orbitScale;
      const speed  = 0.15 / (i + 1);
      const angle  = now * speed * 0.001 + (planet.seed * 0.01);
      const px = cx + Math.cos(angle) * orbitR;
      const py = cy + Math.sin(angle) * orbitR;
      const planetR = Math.max(5, 5 + planet.size * 2.5);
      if (within(px, py, planetR + 8)) { selectPlanet(planet.id); return; }
    }

    // 4) If a fleet is selected and it's mine, move it to the clicked point
    if (selFleet) {
      moveFleetInSystem(selFleet.id, mx / W, my / H);
      return;
    }

    selectPlanet(null);
  };

  // Selected fleet overlay info
  const selFleet: Fleet | undefined = myEmpire?.fleets?.find(f => f.id === ui.selectedFleetId && f.systemId === system?.id);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-pointer"
        onClick={onClick}
      />
      <button
        className="absolute top-3 left-3 btn-gray text-[9px] px-2 py-1"
        onClick={() => { setView('galaxy'); selectPlanet(null); }}
      >
        ← GALAXY
      </button>
      {system && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 font-pixel text-[10px] text-accent-cyan glow-text-cyan pointer-events-none whitespace-nowrap">
          {system.name}
        </div>
      )}
      {selFleet && (
        <div className="absolute top-12 left-3 pixel-panel p-2 text-[9px] font-mono w-52 flex flex-col gap-1" style={{ borderColor: '#44aaff' }}>
          <div className="font-pixel text-[9px] text-accent-cyan">{selFleet.name}</div>
          <div className="text-[#8aa0b0]">
            {selFleet.shipIds.length} ship(s) ·{' '}
            <span style={{ color: selFleet.state === 'fighting' ? '#ff5544' : '#8aa0b0' }}>{selFleet.state}</span>
          </div>
          {selFleet.task && (
            <div className="text-[#ff8866]">⚔ {selFleet.task.type.replace('_', ' ')}</div>
          )}
          <div className="text-[#3a5a6a] text-[8px]">Click empty space to move</div>
          <div className="text-[#3a5a6a] text-[8px]">Click an enemy ship/station to attack</div>
          <div className="flex gap-1">
            {selFleet.task && (
              <button
                onClick={() => setFleetTask(selFleet.id, null)}
                className="btn-gray text-[8px] py-0.5 flex-1"
              >STAND DOWN</button>
            )}
            <button
              onClick={() => selectFleet(null)}
              className="btn-gray text-[8px] py-0.5 flex-1"
            >DESELECT</button>
          </div>
        </div>
      )}
    </div>
  );
}
