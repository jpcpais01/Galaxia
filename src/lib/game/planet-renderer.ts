import type { PlanetType } from '@/types/game';
import { fbm, fbmRidge } from '@/lib/noise';
import { PLANET_CONFIG } from './constants';

const RENDER_SIZE = 64;
const cache = new Map<string, ImageBitmap>();

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function lerpColor(c1: [number, number, number], c2: [number, number, number], t: number): [number, number, number] {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

function getTerrainColor(
  height: number, ridge: number, lat: number,
  type: PlanetType
): [number, number, number] {
  const cfg = PLANET_CONFIG[type];
  const ground = hexToRgb(cfg.groundColor);
  const water  = hexToRgb(cfg.waterColor);
  const cloud  = hexToRgb(cfg.cloudColor);

  const waterLevel = type === 'ocean' ? 0.7
    : type === 'deep_ocean' ? 0.85
    : type === 'barren' || type === 'molten' || type === 'irradiated' ? 0.15
    : type === 'gas_giant' || type === 'ice_giant' || type === 'storm' ? 1.0
    : 0.45;

  if (type === 'gas_giant' || type === 'storm' || type === 'ice_giant') {
    // Banded gas giant: use ridge noise for bands
    const band = Math.sin(lat * 8 + ridge * 3) * 0.5 + 0.5;
    const bandColor = lerpColor(ground, cloud, band);
    const darkening = lerpColor(bandColor, water, ridge * 0.4);
    return darkening;
  }

  if (height < waterLevel) {
    const depth = (waterLevel - height) / waterLevel;
    return lerpColor(water, lerpColor(water, [0, 0, 0], 0.3), depth * 0.6);
  }

  const landT = (height - waterLevel) / (1 - waterLevel);
  let terrainColor = lerpColor(ground, lerpColor(ground, cloud, 0.4), landT);

  // Polar ice caps
  const pole = Math.abs(lat - 0.5) * 2;
  if (pole > 0.75 && (type !== 'volcanic' && type !== 'molten' && type !== 'toxic')) {
    const iceT = (pole - 0.75) / 0.25;
    terrainColor = lerpColor(terrainColor, hexToRgb('#ffffff'), iceT * 0.8);
  }

  // Cloud-like white spots at ridges
  if (ridge > 0.75 && type !== 'barren' && type !== 'desert' && type !== 'molten') {
    const cloudT = (ridge - 0.75) / 0.25;
    terrainColor = lerpColor(terrainColor, cloud, cloudT * 0.5);
  }

  return terrainColor;
}

function renderPlanetTexture(type: PlanetType, seed: number): ImageData {
  const size = RENDER_SIZE;
  const data = new Uint8ClampedArray(size * size * 4);
  const s = seed * 0.01;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const nx = px / size;
      const ny = py / size;

      // Check if inside the disc
      const cx = nx - 0.5;
      const cy = ny - 0.5;
      const dist = Math.sqrt(cx * cx + cy * cy);
      if (dist > 0.5) {
        const i = (py * size + px) * 4;
        data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
        continue;
      }

      // Sphere mapping
      const u = Math.asin(Math.max(-1, Math.min(1, cx * 2))) / Math.PI + 0.5;
      const v = Math.asin(Math.max(-1, Math.min(1, cy * 2))) / Math.PI + 0.5;

      const height = fbm(u * 3 + s, v * 3 + s * 1.7, seed, 6);
      const ridge  = fbmRidge(u * 4 + s * 2, v * 4 + s * 0.5, seed + 500, 5);

      const [r, g, b] = getTerrainColor(height, ridge, v, type);

      // Edge darkening (limb darkening)
      const limb = 1 - dist * 2;
      const limbFactor = 0.5 + limb * 0.5;

      // Specular highlight (upper-left)
      const hx = cx + 0.15;
      const hy = cy + 0.15;
      const specDist = Math.sqrt(hx * hx + hy * hy);
      const spec = Math.max(0, 1 - specDist * 6) * 0.25;

      const i = (py * size + px) * 4;
      data[i]     = Math.min(255, Math.round(r * limbFactor + spec * 255));
      data[i + 1] = Math.min(255, Math.round(g * limbFactor + spec * 255));
      data[i + 2] = Math.min(255, Math.round(b * limbFactor + spec * 255));
      data[i + 3] = 255;
    }
  }

  return new ImageData(data, size, size);
}

export async function getPlanetBitmap(type: PlanetType, seed: number): Promise<ImageBitmap> {
  const key = `${type}_${seed}`;
  if (cache.has(key)) return cache.get(key)!;

  const imageData = renderPlanetTexture(type, seed);
  const bitmap = await createImageBitmap(imageData);
  cache.set(key, bitmap);
  return bitmap;
}

export function renderPlanetSync(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, type: PlanetType, seed: number, cx: number, cy: number, radius: number): void {
  const key = `${type}_${seed}`;
  const cached = cache.get(key);

  if (cached) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cached, cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();

    // Atmosphere glow
    const cfg = PLANET_CONFIG[type];
    const atmoColor = cfg.cloudColor;
    const grd = ctx.createRadialGradient(cx, cy, radius * 0.9, cx, cy, radius * 1.15);
    grd.addColorStop(0, atmoColor + '44');
    grd.addColorStop(1, atmoColor + '00');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.15, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Fallback: plain circle
    const cfg = PLANET_CONFIG[type];
    ctx.fillStyle = cfg.groundColor;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Queue async render
    getPlanetBitmap(type, seed).then(() => {});
  }
}

// Warm the cache one planet per animation frame so the main thread is never blocked
export function preloadPlanets(entries: { type: PlanetType; seed: number }[]): void {
  let i = 0;
  const step = () => {
    if (i >= entries.length) return;
    const { type, seed } = entries[i++];
    getPlanetBitmap(type, seed);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
