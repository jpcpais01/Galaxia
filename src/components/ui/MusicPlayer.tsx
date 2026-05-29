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
  const audioRef     = useRef<HTMLAudioElement | null>(null);
  const userPaused   = useRef(false); // true only when the player explicitly pauses
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

  // Start the soundtrack as soon as the player enters the game. Browsers block
  // autoplay-with-sound until a gesture, so also kick off on the first
  // interaction anywhere (unless the player has explicitly paused).
  useEffect(() => {
    playCurrent();
    const kick = () => {
      const a = audioRef.current;
      if (a && a.paused && !userPaused.current) playCurrent();
    };
    window.addEventListener('pointerdown', kick);
    window.addEventListener('keydown', kick);
    return () => {
      window.removeEventListener('pointerdown', kick);
      window.removeEventListener('keydown', kick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goTo = (i: number) => {
    userPaused.current = false;
    setIdx(i);
    setTimeout(playCurrent, 0); // src updates on re-render; play next tick
  };
  const next = useCallback(() => goTo((idx + 1) % TRACKS.length), [idx]);
  const prev = () => goTo((idx - 1 + TRACKS.length) % TRACKS.length);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); userPaused.current = true; }
    else { userPaused.current = false; playCurrent(); }
  };

  const track = TRACKS[idx];

  return (
    <div className="absolute top-2 right-2 z-30 font-mono select-none flex flex-col items-end gap-1">
      <audio ref={audioRef} src={track.file} onEnded={next} preload="auto" />

      {/* Always-visible compact transport bar */}
      <div className="pixel-panel flex items-center gap-1 px-1.5 py-1" style={{ borderColor: '#2a3a6a' }}>
        <span className={`text-accent-cyan text-[9px] ${playing ? 'animate-pulse' : ''}`}>♪</span>
        <span className="text-[#8aa8d0] text-[8px] w-24 truncate" title={track.title}>{track.title}</span>
        <button onClick={prev}   title="Previous" className="btn-gray text-[9px] px-1.5 py-0.5">⏮</button>
        <button onClick={toggle} title={playing ? 'Pause' : 'Play'} className="btn-cyan text-[9px] px-2 py-0.5">{playing ? '⏸' : '►'}</button>
        <button onClick={next}   title="Next" className="btn-gray text-[9px] px-1.5 py-0.5">⏭</button>
        <button onClick={() => setOpen(o => !o)} title="Tracklist" className="text-[#3a5a6a] hover:text-[#6a8aa0] text-[10px] px-1">{open ? '▴' : '▾'}</button>
      </div>

      {/* Expandable track list + volume */}
      {open && (
        <div className="pixel-panel p-2 w-48 flex flex-col gap-2" style={{ borderColor: '#2a3a6a' }}>
          <div className="flex flex-col gap-0.5">
            {TRACKS.map((t, i) => (
              <button
                key={t.file}
                onClick={() => goTo(i)}
                className="flex items-center px-1.5 py-1 text-[8px] border text-left"
                style={{
                  borderColor: i === idx ? '#3a6aff' : '#12182a',
                  background:  i === idx ? '#0a1430' : 'transparent',
                  color:       i === idx ? '#9ab8ff' : '#5a7a8a',
                }}
              >
                {i === idx && playing ? '► ' : ''}{t.title}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[8px] text-[#3a5a6a]">VOL</span>
            <input
              type="range" min={0} max={1} step={0.01} value={vol}
              onChange={e => setVol(parseFloat(e.target.value))}
              className="flex-1 accent-[#3a6aff] h-1"
            />
          </div>
        </div>
      )}
    </div>
  );
}
