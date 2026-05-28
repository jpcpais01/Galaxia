'use client';
import { useRef, useEffect, useCallback } from 'react';
import { useGameStore } from '@/store/game-store';
import { useAuthStore } from '@/store/auth-store';
import { STAR_CONFIG } from '@/lib/game/constants';
import { SeededRandom } from '@/lib/noise';
import type { StarSystem } from '@/types/game';

const BG_STARS = 400;

interface BgStar { x: number; y: number; r: number; a: number; }

function generateBgStars(seed: number, w: number, h: number): BgStar[] {
  const rng = new SeededRandom(seed + 9999);
  return Array.from({ length: BG_STARS }, () => ({
    x: rng.range(0, w),
    y: rng.range(0, h),
    r: rng.range(0.3, 1.2),
    a: rng.range(0.2, 0.9),
  }));
}

function generateNebulae(seed: number, w: number, h: number) {
  const rng = new SeededRandom(seed + 5555);
  return Array.from({ length: 6 }, () => ({
    x: rng.range(100, w - 100),
    y: rng.range(100, h - 100),
    rx: rng.range(150, 400),
    ry: rng.range(100, 300),
    color: rng.pick(['#0a0a2a', '#0a1a0a', '#1a0a0a', '#0a1a1a', '#1a0a1a']),
    a: rng.range(0.3, 0.7),
  }));
}

