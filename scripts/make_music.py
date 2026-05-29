#!/usr/bin/env python3
"""
Galaxia soundtrack generator — 16-bit / chiptune space-synth.

Synthesizes 5 unique tracks with a small numpy oscillator engine
(square/pulse/saw/triangle/sine/noise + ADSR + vibrato + echo + chip drums),
renders 16-bit WAV, then ffmpeg-compresses to looping OGG in public/music/.

Run:  python scripts/make_music.py
"""
import os, re, wave, subprocess
import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'music')
os.makedirs(OUT, exist_ok=True)

# ─── Note helpers ────────────────────────────────────────────────────────────
_SEMI = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
def n(name):
    m = re.match(r'^([A-G])([#b]?)(-?\d)$', name)
    s = _SEMI[m.group(1)]
    if m.group(2) == '#': s += 1
    elif m.group(2) == 'b': s -= 1
    return 12 * (int(m.group(3)) + 1) + s
def hz(name): return 440.0 * 2 ** ((n(name) - 69) / 12.0)

# ─── Oscillator + envelope ───────────────────────────────────────────────────
def osc(freq, dur, kind='square', duty=0.5, vib=0.0, vrate=5.5, detune=0.0):
    N = max(1, int(dur * SR))
    t = np.arange(N) / SR
    f = freq * (2 ** (detune / 1200.0))
    inst = f * (1.0 + vib * np.sin(2 * np.pi * vrate * t)) if vib else np.full(N, f)
    ph = np.cumsum(inst) / SR
    frac = ph % 1.0
    if kind in ('square', 'pulse'): w = np.where(frac < duty, 1.0, -1.0)
    elif kind == 'saw':  w = 2 * frac - 1
    elif kind == 'tri':  w = 2 * np.abs(2 * frac - 1) - 1
    elif kind == 'sine': w = np.sin(2 * np.pi * ph)
    elif kind == 'noise': w = np.random.uniform(-1, 1, N)
    else: w = np.where(frac < duty, 1.0, -1.0)
    return w.astype(np.float32)

def env(N, a=0.005, d=0.04, s=0.6, r=0.08):
    A = min(int(a * SR), N)
    D = min(int(d * SR), max(0, N - A))
    R = min(int(r * SR), max(0, N - A - D))
    S = max(0, N - A - D - R)
    segs = []
    if A: segs.append(np.linspace(0, 1, A, endpoint=False))
    if D: segs.append(np.linspace(1, s, D, endpoint=False))
    if S: segs.append(np.full(S, s))
    if R: segs.append(np.linspace(s, 0, R, endpoint=False))
    e = np.concatenate(segs) if segs else np.zeros(N)
    if len(e) < N: e = np.concatenate([e, np.zeros(N - len(e))])
    return e[:N].astype(np.float32)

def add(buf, sig, start):
    start = int(start)
    if start >= len(buf) or start < 0:
        if start < 0: sig = sig[-start:]; start = 0
        else: return
    end = min(len(buf), start + len(sig))
    buf[start:end] += sig[:end - start]

def echo(sig, delay=0.33, fb=0.4, taps=5, mix=0.5):
    out = sig.copy()
    d = int(delay * SR)
    for i in range(1, taps + 1):
        sh = np.zeros_like(sig)
        off = d * i
        if off < len(sig): sh[off:] = sig[:len(sig) - off] * (fb ** i)
        out += sh * mix
    return out

# ─── Chip drums ──────────────────────────────────────────────────────────────
def kick(dur=0.18, g=0.95):
    N = int(dur * SR); t = np.arange(N) / SR
    fr = 45 + (135 - 45) * np.exp(-t * 32)
    ph = np.cumsum(fr) / SR
    return (np.sin(2 * np.pi * ph) * np.exp(-t * 9) * g).astype(np.float32)
def snare(dur=0.17, g=0.6):
    N = int(dur * SR); t = np.arange(N) / SR
    no = np.random.uniform(-1, 1, N) * np.exp(-t * 24)
    tn = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.4
    return ((no * 0.7 + tn) * g).astype(np.float32)
def hat(dur=0.05, g=0.32):
    N = int(dur * SR); t = np.arange(N) / SR
    return (np.random.uniform(-1, 1, N) * np.exp(-t * 70) * g).astype(np.float32)

