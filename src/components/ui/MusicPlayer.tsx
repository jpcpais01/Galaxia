'use client';
import { useRef, useState, useEffect, useCallback } from 'react';

const TRACKS = [
  { title: 'Orbit Lullaby',    file: '/music/orbit-lullaby.mp3' },
  { title: 'Orbit Cipher',     file: '/music/orbit-cipher.mp3' },
  { title: 'Starfall Synapse', file: '/music/starfall-synapse.mp3' },
  { title: 'Ionized Dawn',     file: '/music/ionized-dawn.mp3' },
  { title: 'Starlight Solder', file: '/music/starlight-solder.mp3' },
];

export default function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [idx, setIdx]         = useState(0);
  const [playing, setPlaying] = useState(false);
  const [vol, setVol]         = useState(0.5);
  const [open, setOpen]       = useState(false);

  // Restore saved volume
  useEffect(() => {
    const v = parseFloat(localStorage.getItem('galaxia_music_vol') ?? '');
    if (!isNaN(v)) setVol(v);
  }, []);
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = vol;
    localStorage.setItem('galaxia_music_vol', String(vol));
  }, [vol]);

  const playCurrent = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    a.volume = vol;
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [vol]);

  const goTo = (i: number) => {
    setIdx(i);
    // src updates on re-render; play on the next tick
    setTimeout(playCurrent, 0);
  };
  const next = useCallback(() => goTo((idx + 1) % TRACKS.length), [idx]);
  const prev = () => goTo((idx - 1 + TRACKS.length) % TRACKS.length);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else playCurrent();
  };

  const track = TRACKS[idx];

  return (
    <div className="absolute bottom-3 left-3 z-30 font-mono select-none">
      <audio ref={audioRef} src={track.file} onEnded={next} preload="none" />

      {open ? (
        <div className="pixel-panel p-2 w-52 flex flex-col gap-2" style={{ borderColor: '#2a3a6a' }}>
          <div className="flex items-center justify-between">
            <span className="font-pixel text-[8px] text-accent-cyan">♪ SOUNDTRACK</span>
            <button onClick={() => setOpen(false)} className="text-[#3a5a6a] hover:text-[#6a8aa0] text-[10px]">▾</button>
          </div>

          {/* Track list */}
          <div className="flex flex-col gap-0.5">
            {TRACKS.map((t, i) => (
              <button
                key={t.file}
                onClick={() => goTo(i)}
                className="flex items-center justify-between px-1.5 py-1 text-[8px] border text-left"
                style={{
                  borderColor: i === idx ? '#3a6aff' : '#12182a',
                  background:  i === idx ? '#0a1430' : 'transparent',
                  color:       i === idx ? '#9ab8ff' : '#5a7a8a',
                }}
              >
                <span>{i === idx && playing ? '► ' : ''}{t.title}</span>
              </button>
            ))}
          </div>

          {/* Transport */}
          <div className="flex items-center gap-1">
            <button onClick={prev} className="btn-gray text-[9px] px-2 py-0.5">⏮</button>
            <button onClick={toggle} className="btn-cyan text-[9px] px-3 py-0.5 flex-1">{playing ? '⏸ PAUSE' : '► PLAY'}</button>
            <button onClick={next} className="btn-gray text-[9px] px-2 py-0.5">⏭</button>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-2">
            <span className="text-[8px] text-[#3a5a6a]">VOL</span>
            <input
              type="range" min={0} max={1} step={0.01} value={vol}
              onChange={e => setVol(parseFloat(e.target.value))}
              className="flex-1 accent-[#3a6aff] h-1"
            />
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="pixel-panel px-2 py-1 flex items-center gap-2 text-[8px]"
          style={{ borderColor: '#2a3a6a' }}
        >
          <span className={`text-accent-cyan ${playing ? 'animate-pulse' : ''}`}>♪</span>
          <span className="text-[#7a9ab8]">{playing ? track.title : 'MUSIC'}</span>
        </button>
      )}
    </div>
  );
}
