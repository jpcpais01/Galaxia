import { ImageResponse } from 'next/og';

export const size        = { width: 64, height: 64 };
export const contentType = 'image/png';

/* Deep-space icon: central star with cross flares, two cyan orbital rings,
   two planet dots, scattered pixel stars — matches the in-game aesthetic. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 64, height: 64,
          background: '#00000f',
          display: 'flex',
          position: 'relative',
        }}
      >
        {/* ── background pixel stars ──────────────────────────── */}
        {([
          [10, 8,  2, 'rgba(255,255,255,0.80)'],
          [50, 9,  2, 'rgba(255,255,255,0.55)'],
          [ 8,47,  1, 'rgba(136,136,255,0.90)'],
          [53,51,  2, 'rgba(255,255,255,0.42)'],
          [39, 5,  1, 'rgba(255,136, 68,0.85)'],
          [17,55,  1, 'rgba(255,255,255,0.65)'],
          [57,28,  1, 'rgba(200,220,255,0.55)'],
        ] as const).map(([x,y,s,c], i) => (
          <div key={i} style={{ position:'absolute', left:x, top:y, width:s, height:s, background:c }} />
        ))}

        {/* ── outer orbit ring ─────────────────────────────────── */}
        <div style={{
          position:'absolute', top:5, left:5, width:54, height:54,
          borderRadius:'50%', border:'1px solid rgba(0,255,255,0.22)',
        }} />

        {/* ── inner orbit ring ─────────────────────────────────── */}
        <div style={{
          position:'absolute', top:15, left:15, width:34, height:34,
          borderRadius:'50%', border:'1px solid rgba(0,255,255,0.40)',
        }} />

        {/* ── star glow ────────────────────────────────────────── */}
        <div style={{
          position:'absolute', top:20, left:20, width:24, height:24,
          borderRadius:'50%', background:'rgba(255,110,0,0.38)',
        }} />

        {/* ── cross flare — horizontal ─────────────────────────── */}
        <div style={{
          position:'absolute', top:30, left:12, width:40, height:4,
          background:'linear-gradient(90deg,transparent 0%,rgba(255,224,102,0.35) 25%,rgba(255,224,102,0.90) 50%,rgba(255,224,102,0.35) 75%,transparent 100%)',
        }} />

        {/* ── cross flare — vertical ───────────────────────────── */}
        <div style={{
          position:'absolute', top:12, left:30, width:4, height:40,
          background:'linear-gradient(180deg,transparent 0%,rgba(255,224,102,0.35) 25%,rgba(255,224,102,0.90) 50%,rgba(255,224,102,0.35) 75%,transparent 100%)',
        }} />

        {/* ── star body (gold square) ───────────────────────────── */}
        <div style={{
          position:'absolute', top:26, left:26, width:12, height:12,
          background:'#FFE066',
        }} />

        {/* ── star core (white) ─────────────────────────────────── */}
        <div style={{
          position:'absolute', top:29, left:29, width:6, height:6,
          background:'#ffffff',
        }} />

        {/* ── planet 1 — blue, top of outer ring ───────────────── */}
        <div style={{
          position:'absolute', top:6, left:29, width:6, height:6,
          borderRadius:'50%', background:'#4488ff',
        }} />

        {/* ── planet 2 — teal, right of inner ring ─────────────── */}
        <div style={{
          position:'absolute', top:29, left:48, width:5, height:5,
          borderRadius:'50%', background:'#44DDa0',
        }} />
      </div>
    ),
    { ...size },
  );
}
