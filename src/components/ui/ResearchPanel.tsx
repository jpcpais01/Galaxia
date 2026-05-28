'use client';
import { useGameStore } from '@/store/game-store';
import { RESEARCH_BY_PATH } from '@/lib/game/research-tree';
import { PixelIcon } from '@/components/ui/PixelIcon';
import type { ResearchPath } from '@/types/game';

const PATH_CONFIG: Record<ResearchPath, { label: string; color: string; icon: string }> = {
  physics:     { label: 'Physics',               color: '#4488ff', icon: 'fusion_plant' },
  biology:     { label: 'Biology',               color: '#44cc44', icon: 'hydroponic_farm' },
  engineering: { label: 'Engineering',           color: '#ff8844', icon: 'industrious' },
  ai:          { label: 'Artificial Intelligence', color: '#aa44ff', icon: 'ai_datacenter' },
};

const PATHS = Object.keys(PATH_CONFIG) as ResearchPath[];

export default function ResearchPanel() {
  const { myEmpire, setPanel, startResearch } = useGameStore();
  if (!myEmpire) return null;

  const { completedResearch, researchQueue, researchProgress } = myEmpire;

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header flex items-center justify-between">
        <span>RESEARCH</span>
        <button onClick={() => setPanel('none')} className="text-[#3a5a6a] hover:text-[#6a8aa0]">✕</button>
      </div>

      {researchQueue && (
        <div className="px-3 py-2 bg-[#0a0a1a] border-b border-[#1a1a3a]">
          <div className="font-pixel text-[8px] text-[#8888ff] mb-1">RESEARCHING</div>
          <div className="font-mono text-[10px] text-[#c0d0e0]">{researchQueue}</div>
          <div className="mt-1 h-1.5 bg-[#050510]">
            <div
              className="h-full bg-[#4488ff] transition-all"
              style={{ width: `${Math.min(100, researchProgress)}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex-1 scrollable">
        {PATHS.map(path => {
          const pcfg = PATH_CONFIG[path];
          const nodes = RESEARCH_BY_PATH[path];

          return (
            <div key={path} className="border-b border-[#0a0a1a]">
              <div className="px-3 py-2 flex items-center gap-2" style={{ background: pcfg.color + '11' }}>
                <PixelIcon id={pcfg.icon} color={pcfg.color} size={14} />
                <span className="font-pixel text-[9px]" style={{ color: pcfg.color }}>{pcfg.label}</span>
              </div>
              <div className="px-2 py-1 flex flex-col gap-1">
                {nodes.map(node => {
                  const done = completedResearch.includes(node.id);
                  const active = researchQueue === node.id;
                  const prereqsMet = node.prerequisites.every(p => completedResearch.includes(p));
                  const canResearch = !done && !researchQueue && prereqsMet;
                  const affordable = (myEmpire.resources.research ?? 0) >= node.costResearch;

                  return (
                    <button
                      key={node.id}
                      onClick={() => { if (canResearch) startResearch(node.id); }}
                      disabled={!canResearch || !affordable}
                      className={`
                        flex items-start gap-2 p-2 text-left border transition-colors
                        ${done    ? 'border-[#1a3a1a] bg-[#0a1a0a]' : ''}
                        ${active  ? 'border-[#2a2a6a] bg-[#0a0a2a]' : ''}
                        ${!done && !active && canResearch && affordable
                          ? 'border-[#1a1a2a] bg-[#05050f] hover:border-[#3a3a5a] cursor-pointer'
                          : ''}
                        ${(!canResearch || !affordable) && !done && !active
                          ? 'border-[#0a0a1a] opacity-50 cursor-not-allowed'
                          : ''}
                      `}
                    >
                      <span className="font-mono text-[11px] mt-0.5 flex-shrink-0" style={{
                        color: done ? '#44aa44' : active ? '#8888ff' : prereqsMet ? '#4a6a8a' : '#2a3a4a'
                      }}>
                        {done ? '✓' : active ? '◎' : prereqsMet ? '○' : '✕'}
                      </span>
                      <div className="flex-1">
                        <div className="font-pixel text-[8px]" style={{
                          color: done ? '#44aa44' : active ? '#8888ff' : prereqsMet ? '#c0d0e0' : '#2a3a4a',
                        }}>
                          {node.name}
                        </div>
                        <div className="font-mono text-[9px] text-[#2a4a5a] mt-0.5">
                          {node.description}
                        </div>
                        {!done && (
                          <div className="font-mono text-[9px] text-[#1a3a4a] mt-0.5">
                            Cost: <span className={affordable ? 'text-[#4488ff]' : 'text-[#ff4455]'}>
                              {node.costResearch}rp
                            </span>
                            {node.costCompute > 0 && ` • ${node.costCompute}cpu`}
                          </div>
                        )}
                      </div>
                      <span className="font-pixel text-[7px] text-[#2a3a4a]">T{node.tier}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
