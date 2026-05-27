export class SeededRandom {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  next(): number {
    this.s = Math.imul(this.s ^ (this.s >>> 16), 0x45d9f3b);
    this.s = Math.imul(this.s ^ (this.s >>> 16), 0x45d9f3b);
    this.s ^= this.s >>> 16;
    return (this.s >>> 0) / 0x100000000;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function hash(ix: number, iy: number, seed: number): number {
  const n = Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.3) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fade(fx);
  const uy = fade(fy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + ux * (b - a) + uy * ((c + ux * (d - c)) - (a + ux * (b - a)));
}

export function fbm(x: number, y: number, seed: number, octaves = 6): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    value += amp * smoothNoise(x * freq, y * freq, seed + i * 1234.5);
    amp *= 0.5;
    freq *= 2.1;
  }
  return Math.max(0, Math.min(1, value));
}

export function fbmRidge(x: number, y: number, seed: number, octaves = 5): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    const n = smoothNoise(x * freq, y * freq, seed + i * 987.6);
    value += amp * (1 - Math.abs(n * 2 - 1));
    amp *= 0.5;
    freq *= 2.1;
  }
  return Math.max(0, Math.min(1, value));
}
