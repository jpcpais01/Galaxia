'use client';
import { useState } from 'react';
import { useGameStore } from '@/store/game-store';
import { INFRA_CONFIG, GROUND_OP_CONFIG } from '@/lib/game/constants';
import type { Resources } from '@/types/game';

const RESOURCES = [
  { key: 'energy',     icon: '⚡', label: 'NRG',  color: '#ffee44' },
  { key: 'food',       icon: '🌿', label: 'FOOD', color: '#44ff88' },
  { key: 'minerals',   icon: '⛏',  label: 'MIN',  color: '#aabb88' },
  { key: 'research',   icon: '🔬', label: 'RES',  color: '#8888ff' },
  { key: 'compute',    icon: '💻', label: 'CPU',  color: '#aa44ff' },
  { key: 'credits',    icon: '💱', label: 'CRD',  color: '#ffd700' },
  { key: 'population', icon: '👥', label: 'POP',  color: '#ff8844' },
] as const;

const BASE: Partial<Record<keyof Resources, number>> = {
  energy: 5, research: 5, credits: 10,
};

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return Math.floor(n).toString();
}

function fmtRate(n: number): string {
  const s = Math.round(n).toString();
  return n >= 0 ? `+${s}` : s;
}

export default function ResourceBar() {
  const { myEmpire, currentGame } = useGameStore();
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  if (!myEmpire) return null;

  const { resources, resourceRates } = myEmpire;
  const tick = currentGame?.tick ?? 0;

  function getBreakdown(key: keyof Resources): { label: string; value: number }[] {
    const items: { label: string; value: number }[] = [];

    if (BASE[key] !== undefined) {
      items.push({ label: 'Base income', value: BASE[key]! });
    }

    for (const infra of myEmpire!.infrastructure) {
      if (!infra.active) continue;
      const cfg = INFRA_CONFIG[infra.type];
      const val = (cfg.output as Partial<Resources>)[key];
      if (val) items.push({ label: cfg.label, value: val });
    }

    for (const op of (myEmpire!.groundOps ?? [])) {
      if (!op.active) continue;
      const cfg = GROUND_OP_CONFIG[op.type];
      const val = (cfg.output as Partial<Resources>)[key];
      if (val) items.push({ label: cfg.label, value: val });
    }

    for (const stn of myEmpire!.stations) {
      if (stn.buildCompletedTick > tick) continue;
      if (key === 'minerals' && stn.type === 'mining_station')
        items.push({ label: 'Mining Station', value: 10 });
      if (key === 'research' && stn.type === 'research_station')
        items.push({ label: 'Research Station', value: 8 });
    }

    if (key === 'food') {
      const pop = myEmpire!.resources.population;
      if (pop > 0) items.push({ label: 'Pop consumption', value: -Math.ceil(pop * 0.5) });
    }
    if (key === 'energy') {
      const pop = myEmpire!.resources.population;
      if (pop > 0) items.push({ label: 'Pop consumption', value: -Math.ceil(pop * 0.2) });
    }

    return items;
  }

  return (
    <div className="flex flex-wrap gap-1 px-2 py-1">
      {RESOURCES.map(r => {
        const val   = resources[r.key] ?? 0;
        const rate  = resourceRates[r.key] ?? 0;
        const low   = rate < 0 || val < 20;
        const isHov = hoveredKey === r.key;
        const breakdown = isHov ? getBreakdown(r.key as keyof Resources) : [];

        return (
          <div
            key={r.key}
            className="resource-chip relative"
            onMouseEnter={() => setHoveredKey(r.key)}
            onMouseLeave={() => setHoveredKey(null)}
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

            {/* Hover breakdown tooltip */}
            {isHov && breakdown.length > 0 && (
              <div
                className="absolute bottom-full left-1/2 mb-2 z-50 pointer-events-none"
                style={{ transform: 'translateX(-50%)', minWidth: '140px' }}
              >
                <div className="bg-[#040410] border border-[#1a2a4a] font-mono text-[9px] px-2 py-1.5 flex flex-col gap-0.5 shadow-lg">
                  <div className="font-pixel text-[8px] mb-1" style={{ color: r.color }}>
                    {r.label} BREAKDOWN
                  </div>
                  {breakdown.map((item, i) => (
                    <div key={i} className="flex justify-between gap-3">
                      <span className="text-[#4a6a7a] truncate">{item.label}</span>
                      <span style={{ color: item.value >= 0 ? '#44aa66' : '#aa4444' }}>
                        {item.value >= 0 ? '+' : ''}{item.value}
                      </span>
                    </div>
                  ))}
                  <div className="mt-1 pt-1 border-t border-[#1a1a3a] flex justify-between">
                    <span className="text-[#4a6a7a]">Total</span>
                    <span style={{ color: rate >= 0 ? '#44cc88' : '#ff4455' }}>
                      {fmtRate(rate)}/t
                    </span>
                  </div>
                </div>
                {/* Arrow */}
                <div className="flex justify-center">
                  <div style={{
                    width: 0, height: 0,
                    borderLeft: '5px solid transparent',
                    borderRight: '5px solid transparent',
                    borderTop: '5px solid #1a2a4a',
                  }} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