export default function GalaxyCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);
  const dragRef   = useRef<{ x: number; y: number; camX: number; camY: number } | null>(null);
  const bgStarsRef = useRef<BgStar[]>([]);
  const nebulaeRef = useRef<ReturnType<typeof generateNebulae>>([]);

  const { currentGame, empires, ui, selectSystem, setCamera, setHoverSystem } = useGameStore();
  const { user } = useAuthStore();

  // Convert world → screen
  const worldToScreen = useCallback((wx: number, wy: number, w: number, h: number) => {
    const { cameraX, cameraY, cameraZoom } = ui;
    return {
      sx: (wx - cameraX) * cameraZoom + w / 2,
      sy: (wy - cameraY) * cameraZoom + h / 2,
    };
  }, [ui.cameraX, ui.cameraY, ui.cameraZoom]);

  const screenToWorld = useCallback((sx: number, sy: number, w: number, h: number) => {
    const { cameraX, cameraY, cameraZoom } = ui;
    return {
      wx: (sx - w / 2) / cameraZoom + cameraX,
      wy: (sy - h / 2) / cameraZoom + cameraY,
    };
  }, [ui.cameraX, ui.cameraY, ui.cameraZoom]);

  useEffect(() => {
    if (!currentGame) return;
    const seed = currentGame.galaxy.seed;
    const W = currentGame.galaxy.width;
    const H = currentGame.galaxy.height;
    bgStarsRef.current = generateBgStars(seed, W, H);
    nebulaeRef.current = generateNebulae(seed, W, H);
  }, [currentGame?.galaxy.seed]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentGame) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const { cameraX, cameraY, cameraZoom } = ui;

    ctx.clearRect(0, 0, W, H);

    // Deep space background
    ctx.fillStyle = '#00000f';
    ctx.fillRect(0, 0, W, H);

    // Nebulae
    for (const neb of nebulaeRef.current) {
      const { sx, sy } = worldToScreen(neb.x, neb.y, W, H);
      const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, neb.rx * cameraZoom);
      grd.addColorStop(0, neb.color + 'cc');
      grd.addColorStop(1, neb.color + '00');
      ctx.globalAlpha = neb.a;
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(sx, sy, neb.rx * cameraZoom, neb.ry * cameraZoom, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Background stars
    for (const s of bgStarsRef.current) {
      const { sx, sy } = worldToScreen(s.x, s.y, W, H);
      if (sx < -2 || sx > W + 2 || sy < -2 || sy > H + 2) continue;
      ctx.globalAlpha = s.a;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(sx), Math.round(sy), Math.max(1, Math.round(s.r)), Math.max(1, Math.round(s.r)));
    }
    ctx.globalAlpha = 1;

    const { systems } = currentGame.galaxy;
    const { systemStates, tick } = currentGame;

    // Draw connections
    ctx.lineWidth = 0.5;
    const drawnConns = new Set<string>();
    for (const sys of systems) {
      const { sx: ax, sy: ay } = worldToScreen(sys.x, sys.y, W, H);
      for (const connId of sys.connections) {
        const key = [sys.id, connId].sort().join('-');
        if (drawnConns.has(key)) continue;
        drawnConns.add(key);

        const conn = systems.find(s => s.id === connId);
        if (!conn) continue;
        const { sx: bx, sy: by } = worldToScreen(conn.x, conn.y, W, H);

        // Color connection by whether both ends are owned by same empire
        const aOwner = systemStates[sys.id]?.ownerId;
        const bOwner = systemStates[connId]?.ownerId;
        const myId = empires.find(e => e.playerId === user?.uid)?.id;
        const isMyRoute = aOwner === myId && bOwner === myId;

        ctx.globalAlpha = isMyRoute ? 0.5 : 0.15;
        ctx.strokeStyle = isMyRoute
          ? (empires.find(e => e.id === myId)?.color ?? '#4488ff')
          : '#334466';
        ctx.setLineDash(isMyRoute ? [] : [3, 6]);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.globalAlpha = 1;

    // Draw systems
    for (const sys of systems) {
      const { sx, sy } = worldToScreen(sys.x, sys.y, W, H);
      if (sx < -30 || sx > W + 30 || sy < -30 || sy > H + 30) continue;

      const state = systemStates[sys.id];
      const owner = state?.ownerId ? empires.find(e => e.id === state.ownerId) : null;
      const myEmpire = empires.find(e => e.playerId === user?.uid);
      const surveyed = myEmpire?.surveyedSystems.includes(sys.id) ?? false;
      const isSelected = ui.selectedSystemId === sys.id;
      const isHovered  = ui.hoverSystemId === sys.id;

      const primaryStar = sys.stars[0];
      const starCfg = STAR_CONFIG[primaryStar?.type ?? 'yellow'];
      const baseR = Math.max(3, starCfg.baseRadius * 0.22 * cameraZoom);

      // Undiscovered fog
      if (!surveyed && !owner) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#334455';
        ctx.beginPath();
        ctx.arc(sx, sy, baseR, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        if (cameraZoom > 0.7) {
          ctx.globalAlpha = 0.25;
          ctx.fillStyle = '#556677';
          ctx.font = `${Math.max(8, 9 * cameraZoom)}px 'Share Tech Mono'`;
          ctx.textAlign = 'center';
          ctx.fillText('???', sx, sy + baseR + 12);
          ctx.globalAlpha = 1;
        }
        continue;
      }

      const color = owner ? owner.color : '#7a9ab0';

      // Selection ring
      if (isSelected) {
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.8 + Math.sin(Date.now() / 300) * 0.2;
        ctx.beginPath();
        ctx.arc(sx, sy, baseR * 2 + 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Glow
      const glowR = baseR * 3;
      const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
      grd.addColorStop(0, starCfg.glowColor + 'aa');
      grd.addColorStop(0.4, color + '44');
      grd.addColorStop(1, 'transparent');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
      ctx.fill();

      // Star disc
      ctx.fillStyle = starCfg.color;
      ctx.beginPath();
      ctx.arc(sx, sy, baseR, 0, Math.PI * 2);
      ctx.fill();

      // Owner ring
      if (owner) {
        ctx.strokeStyle = owner.color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(sx, sy, baseR + 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Hover ring
      if (isHovered && !isSelected) {
        ctx.strokeStyle = '#ffffff44';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sx, sy, baseR * 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      // System label
      if (cameraZoom > 0.5 || isSelected || isHovered) {
        const fontSize = Math.max(8, Math.min(11, 9 * cameraZoom));
        ctx.font = `${fontSize}px 'Share Tech Mono'`;
        ctx.textAlign = 'center';
        ctx.fillStyle = isSelected ? '#00ffff' : (owner ? owner.color : '#8899aa');
        ctx.globalAlpha = isSelected ? 1 : 0.8;
        ctx.fillText(sys.name, sx, sy + baseR + 14);
        ctx.globalAlpha = 1;
      }

      // Planet count dots
      if (cameraZoom > 0.8 && sys.planets.length > 0) {
        for (let i = 0; i < sys.planets.length; i++) {
          ctx.fillStyle = '#446688';
          ctx.beginPath();
          ctx.arc(sx - (sys.planets.length - 1) * 3 + i * 6, sy + baseR + 4, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    animRef.current = requestAnimationFrame(draw);
  }, [currentGame, empires, ui, user?.uid, worldToScreen]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  // Resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // Mouse events
  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, camX: ui.cameraX, camY: ui.cameraY };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (dragRef.current) {
      const dx = (e.clientX - dragRef.current.x) / ui.cameraZoom;
      const dy = (e.clientY - dragRef.current.y) / ui.cameraZoom;
      setCamera(dragRef.current.camX - dx, dragRef.current.camY - dy, ui.cameraZoom);
      return;
    }

    // Hover detection
    if (!currentGame) return;
    const { wx, wy } = screenToWorld(mx, my, canvas.width, canvas.height);
    let hovered: string | null = null;
    for (const sys of currentGame.galaxy.systems) {
      const dx = sys.x - wx;
      const dy = sys.y - wy;
      if (Math.sqrt(dx * dx + dy * dy) < 20 / ui.cameraZoom) {
        hovered = sys.id;
        break;
      }
    }
    setHoverSystem(hovered);
    canvas.style.cursor = hovered ? 'pointer' : 'grab';
  };

  const onMouseUp = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || !currentGame) { dragRef.current = null; return; }

    const moved = dragRef.current
      ? Math.abs(e.clientX - dragRef.current.x) + Math.abs(e.clientY - dragRef.current.y) > 4
      : false;

    dragRef.current = null;
    if (moved) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const { wx, wy } = screenToWorld(mx, my, canvas.width, canvas.height);

    for (const sys of currentGame.galaxy.systems) {
      const dx = sys.x - wx;
      const dy = sys.y - wy;
      if (Math.sqrt(dx * dx + dy * dy) < 20 / ui.cameraZoom) {
        selectSystem(sys.id);
        return;
      }
    }
    selectSystem(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.85 : 1.15;
    const newZoom = Math.max(0.2, Math.min(4, ui.cameraZoom * factor));
    setCamera(ui.cameraX, ui.cameraY, newZoom);
  };

  const onMouseLeave = () => {
    dragRef.current = null;
    setHoverSystem(null);
  };

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full cursor-grab active:cursor-grabbing"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onWheel={onWheel}
    />
  );
}
