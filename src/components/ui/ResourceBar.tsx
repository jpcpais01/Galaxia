'use client';
import { useGameStore } from '@/store/game-store';

const RESOURCES = [
  { key: 'energy',     icon: '⚡', label: 'NRG',  color: '#ffee44' },
  { key: 'food',       icon: '🌿', label: 'FOOD', color: '#44ff88' },
  { key: 'minerals',   icon: '⛏',  label: 'MIN',  color: '#aabb88' },
  { key: 'research',   icon: '🔬', label: 'RES',  color: '#8888ff' },
  { key: 'compute',    icon: '💻', label: 'CPU',  color: '#aa44ff' },
  { key: 'credits',    icon: '💱', label: 'CRD',  color: '#ffd700' },
  { key: 'population', icon: '👥', label: 'POP',  color: '#ff8844' },
] as const;

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return Math.floor(n).toString();
}

function fmtRate(n: number): string {
  const s = Math.round(n).toString();
  return n >= 0 ? `+${s}` : s;
}

export default function ResourceBar() {
  const { myEmpire } = useGameStore();
  if (!myEmpire) return null;

  const { resources, resourceRates } = myEmpire;

  return (
    <div className="flex flex-wrap gap-1 px-2 py-1">
      {RESOURCES.map(r => {
        const val  = resources[r.key] ?? 0;
        const rate = resourceRates[r.key] ?? 0;
        const low  = rate < 0 || val < 20;

        return (
          <div
            key={r.key}
            className="resource-chip"
            title={`${r.label}: ${Math.floor(val)} (${fmtRate(rate)}/tick)`}
          >
            <span className="text-xs">{r.icon}</span>
            <span
              className="font-pixel text-[8px]"
              style={{ color: low ? '#ff4455' : r.color }}
            >
              {fmt(val)}
            </span>
            <span
              className="font-mono text-[9px]"
              style={{ color: rate >= 0 ? '#2a5a3a' : '#5a1a1a' }}
            >
              {fmtRate(rate)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