# ─── Sequencer ───────────────────────────────────────────────────────────────
def play(part, events, bpm, kind, envp, gain=1.0, gate=0.92, pan_jit=0.0, **ok):
    spb = 60.0 / bpm
    for ev in events:
        sb, lb, name, vol = ev
        if name is None: continue
        dur = lb * spb * gate
        sig = osc(hz(name), dur, kind, **ok)
        sig = sig * env(len(sig), *envp) * vol * gain
        add(part, sig, sb * spb * SR)

def total_samples(bpm, beats): return int(beats * (60.0 / bpm) * SR) + SR  # +1s tail

def mixdown(parts, length):
    L = np.zeros(length); R = np.zeros(length)
    for mono, pan, g in parts:
        ang = (pan + 1) / 2 * (np.pi / 2)
        lg, rg = np.cos(ang) * g, np.sin(ang) * g
        m = mono[:length] if len(mono) >= length else np.concatenate([mono, np.zeros(length - len(mono))])
        L += m * lg; R += m * rg
    return L, R

def save(name, L, R):
    data = np.stack([L, R], axis=1)
    peak = np.max(np.abs(data))
    if peak > 0: data = data / peak * 0.92
    data = np.tanh(data * 1.15) * 0.92        # gentle tape-style saturation
    i16 = np.clip(data * 32767, -32768, 32767).astype('<i2')
    wav = os.path.join(OUT, name + '.wav')
    with wave.open(wav, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(i16.tobytes())
    ogg = os.path.join(OUT, name + '.ogg')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libvorbis',
                    '-qscale:a', '3', ogg], check=True)
    os.remove(wav)
    print(f'  [ok] {name}.ogg  ({os.path.getsize(ogg)//1024} KB)')

def arp_events(prog, bpm, bars, step=0.25, dirn='up', octs=1):
    """Lay an arpeggio across `bars`, one chord per bar, in `step`-beat notes."""
    ev = []
    beat = 0.0
    for b in range(bars):
        chord = prog[b % len(prog)]
        notes = []
        for o in range(octs):
            notes += [nm[:-1] + str(int(nm[-1]) + o) for nm in chord]
        if dirn == 'updown': notes = notes + notes[-2:0:-1]
        i = 0
        steps_per_bar = int(4 / step)
        for s in range(steps_per_bar):
            ev.append((beat + s * step, step, notes[i % len(notes)], 1.0))
            i += 1
        beat += 4
    return ev

def pad_events(prog, bars):
    ev = []
    for b in range(bars):
        chord = prog[b % len(prog)]
        for nm in chord:
            ev.append((b * 4, 4, nm, 1.0))
    return ev

def bass_events(roots, bpm, bars, pattern):
    """pattern: list of (offset_beats, len_beats) within a bar; root per bar."""
    ev = []
    for b in range(bars):
        root = roots[b % len(roots)]
        for off, ln in pattern:
            ev.append((b * 4 + off, ln, root, 1.0))
    return ev

def drum_grid(bpm, bars, kpat, spat, hpat):
    """kpat/spat/hpat: 16-step strings ('x'/'-') per bar; returns sample-placed buffers."""
    spb = 60.0 / bpm
    step = spb / 4
    buf = np.zeros(total_samples(bpm, bars * 4))
    for b in range(bars):
        for i, c in enumerate(kpat):
            if c == 'x': add(buf, kick(), (b * 4 * spb + i * step) * SR)
        for i, c in enumerate(spat):
            if c == 'x': add(buf, snare(), (b * 4 * spb + i * step) * SR)
        for i, c in enumerate(hpat):
            if c == 'x': add(buf, hat(), (b * 4 * spb + i * step) * SR)
    return buf

