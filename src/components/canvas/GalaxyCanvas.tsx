'use client';
import { useRef, useEffect, useCallback } from 'react';
import { useGameStore } from '@/store/game-store';
import { useAuthStore } from '@/store/auth-store';
import { STAR_CONFIG } from '@/lib/game/constants';
import { SeededRandom } from '@/lib/noise';

/* ─── Types ──────────────────────────────────────────────────────── */
interface BgStar { x: number; y: number; r: number; a: number; phase: number; }
interface Nebula  { x: number; y: number; rx: number; ry: number; rot: number; c1: string; c2: string; a: number; }

/* ─── Galaxy world-space constants ───────────────────────────────── */
const GCX = 2000; // galaxy center X  (GALAXY_WIDTH  / 2)
const GCY = 2000; // galaxy center Y  (GALAXY_HEIGHT / 2)
const GR  = 1850; // galaxy radius  (GALAXY_WIDTH/2 - 150)

/* ─── Scene generators ───────────────────────────────────────────── */
// Background stars use normalised [0,1] screen-space coordinates so they
// always fill the entire canvas regardless of camera pan / zoom.
function makeBgStars(seed: number): BgStar[][] {
  const rng = new SeededRandom(seed + 7777);
  return [800, 160, 30].map((n, l) =>
    Array.from({ length: n }, () => ({
      x:     rng.range(0, 1),   // normalised screen-space
      y:     rng.range(0, 1),
      r:     [0.5, 1, 2.5][l],
      a:     l === 0 ? rng.range(0.08, 0.35)
           : l === 1 ? rng.range(0.3,  0.65)
                     : rng.range(0.7,  1.0),
      phase: rng.range(0, Math.PI * 2),
    }))
  );
}

const NEBULA_PAIRS: [string, string][] = [
  ['#18003a', '#5020a0'],   // purple
  ['#00112e', '#003688'],   // royal blue
  ['#001c1e', '#004a58'],   // deep cyan
  ['#260010', '#6a0038'],   // magenta
  ['#160600', '#4a2000'],   // amber
  ['#001222', '#003c64'],   // cobalt
  ['#081400', '#204400'],   // dark green
  ['#14000e', '#480038'],   // violet
];

function makeNebulae(seed: number, w: number, h: number): Nebula[] {
  const rng = new SeededRandom(seed + 5555);
  const cx = w / 2, cy = h / 2;
  const centerExclude = 760; // keep nebulae away from galactic core (scaled 2×)
  const result: Nebula[] = [];
  let attempts = 0;
  while (result.length < 6 && attempts < 200) {
    attempts++;
    const x = rng.range(w * 0.05, w * 0.95);
    const y = rng.range(h * 0.05, h * 0.95);
    const dx = x - cx, dy = y - cy;
    if (Math.sqrt(dx * dx + dy * dy) < centerExclude) continue;
    const [c1, c2] = rng.pick(NEBULA_PAIRS);
    const big = result.length < 2;
    result.push({
      x, y,
      rx:  rng.range(big ? 480 : 160, big ? 880 : 420),
      ry:  rng.range(big ? 320 : 100, big ? 600 : 300),
      rot: rng.range(0, Math.PI),
      c1, c2,
      a:   rng.range(0.25, 0.48),
    });
  }
  return result;
}

