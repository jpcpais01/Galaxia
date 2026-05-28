'use client';
import { useRef, useEffect, useCallback } from 'react';
import { useGameStore } from '@/store/game-store';
import { STAR_CONFIG, PLANET_CONFIG } from '@/lib/game/constants';
import { renderPlanetSync, preloadPlanets } from '@/lib/game/planet-renderer';
import { PIXEL_ICONS } from '@/components/ui/PixelIcon';
import type { StarSystem, Fleet } from '@/types/game';

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

  const { currentGame, empires, myEmpire, ui, selectPlanet, setView, selectFleet, moveFleetInSystem } = useGameStore();

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

    // Stations
    for (const empire of empires) {
      for (const station of empire.stations) {
        if (station.systemId !== system.id) continue;
        const angle = ts * 0.0002 + empire.id.charCodeAt(0) * 0.5;
        const stR = 80;
        const sx2 = cx + Math.cos(angle) * stR;
        const sy2 = cy + Math.sin(angle) * stR;
        ctx.fillStyle = empire.color;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        // Simple station shape: diamond
        ctx.moveTo(sx2, sy2 - 5);
        ctx.lineTo(sx2 + 5, sy2);
        ctx.lineTo(sx2, sy2 + 5);
        ctx.lineTo(sx2 - 5, sy2);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Fleets
    for (const empire of empires) {
      for (const fleet of (empire.fleets ?? [])) {
        if (fleet.systemId !== system.id) continue;
        if (fleet.state === 'in_transit') continue;

        const fx = fleet.posX * W;
        const fy = fleet.posY * H;
        const isMine = empire.id === myEmpire?.id;
        const isSelected = fleet.id === ui.selectedFleetId;

        // Empire color ring
        ctx.strokeStyle = empire.color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(fx, fy, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Ship sprite
        drawPixelIcon(ctx, 'fleet_ship', fx, fy, empire.color, 2);

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

    // 1) Try fleet click first
    for (const empire of empires) {
      for (const fleet of (empire.fleets ?? [])) {
        if (fleet.systemId !== system.id) continue;
        if (fleet.state === 'in_transit') continue;
        const fx = fleet.posX * W;
        const fy = fleet.posY * H;
        const dx = mx - fx;
        const dy = my - fy;
        if (Math.sqrt(dx * dx + dy * dy) < 14) {
          selectFleet(fleet.id);
          return;
        }
      }
    }

    // 2) Planet click
    for (let i = 0; i < system.planets.length; i++) {
      const planet = system.planets[i];
      const orbitR = (i + 1.5) * orbitScale;
      const speed  = 0.15 / (i + 1);
      const angle  = now * speed * 0.001 + (planet.seed * 0.01);
      const px = cx + Math.cos(angle) * orbitR;
      const py = cy + Math.sin(angle) * orbitR;
      const planetR = Math.max(5, 5 + planet.size * 2.5);

      const dx = mx - px;
      const dy = my - py;
      if (Math.sqrt(dx * dx + dy * dy) < planetR + 8) {
        selectPlanet(planet.id);
        return;
      }
    }

    // 3) If a fleet is selected and it's mine, move it
    const selFleet = myEmpire?.fleets?.find(f => f.id === ui.selectedFleetId && f.systemId === system.id);
    if (selFleet) {
      const nx = mx / W;
      const ny = my / H;
      moveFleetInSystem(selFleet.id, nx, ny);
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
        onClick={() => { setView('galaxy'); selectPlanet(null); selectFleet(null); }}
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
          <div className="text-[#8aa0b0]">{selFleet.shipIds.length} ship(s) · {selFleet.state}</div>
          {selFleet.task && (
            <div className="text-[#aaaaff]">Task: {selFleet.task.type}</div>
          )}
          <div className="text-[#3a5a6a] text-[8px]">Click anywhere to move here</div>
          <button
            onClick={() => selectFleet(null)}
            className="btn-gray text-[8px] py-0.5"
          >DESELECT</button>
        </div>
      )}
    </div>
  );
}