# ═══════════════════════════════════════════════════════════════════════════
#  SONG 1 — "Stellar Drift"  (main / menu theme: calm, dreamy, A minor)
# ═══════════════════════════════════════════════════════════════════════════
def stellar_drift():
    bpm, bars = 88, 24
    length = total_samples(bpm, bars * 4)
    prog = [['A3', 'C4', 'E4'], ['F3', 'A3', 'C4'], ['C4', 'E4', 'G4'], ['G3', 'B3', 'D4']]
    roots = ['A1', 'F1', 'C1', 'G1']

    pad = np.zeros(length)
    play(pad, pad_events(prog, bars), bpm, 'saw', (0.6, 0.4, 0.7, 0.8), gain=0.16, gate=0.99, detune=6, vib=0.004, vrate=0.6)
    play(pad, pad_events(prog, bars), bpm, 'saw', (0.6, 0.4, 0.7, 0.8), gain=0.13, gate=0.99, detune=-6)

    bass = np.zeros(length)
    play(bass, bass_events(roots, bpm, bars, [(0, 2), (2, 1.5)]), bpm, 'tri', (0.01, 0.1, 0.8, 0.2), gain=0.5)

    arp = np.zeros(length)
    play(arp, arp_events(prog, bpm, bars, step=0.5, dirn='updown', octs=2), bpm, 'pulse',
         (0.005, 0.06, 0.3, 0.1), gain=0.12, duty=0.25)
    arp = echo(arp, delay=60.0 / bpm * 0.75, fb=0.4, mix=0.45)

    # gentle lead melody (square w/ vibrato), two 8-bar phrases
    L = 'A4 C5 E5 . D5 C5 B4 . C5 E5 A5 . G5 E5 D5 .'.split()
    L2 = 'E5 D5 C5 . B4 G4 A4 . F4 A4 C5 . E5 D5 . . .'.split()
    lead = np.zeros(length)
    ev, beat = [], 0.0
    for phr in [L, L2, L, L2]:
        for tok in phr:
            if tok != '.': ev.append((beat, 1.0, tok, 1.0))
            beat += 1.0
    play(lead, ev, bpm, 'square', (0.01, 0.08, 0.55, 0.25), gain=0.22, duty=0.5, vib=0.012, vrate=5.0, gate=0.9)
    lead = echo(lead, delay=60.0 / bpm * 1.5, fb=0.3, taps=3, mix=0.3)

    parts = [(pad, 0.0, 1.0), (bass, 0.0, 1.0), (arp, 0.35, 1.0), (arp, -0.35, 0.8), (lead, -0.1, 1.0)]
    return mixdown(parts, length)

# ═══════════════════════════════════════════════════════════════════════════
#  SONG 2 — "Nebula Run"  (exploration: upbeat, driving, C major)
# ═══════════════════════════════════════════════════════════════════════════
def nebula_run():
    bpm, bars = 132, 32
    length = total_samples(bpm, bars * 4)
    prog = [['C4', 'E4', 'G4'], ['G3', 'B3', 'D4'], ['A3', 'C4', 'E4'], ['F3', 'A3', 'C4']]
    roots = ['C2', 'G1', 'A1', 'F1']

    bass = np.zeros(length)
    play(bass, bass_events(roots, bpm, bars, [(0, .5), (.5, .5), (1, .5), (1.5, .5), (2, .5), (2.5, .5), (3, .5), (3.5, .5)]),
         bpm, 'tri', (0.005, 0.05, 0.7, 0.05), gain=0.5, gate=0.85)

    arp = np.zeros(length)
    play(arp, arp_events(prog, bpm, bars, step=0.25, dirn='up', octs=2), bpm, 'pulse',
         (0.003, 0.04, 0.25, 0.05), gain=0.13, duty=0.5, gate=0.9)
    arp = echo(arp, delay=60.0 / bpm * 0.75, fb=0.3, taps=3, mix=0.3)

    # catchy pulse lead
    phr1 = 'G4 G4 A4 G4 C5 . B4 . G4 E4 G4 . A4 . . .'.split()
    phr2 = 'E5 D5 C5 D5 E5 . C5 . D5 B4 G4 . C5 . . .'.split()
    phr3 = 'C5 . C5 D5 E5 G5 E5 D5 C5 B4 A4 G4 A4 B4 . .'.split()
    lead = np.zeros(length)
    ev, beat = [], 0.0
    for phr in [phr1, phr2, phr1, phr3]:
        for tok in phr:
            if tok != '.': ev.append((beat, 1.0, tok, 1.0))
            beat += 0.5
    play(lead, ev, bpm, 'square', (0.005, 0.05, 0.5, 0.08), gain=0.24, duty=0.375, vib=0.008, gate=0.88)

    drums = drum_grid(bpm, bars,
                      'x------x--x-----', '----x-------x---', 'x-x-x-x-x-x-x-x-')
    return mixdown([(bass, 0.0, 1.0), (arp, 0.4, 1.0), (arp, -0.4, 0.85),
                    (lead, -0.05, 1.0), (drums, 0.0, 0.9)], length)