/* ─── Component ──────────────────────────────────────────────────── */
export default function GalaxyCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);
  const dragRef   = useRef<{ x: number; y: number; camX: number; camY: number } | null>(null);
  const bgRef     = useRef<BgStar[][]>([[], [], []]);
  const nebRef    = useRef<Nebula[]>([]);

  const { currentGame, empires, ui, selectSystem, setCamera, setHoverSystem } = useGameStore();
  const { user } = useAuthStore();

  /* World ↔ screen conversions */
  const w2s = useCallback((wx: number, wy: number, W: number, H: number) => ({
    sx: (wx - ui.cameraX) * ui.cameraZoom + W / 2,
    sy: (wy - ui.cameraY) * ui.cameraZoom + H / 2,
  }), [ui.cameraX, ui.cameraY, ui.cameraZoom]);

  const s2w = useCallback((sx: number, sy: number, W: number, H: number) => ({
    wx: (sx - W / 2) / ui.cameraZoom + ui.cameraX,
    wy: (sy - H / 2) / ui.cameraZoom + ui.cameraY,
  }), [ui.cameraX, ui.cameraY, ui.cameraZoom]);

  /* Regenerate static scene data when seed changes */
  useEffect(() => {
    if (!currentGame) return;
    const { seed, width: W, height: H } = currentGame.galaxy;
    bgRef.current  = makeBgStars(seed);     // screen-space, no dimensions needed
    nebRef.current = makeNebulae(seed, W, H);
  }, [currentGame?.galaxy.seed]);

  /* ══════════════════════════ RENDER LOOP ══════════════════════════ */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentGame) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const CW = canvas.width;
    const CH = canvas.height;
    const Z  = ui.cameraZoom;
    const t  = Date.now();

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, CW, CH);

    /* ── 1. Deep-space background gradient ─────────────────────── */
    const bg = ctx.createRadialGradient(CW / 2, CH / 2, 0, CW / 2, CH / 2, Math.hypot(CW, CH) * 0.65);
    bg.addColorStop(0,    '#0a0a1c');
    bg.addColorStop(0.55, '#050510');
    bg.addColorStop(1,    '#010107');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CW, CH);

    /* ── 2. Galaxy core glow — bright orange-white blob at center ── */
    {
      const { sx: gcx, sy: gcy } = w2s(GCX, GCY, CW, CH);

      // Inner intense hot core (tight orange-white nucleus)
      const innerR = GR * 0.28 * Z;
      const inner  = ctx.createRadialGradient(gcx, gcy, 0, gcx, gcy, innerR);
      inner.addColorStop(0,    'rgba(255, 252, 230, 0.72)');  // near-white hot centre
      inner.addColorStop(0.08, 'rgba(255, 240, 180, 0.55)');
      inner.addColorStop(0.22, 'rgba(255, 200, 80,  0.38)');
      inner.addColorStop(0.50, 'rgba(255, 140, 30,  0.18)');
      inner.addColorStop(0.80, 'rgba(200, 80,  10,  0.07)');
      inner.addColorStop(1,    'transparent');
      ctx.fillStyle = inner;
      ctx.beginPath();
      ctx.arc(gcx, gcy, innerR, 0, Math.PI * 2);
      ctx.fill();

      // Outer diffuse halo that fades to galaxy radius
      const outerR = GR * 1.1 * Z;
      const outer  = ctx.createRadialGradient(gcx, gcy, innerR * 0.4, gcx, gcy, outerR);
      outer.addColorStop(0,    'rgba(255, 160, 40,  0.12)');
      outer.addColorStop(0.30, 'rgba(200, 100, 20,  0.06)');
      outer.addColorStop(0.65, 'rgba(120,  50, 10,  0.03)');
      outer.addColorStop(1,    'transparent');
      ctx.fillStyle = outer;
      ctx.beginPath();
      ctx.arc(gcx, gcy, outerR, 0, Math.PI * 2);
      ctx.fill();
    }

    /* ── 3. Nebulae (colourful elliptical clouds) ─────────────────── */
    for (const neb of nebRef.current) {
      const { sx, sy } = w2s(neb.x, neb.y, CW, CH);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(neb.rot);
      const rx = neb.rx * Z;
      const ry = neb.ry * Z;
      const g  = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0,    neb.c2 + 'ee');
      g.addColorStop(0.3,  neb.c2 + '99');
      g.addColorStop(0.6,  neb.c1 + '55');
      g.addColorStop(1,    neb.c1 + '00');
      ctx.globalAlpha = neb.a;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    /* ── 4. Three-layer starfield (screen-space — always fills canvas) */
    const layerColors = ['#7788bb', '#99aadd', '#ffffff'];
    for (let l = 0; l < 3; l++) {
      for (const s of bgRef.current[l] ?? []) {
        // s.x / s.y are normalised [0,1] — scale to current canvas size
        const sx = s.x * CW;
        const sy = s.y * CH;
        const tw = l === 2 ? 0.5 + Math.sin(t / 850 + s.phase) * 0.5 : 1;
        ctx.globalAlpha = s.a * tw;
        ctx.fillStyle = layerColors[l];
        const pr = Math.max(1, Math.round(s.r));
        ctx.fillRect(Math.round(sx), Math.round(sy), pr, pr);
      }
    }
    ctx.globalAlpha = 1;

    const { systems } = currentGame.galaxy;
    const { systemStates } = currentGame;
    const myEmpire = empires.find(e => e.playerId === user?.uid);
    const myId     = myEmpire?.id;
    const flowOff  = (t / 72) % 18;

    /* ── 5. Territory soft glow behind each owned system ──────── */
    for (const sys of systems) {
      const st = systemStates[sys.id];
      if (!st?.ownerId) continue;
      const owner = empires.find(e => e.id === st.ownerId);
      if (!owner) continue;
      const { sx, sy } = w2s(sys.x, sys.y, CW, CH);
      const r = 72 * Z;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0,   owner.color + '20');
      g.addColorStop(0.5, owner.color + '0d');
      g.addColorStop(1,   'transparent');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    /* ── 6. Hyperlanes ─────────────────────────────────────────── */
    const drawn = new Set<string>();
    for (const sys of systems) {
      const { sx: ax, sy: ay } = w2s(sys.x, sys.y, CW, CH);
      for (const cid of sys.connections) {
        const key = sys.id < cid ? `${sys.id}|${cid}` : `${cid}|${sys.id}`;
        if (drawn.has(key)) continue;
        drawn.add(key);

        const conn = systems.find(s => s.id === cid);
        if (!conn) continue;
        const { sx: bx, sy: by } = w2s(conn.x, conn.y, CW, CH);

        const aOwn  = systemStates[sys.id]?.ownerId;
        const bOwn  = systemStates[cid]?.ownerId;
        const aSurv = myEmpire?.surveyedSystems.includes(sys.id) ?? false;
        const bSurv = myEmpire?.surveyedSystems.includes(cid)    ?? false;
        const vis   = (aSurv || !!aOwn) && (bSurv || !!bOwn);
        const mine  = aOwn === myId && bOwn === myId;
        const allied = !!aOwn && aOwn === bOwn && !mine;

        if (!vis) {
          ctx.strokeStyle = '#0d1533'; ctx.lineWidth = 0.4;
          ctx.globalAlpha = 0.07; ctx.setLineDash([1, 9]);
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
          ctx.setLineDash([]);
          continue;
        }

        if (mine) {
          const col = empires.find(e => e.id === myId)?.color ?? '#4488ff';
          // Wide soft glow
          ctx.strokeStyle = col; ctx.lineWidth = 4;
          ctx.globalAlpha = 0.08; ctx.setLineDash([]);
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
          // Solid lane
          ctx.strokeStyle = col; ctx.lineWidth = 1.2;
          ctx.globalAlpha = 0.5; ctx.setLineDash([]);
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
          // Animated data-flow dots
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
          ctx.globalAlpha = 0.32; ctx.setLineDash([2, 16]);
          ctx.lineDashOffset = -flowOff;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
          ctx.lineDashOffset = 0;
        } else if (allied) {
          const col = empires.find(e => e.id === aOwn)?.color ?? '#ff8844';
          ctx.strokeStyle = col; ctx.lineWidth = 1;
          ctx.globalAlpha = 0.28; ctx.setLineDash([4, 5]);
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        } else {
          ctx.strokeStyle = '#243558'; ctx.lineWidth = 0.6;
          ctx.globalAlpha = 0.2; ctx.setLineDash([3, 7]);
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    }
    ctx.globalAlpha = 1;

    /* ── 7. Star systems ───────────────────────────────────────── */
    for (const sys of systems) {
      const { sx, sy } = w2s(sys.x, sys.y, CW, CH);
      if (sx < -60 || sx > CW + 60 || sy < -60 || sy > CH + 60) continue;

      const st    = systemStates[sys.id];
      const owner = st?.ownerId ? empires.find(e => e.id === st.ownerId) : null;
      const surv  = myEmpire?.surveyedSystems.includes(sys.id) ?? false;
      const isSel = ui.selectedSystemId === sys.id;
      const isHov = ui.hoverSystemId   === sys.id;

      const isBlackHole = !!(sys.isBlackHole);
      const starType = sys.stars[0]?.type ?? 'yellow';
      const starCfg = STAR_CONFIG[starType] ?? STAR_CONFIG['yellow'];
      const baseR   = Math.max(3, Math.round(starCfg.baseRadius * 0.22 * Z));
      const px      = Math.round(sx);
      const py      = Math.round(sy);

      // Undiscovered systems render at 10% opacity — same visuals, just faded
      const AS = (!surv && !owner) ? 0.1 : 1.0;

      /* Outer star glow (soft radial) */
      const glowR = baseR * 4.2;
      const glow  = ctx.createRadialGradient(px, py, 0, px, py, glowR);
      glow.addColorStop(0,   starCfg.glowColor + 'cc');
      glow.addColorStop(0.2, starCfg.glowColor + '55');
      glow.addColorStop(0.6, starCfg.glowColor + '18');
      glow.addColorStop(1,   'transparent');
      ctx.globalAlpha = 0.9 * AS;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px, py, glowR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = AS;

      /* Hexagonal territory ring (owned) */
      if (owner && Z > 0.42) {
        const hexR = Math.round(baseR * 4);
        ctx.strokeStyle = owner.color;
        ctx.lineWidth   = 1;
        ctx.globalAlpha = 0.24 * AS;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2 - Math.PI / 6;
          const hx = px + Math.round(Math.cos(angle) * hexR);
          const hy = py + Math.round(Math.sin(angle) * hexR);
          if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = AS;
      }

      /* Owner colour band (glowing gradient ring) */
      if (owner) {
        const rr   = baseR + 3.5;
        const ring = ctx.createRadialGradient(px, py, rr - 2.5, px, py, rr + 3);
        ring.addColorStop(0,    owner.color + '00');
        ring.addColorStop(0.45, owner.color + 'cc');
        ring.addColorStop(1,    owner.color + '00');
        ctx.fillStyle = ring;
        ctx.beginPath();
        ctx.arc(px, py, rr + 3, 0, Math.PI * 2);
        ctx.fill();
      }

      /* Hover dashed ring */
      if (isHov && !isSel) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 1;
        ctx.globalAlpha = 0.22 * AS;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.arc(px, py, baseR * 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = AS;
      }

      /* Selection corner brackets (animated pulse) */
      if (isSel) {
        const s   = baseR + 10;
        const len = Math.max(5, Math.round(s * 0.48));
        const pul = 0.72 + Math.sin(t / 220) * 0.28;
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth   = 2;
        ctx.globalAlpha = pul * AS;
        ctx.setLineDash([]);
        // Top-left
        ctx.beginPath(); ctx.moveTo(px - s, py - s + len); ctx.lineTo(px - s, py - s); ctx.lineTo(px - s + len, py - s); ctx.stroke();
        // Top-right
        ctx.beginPath(); ctx.moveTo(px + s - len, py - s); ctx.lineTo(px + s, py - s); ctx.lineTo(px + s, py - s + len); ctx.stroke();
        // Bottom-right
        ctx.beginPath(); ctx.moveTo(px + s, py + s - len); ctx.lineTo(px + s, py + s); ctx.lineTo(px + s - len, py + s); ctx.stroke();
        // Bottom-left
        ctx.beginPath(); ctx.moveTo(px - s + len, py + s); ctx.lineTo(px - s, py + s); ctx.lineTo(px - s, py + s - len); ctx.stroke();
        ctx.globalAlpha = 1;

        // Inner scan ring (rotates slowly)
        const scanAngle = (t / 1200) % (Math.PI * 2);
        ctx.strokeStyle = '#00ffff44';
        ctx.lineWidth   = 1;
        ctx.globalAlpha = 0.5 * AS;
        ctx.setLineDash([4, 8]);
        ctx.lineDashOffset = -((t / 40) % 12);
        ctx.beginPath();
        ctx.arc(px, py, baseR * 2.2, scanAngle, scanAngle + Math.PI * 1.5);
        ctx.stroke();
        ctx.lineDashOffset = 0;
        ctx.setLineDash([]);
        ctx.globalAlpha = AS;
      }

      /* ── Star body (normal or black hole) ── */
      if (isBlackHole) {
        /* ─ Black hole: accretion disk + event horizon ─ */
        const diskR = Math.max(14, baseR * 4.5);

        // Outer accretion disk glow
        ctx.save();
        ctx.translate(px, py);
        const diskRot = (t / 4000) % (Math.PI * 2);
        ctx.rotate(diskRot);
        const diskGlow = ctx.createRadialGradient(0, 0, baseR * 0.6, 0, 0, diskR);
        diskGlow.addColorStop(0,    'rgba(255,80,0,0.9)');
        diskGlow.addColorStop(0.25, 'rgba(200,40,0,0.6)');
        diskGlow.addColorStop(0.55, 'rgba(120,10,0,0.3)');
        diskGlow.addColorStop(1,    'transparent');
        ctx.globalAlpha = 0.85 * AS;
        ctx.fillStyle = diskGlow;
        ctx.beginPath();
        ctx.ellipse(0, 0, diskR, diskR * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Jet / lensing ring
        const ringR = baseR * 2.8;
        const ring  = ctx.createRadialGradient(px, py, ringR - 2, px, py, ringR + 4);
        ring.addColorStop(0,   'rgba(255,100,30,0)');
        ring.addColorStop(0.45,'rgba(255,120,30,0.55)');
        ring.addColorStop(1,   'rgba(255,100,30,0)');
        ctx.globalAlpha = 0.6 * AS;
        ctx.fillStyle = ring;
        ctx.beginPath();
        ctx.arc(px, py, ringR + 4, 0, Math.PI * 2);
        ctx.fill();

        // Event horizon (dark circle — absorbs everything)
        ctx.globalAlpha = AS;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(px, py, baseR * 1.1, 0, Math.PI * 2);
        ctx.fill();

        // Faint blue photon ring around horizon
        ctx.strokeStyle = '#4488ff';
        ctx.lineWidth   = 1;
        ctx.globalAlpha = 0.35 * AS;
        ctx.beginPath();
        ctx.arc(px, py, baseR * 1.25, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = AS;

      } else {
        /* ─ Normal pixel-art star body ─ */
        const pr = Math.max(2, Math.round(baseR));
        ctx.fillStyle   = starCfg.color;
        ctx.globalAlpha = AS;
        ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);

        // 4-point pixel cross spikes
        if (baseR >= 3) {
          const sl = Math.round(pr * 2.6);
          const sw = Math.max(1, Math.round(pr * 0.38));
          ctx.globalAlpha = 0.82 * AS;
          ctx.fillRect(px - sl, py - sw, sl * 2, sw * 2);
          ctx.fillRect(px - sw, py - sl, sw * 2, sl * 2);
        }

        // Diagonal secondary spikes
        if (baseR >= 5) {
          const dl = Math.round(pr * 1.6);
          ctx.globalAlpha = 0.35 * AS;
          ctx.fillRect(px - dl, py - dl, 2, 2);
          ctx.fillRect(px + dl - 1, py - dl, 2, 2);
          ctx.fillRect(px - dl, py + dl - 1, 2, 2);
          ctx.fillRect(px + dl - 1, py + dl - 1, 2, 2);
        }

        // Bright hot centre pixel
        ctx.fillStyle   = '#ffffff';
        ctx.globalAlpha = 0.95 * AS;
        ctx.fillRect(px - 1, py - 1, 2, 2);
        ctx.globalAlpha = AS;
      }

      /* ── System label ── */
      if (Z > 0.44 || isSel || isHov) {
        const fs    = Math.max(8, Math.min(11, 9 * Z));
        const label = surv || owner ? sys.name : '???';
        ctx.font      = `${fs}px 'Share Tech Mono'`;
        ctx.textAlign = 'center';
        // Drop shadow
        ctx.fillStyle   = '#00000099';
        ctx.globalAlpha = 0.65 * AS;
        ctx.fillText(label, sx + 1, sy + baseR + 16);
        // Main label
        ctx.fillStyle   = isSel ? '#00ffff' : owner ? owner.color : surv ? '#7a9ab8' : '#4a6a7a';
        ctx.globalAlpha = (isSel ? 1 : 0.88) * AS;
        ctx.fillText(label, sx, sy + baseR + 15);
        ctx.globalAlpha = AS;
      }

      /* ── Planet count dots ── */
      if (Z > 0.6 && sys.planets.length > 0) {
        const spacing = 5;
        const totalW  = (sys.planets.length - 1) * spacing;
        for (let i = 0; i < sys.planets.length; i++) {
          const dx = Math.round(sx - totalW / 2 + i * spacing);
          const dy = Math.round(sy + baseR + 6);
          ctx.fillStyle   = surv ? '#4a6a9a' : '#2a3855';
          ctx.globalAlpha = 0.72 * AS;
          ctx.fillRect(dx, dy, 2, 2);
        }
        ctx.globalAlpha = AS;
      }

      /* ── Station pixel icon (small satellite shape) ── */
      if (st?.stationId && Z > 0.48) {
        const ix  = px + baseR + 6;
        const iy  = py - baseR - 5;
        const col = owner?.color ?? '#88aaff';
        ctx.fillStyle   = col;
        ctx.globalAlpha = 0.88 * AS;
        // 5-pixel diamond
        ctx.fillRect(ix,     iy - 2, 1, 1);
        ctx.fillRect(ix - 1, iy - 1, 3, 1);
        ctx.fillRect(ix - 2, iy,     5, 1);
        ctx.fillRect(ix - 1, iy + 1, 3, 1);
        ctx.fillRect(ix,     iy + 2, 1, 1);
        // Tiny horizontal antenna arms
        ctx.fillRect(ix - 3, iy, 1, 1);
        ctx.fillRect(ix + 3, iy, 1, 1);
      }
      // Always reset alpha after each star system
      ctx.globalAlpha = 1;
    }

    /* ── 8. Screen-space vignette (corners/edges darken) ──────── */
    const vig = ctx.createRadialGradient(
      CW / 2, CH / 2, Math.min(CW, CH) * 0.28,
      CW / 2, CH / 2, Math.hypot(CW, CH) * 0.58,
    );
    vig.addColorStop(0, 'transparent');
    vig.addColorStop(1, '#000009cc');
    ctx.fillStyle   = vig;
    ctx.globalAlpha = 0.72;
    ctx.fillRect(0, 0, CW, CH);
    ctx.globalAlpha = 1;

    animRef.current = requestAnimationFrame(draw);
  }, [currentGame, empires, ui, user?.uid, w2s]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  /* ─── Resize observer ────────────────────────────────────────── */
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const resize = () => { c.width = c.offsetWidth; c.height = c.offsetHeight; };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  /* ─── Mouse / wheel ──────────────────────────────────────────── */
  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, camX: ui.cameraX, camY: ui.cameraY };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const c = canvasRef.current;
    if (!c) return;

    if (dragRef.current) {
      const dx = (e.clientX - dragRef.current.x) / ui.cameraZoom;
      const dy = (e.clientY - dragRef.current.y) / ui.cameraZoom;
      setCamera(dragRef.current.camX - dx, dragRef.current.camY - dy, ui.cameraZoom);
      return;
    }

    if (!currentGame) return;
    const rect = c.getBoundingClientRect();
    const { wx, wy } = s2w(e.clientX - rect.left, e.clientY - rect.top, c.width, c.height);
    const hitR2 = (22 / ui.cameraZoom) ** 2;
    let hov: string | null = null;
    for (const sys of currentGame.galaxy.systems) {
      const dx = sys.x - wx, dy = sys.y - wy;
      if (dx * dx + dy * dy < hitR2) { hov = sys.id; break; }
    }
    setHoverSystem(hov);
    c.style.cursor = hov ? 'pointer' : 'grab';
  };

  const onMouseUp = (e: React.MouseEvent) => {
    const c = canvasRef.current;
    if (!c || !currentGame) { dragRef.current = null; return; }

    const moved = dragRef.current
      ? Math.abs(e.clientX - dragRef.current.x) + Math.abs(e.clientY - dragRef.current.y) > 4
      : false;
    dragRef.current = null;
    if (moved) return;

    const rect   = c.getBoundingClientRect();
    const { wx, wy } = s2w(e.clientX - rect.left, e.clientY - rect.top, c.width, c.height);
    const hitR2  = (22 / ui.cameraZoom) ** 2;
    for (const sys of currentGame.galaxy.systems) {
      const dx = sys.x - wx, dy = sys.y - wy;
      if (dx * dx + dy * dy < hitR2) { selectSystem(sys.id); return; }
    }
    selectSystem(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor  = e.deltaY > 0 ? 0.85 : 1.15;
    const newZoom = Math.max(0.1, Math.min(4, ui.cameraZoom * factor));
    setCamera(ui.cameraX, ui.cameraY, newZoom);
  };

  const onMouseLeave = () => { dragRef.current = null; setHoverSystem(null); };

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
