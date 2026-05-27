'use client';
import { useGameStore } from '@/store/game-store';

const EVENT_ICONS: Record<string, string> = {
  combat:     '⚔',
  colonize:   '🌍',
  research:   '🔬',
  diplomacy:  '🤝',
  anomaly:    '★',
  build:      '🔧',
  survey:     '🔭',
  conquest:   '🏴',
};

const EVENT_COLORS: Record<string, string> = {
  combat:     '#ff4455',
  colonize:   '#44ff88',
  research:   '#8888ff',
  diplomacy:  '#ffaa00',
  anomaly:    '#ff8800',
  build:      '#44aaff',
  survey:     '#aaaaff',
  conquest:   '#ff4455',
};

export default function EventLog() {
  const { events, currentGame } = useGameStore();

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header">EVENT LOG</div>
      <div className="flex-1 scrollable p-2 flex flex-col gap-0.5">
        {events.length === 0 && (
          <div className="font-mono text-[10px] text-[#1a2a3a] text-center py-4">
            No events yet...
          </div>
        )}
        {events.map(evt => (
          <div key={evt.id} className="flex items-start gap-2 py-1 border-b border-[#05050f] hover:bg-[#05050f]">
            <span className="text-xs mt-0.5 flex-shrink-0"
              style={{ color: EVENT_COLORS[evt.type] ?? '#5a7a8a' }}>
              {EVENT_ICONS[evt.type] ?? '•'}
            </span>
            <div className="flex-1 min-w-0">
              <span className="font-mono text-[9px] text-[#5a7a8a]">[{evt.tick}] </span>
              <span className="font-mono text-[10px] text-[#8aa0b0]">{evt.message}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