# ═══════════════════════════════════════════════════════════════════════════
#  SONG 3 — "Ion Storm"  (combat: tense, aggressive, E minor / phrygian)
# ═══════════════════════════════════════════════════════════════════════════
def ion_storm():
    bpm, bars = 150, 36
    length = total_samples(bpm, bars * 4)
    prog = [['E4', 'G4', 'B4'], ['F4', 'A4', 'C5'], ['D4', 'F4', 'A4'], ['E4', 'G4', 'B4']]
    roots = ['E1', 'F1', 'D1', 'E1']

    bass = np.zeros(length)
    play(bass, bass_events(roots, bpm, bars, [(o * .5, .5) for o in range(8)]),
         bpm, 'saw', (0.003, 0.03, 0.6, 0.03), gain=0.42, gate=0.8, detune=3)

    # detuned aggressive saw lead — two octaves stacked, slightly detuned
    phr1 = 'E5 . E5 G5 . F5 E5 . B4 . E5 . D5 . . .'.split()
    phr2 = 'E5 G5 A5 G5 F5 . E5 D5 E5 . . . B5 . A5 G5'.split()
    lead = np.zeros(length)
    ev, beat = [], 0.0
    for phr in [phr1, phr1, phr2, phr2]:
        for tok in phr:
            if tok != '.': ev.append((beat, 0.5, tok, 1.0))
            beat += 0.25
    play(lead, ev, bpm, 'saw', (0.004, 0.05, 0.5, 0.06), gain=0.2, vib=0.01, vrate=6.5, detune=7, gate=0.9)
    play(lead, ev, bpm, 'saw', (0.004, 0.05, 0.5, 0.06), gain=0.14, detune=-7, gate=0.9)

    # dissonant stab chords on the off-beats
    stab = np.zeros(length)
    sev = []
    for b in range(bars):
        ch = prog[b % len(prog)]
        for nm in ch: sev.append((b * 4 + 2, 0.4, nm, 1.0))
    play(stab, sev, bpm, 'pulse', (0.002, 0.04, 0.2, 0.08), gain=0.1, duty=0.125)

    drums = drum_grid(bpm, bars,
                      'x---x---x--xx---', '----x-------x---', 'xxxxxxxxxxxxxxxx')
    return mixdown([(bass, 0.0, 1.0), (lead, 0.1, 1.0), (lead, -0.1, 0.8),
                    (stab, 0.3, 0.9), (drums, 0.0, 1.0)], length)

# ═══════════════════════════════════════════════════════════════════════════
#  SONG 4 — "Frozen Expanse"  (anomaly / deep space: eerie, sparse, reverby)
# ═══════════════════════════════════════════════════════════════════════════
def frozen_expanse():
    bpm, bars = 76, 18
    length = total_samples(bpm, bars * 4)
    # whole-tone-flavoured, unsettling
    prog = [['D3', 'F3', 'A3'], ['Eb3', 'G3', 'Bb3'], ['C3', 'E3', 'G3'], ['Db3', 'F3', 'Ab3']]
    roots = ['D1', 'Eb1', 'C1', 'Db1']

    pad = np.zeros(length)
    play(pad, pad_events(prog, bars), bpm, 'saw', (1.0, 0.6, 0.7, 1.2), gain=0.13, gate=0.99, detune=8, vib=0.006, vrate=0.4)
    play(pad, pad_events(prog, bars), bpm, 'tri', (1.0, 0.6, 0.7, 1.2), gain=0.12, gate=0.99, detune=-8)

    drone = np.zeros(length)
    play(drone, [(0, bars * 4, 'D1', 1.0)], bpm, 'sine', (2.0, 1.0, 0.9, 2.0), gain=0.35)

    # bell-like arpeggio with long echo (sine + tri)
    bell = np.zeros(length)
    play(bell, arp_events(prog, bpm, bars, step=1.0, dirn='updown', octs=2), bpm, 'sine',
         (0.005, 0.3, 0.0, 0.4), gain=0.18)
    bell = echo(bell, delay=60.0 / bpm * 1.5, fb=0.55, taps=6, mix=0.6)

    # occasional high, lonely square ping
    ping = np.zeros(length)
    pev = [(2, 2, 'D6', 1.0), (10, 2, 'F6', 1.0), (22, 2, 'C6', 1.0), (34, 2, 'A5', 1.0),
           (50, 3, 'Eb6', 1.0), (62, 3, 'D6', 1.0)]
    play(ping, pev, bpm, 'square', (0.02, 0.4, 0.2, 0.6), gain=0.1, duty=0.5, vib=0.01)
    ping = echo(ping, delay=60.0 / bpm * 2.0, fb=0.5, taps=5, mix=0.5)

    return mixdown([(drone, 0.0, 1.0), (pad, 0.3, 1.0), (pad, -0.3, 0.9),
                    (bell, -0.2, 1.0), (ping, 0.4, 1.0)], length)

