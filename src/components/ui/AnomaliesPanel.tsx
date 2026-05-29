'use client';
import { useGameStore } from '@/store/game-store';
import { ANOMALY_EFFECTS } from '@/lib/game/constants';
import type { Planet, StarSystem, Resources } from '@/types/game';

const RESOURCE_LABELS: Record<string, string> = {
  credits: 'Credits', minerals: 'Minerals', energy: 'Energy',
  research: 'Research', compute: 'Compute', food: 'Food', population: 'Population',
};

function Outcomes({ outcomes }: { outcomes: Partial<Resources> }) {
  const entries = Object.entries(outcomes).filter(([, v]) => typeof v === 'number' && v !== 0);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {entries.map(([k, v]) => (
        <span key={k} className="font-mono text-[8px] px-1 py-0.5 border"
          style={{
            color: (v as number) > 0 ? '#44ff88' : '#ff6666',
            borderColor: (v as number) > 0 ? '#1a3a2a' : '#3a1a1a',
            background: (v as number) > 0 ? '#08160e' : '#160808',
          }}>
          {(v as number) > 0 ? '+' : ''}{v} {RESOURCE_LABELS[k] ?? k}
        </span>
      ))}
    </div>
  );
}

export default function AnomaliesPanel() {
  const { currentGame, myEmpire, anomalies, setPanel, investigateAnomaly, selectSystem, selectPlanet, setView } = useGameStore();
  if (!myEmpire || !currentGame) return null;

  const tick = currentGame.tick;
  const surveyed = new Set(myEmpire.surveyedSystems ?? []);
  const resolved = new Set(myEmpire.resolvedAnomalies ?? []);
  const canAffordInv = (myEmpire.resources.credits ?? 0) >= 720 && (myEmpire.resources.research ?? 0) >= 240;

  // Gather every anomaly we know about (in a surveyed system)
  type Entry = { planet: Planet; system: StarSystem; status: 'available' | 'investigating' | 'done' };
  const entries: Entry[] = [];
  for (const sys of currentGame.galaxy.systems) {
    if (!surveyed.has(sys.id)) continue;
    for (const p of sys.planets) {
      if (!p.hasAnomaly || !p.anomalyType) continue;
      const pending = (myEmpire.pendingInvestigations ?? []).some(pi => pi.planetId === p.id);
      const isDone  = resolved.has(p.id);
      entries.push({ planet: p, system: sys, status: isDone ? 'done' : pending ? 'investigating' : 'available' });
    }
  }

  const order = { available: 0, investigating: 1, done: 2 };
  entries.sort((a, b) => order[a.status] - order[b.status]);

  const available = entries.filter(e => e.status === 'available').length;

  const goTo = (sysId: string, planetId: string) => {
    selectSystem(sysId);
    selectPlanet(planetId);
    setView('system');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header flex items-center justify-between">
        <span>ANOMALIES — {available} ready</span>
        <button onClick={() => setPanel('none')} className="text-[#3a5a6a] hover:text-[#6a8aa0]">✕</button>
      </div>

      <div className="flex-1 scrollable p-2 flex flex-col gap-2">
        {entries.length === 0 && (
          <div className="font-mono text-[10px] text-[#2a3a4a] text-center py-8">
            No anomalies discovered yet.<br />
            <span className="text-[#1a2a3a]">Survey systems to find spatial anomalies.</span>
          </div>
        )}

        {entries.map(({ planet, system, status }) => {
          const pending = (myEmpire.pendingInvestigations ?? []).find(pi => pi.planetId === planet.id);
          const report  = anomalies.find(a => a.planetId === planet.id);
          const typeLabel = planet.anomalyType!.replace(/_/g, ' ');

          return (
            <div key={planet.id} className="pixel-panel p-2 flex flex-col gap-1" style={{ borderColor: '#3a2a10' }}>
              <div className="flex items-center justify-between">
                <span className="font-pixel text-[8px] text-[#ff8800]">★ {typeLabel.toUpperCase()}</span>
                <button onClick={() => goTo(system.id, planet.id)} className="font-mono text-[8px] text-[#44aaff] hover:underline">
                  {planet.name} · {system.name}
                </button>
              </div>

              {status === 'available' && (
                <>
                  <div className="font-mono text-[9px] text-[#8a7a5a]">
                    {ANOMALY_EFFECTS[planet.anomalyType!] ?? 'An unknown phenomenon awaits investigation.'}
                  </div>
                  <button
                    onClick={() => investigateAnomaly(system.id, planet.id)}
                    disabled={!canAffordInv}
                    className="btn-gold w-full py-1 text-[8px] disabled:opacity-40 mt-0.5"
                  >
                    INVESTIGATE <span className="text-[7px] text-[#6a5000]">720c · 240r · 36t</span>
                  </button>
                </>
              )}

              {status === 'investigating' && (
                <div className="font-mono text-[9px] text-[#ffaa00] flex items-center gap-2">
                  <span className="animate-pulse">◐</span> Investigating…
                  <span className="ml-auto text-[#8a7a00]">ETA {Math.max(0, (pending?.completesAtTick ?? tick) - tick)}t</span>
                </div>
              )}
              {status === 'investigating' && report?.status === 'generating' && (
                <div className="font-mono text-[8px] text-[#6a5a3a]">Analyzing signals & rendering imaging…</div>
              )}

              {status === 'done' && report?.status === 'ready' && (
                <>
                  {report.imageDataUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={report.imageDataUrl} alt="anomaly" className="w-full border border-[#3a2a1a]" />
                  )}
                  {report.text && <div className="font-mono text-[9px] text-[#c8b896] leading-relaxed">{report.text}</div>}
                  {report.summary && <div className="font-mono text-[8px] text-[#44ff88]">{report.summary}</div>}
                  {report.outcomes && <Outcomes outcomes={report.outcomes} />}
                </>
              )}
              {status === 'done' && report?.status !== 'ready' && (
                <div className="font-mono text-[9px] text-[#8a7a5a]">Investigation complete.</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