# ═══════════════════════════════════════════════════════════════════════════
#  SONG 5 — "Victory Protocol"  (triumphant fanfare, D major)
# ═══════════════════════════════════════════════════════════════════════════
def victory_protocol():
    bpm, bars = 120, 28
    length = total_samples(bpm, bars * 4)
    prog = [['D4', 'F#4', 'A4'], ['A3', 'C#4', 'E4'], ['B3', 'D4', 'F#4'], ['G3', 'B3', 'D4']]
    roots = ['D2', 'A1', 'B1', 'G1']

    bass = np.zeros(length)
    play(bass, bass_events(roots, bpm, bars, [(0, .75), (1, .5), (2, .75), (3, .5)]),
         bpm, 'tri', (0.005, 0.05, 0.75, 0.08), gain=0.5)

    arp = np.zeros(length)
    play(arp, arp_events(prog, bpm, bars, step=0.25, dirn='up', octs=2), bpm, 'pulse',
         (0.003, 0.04, 0.3, 0.05), gain=0.12, duty=0.5)
    arp = echo(arp, delay=60.0 / bpm * 0.5, fb=0.3, taps=3, mix=0.3)

    # heroic fanfare lead
    fan1 = 'D5 . D5 D5 . E5 F#5 . A5 . . . F#5 . . .'.split()
    fan2 = 'A5 . F#5 A5 . B5 . A5 F#5 . E5 . D5 . . .'.split()
    fan3 = 'D5 E5 F#5 G5 A5 . A5 . B5 . A5 G5 F#5 . E5 .'.split()
    fan4 = 'D6 . A5 . F#5 . D5 . A5 . . . D6 . . .'.split()
    lead = np.zeros(length)
    ev, beat = [], 0.0
    for phr in [fan1, fan2, fan1, fan3, fan4]:
        for tok in phr:
            if tok != '.': ev.append((beat, 1.0, tok, 1.0))
            beat += 0.5
    play(lead, ev, bpm, 'square', (0.005, 0.05, 0.6, 0.1), gain=0.26, duty=0.5, vib=0.006, gate=0.9)
    # octave-down harmony layer
    harm = np.zeros(length)
    hev = [(b, l, nm[:-1] + str(int(nm[-1]) - 1), v) for (b, l, nm, v) in ev]
    play(harm, hev, bpm, 'pulse', (0.005, 0.05, 0.5, 0.1), gain=0.1, duty=0.25)

    drums = drum_grid(bpm, bars,
                      'x------x--x-x---', '----x-------x---', 'x-xxx-xxx-xxx-xx')
    return mixdown([(bass, 0.0, 1.0), (arp, 0.4, 1.0), (arp, -0.4, 0.85),
                    (lead, 0.0, 1.0), (harm, -0.15, 1.0), (drums, 0.0, 0.95)], length)

# ─── Render all ──────────────────────────────────────────────────────────────
SONGS = [
    ('01_stellar_drift',   stellar_drift),
    ('02_nebula_run',      nebula_run),
    ('03_ion_storm',       ion_storm),
    ('04_frozen_expanse',  frozen_expanse),
    ('05_victory_protocol', victory_protocol),
]

if __name__ == '__main__':
    np.random.seed(42)
    for name, fn in SONGS:
        print(f'Rendering {name}...')
        L, R = fn()
        save(name, L, R)
    print('Done.')
