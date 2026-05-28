'use client';
import { useState, useRef, useEffect } from 'react';
import { PixelIcon } from '@/components/ui/PixelIcon';
import type {
  Civilization, SpeciesType, GovernmentType,
  CulturalFocus, CivTrait, OriginType, PlanetType,
} from '@/types/game';

// ─── Static data ──────────────────────────────────────────────────────────────

const SPECIES_DATA: {
  type: SpeciesType; label: string;
  desc: string; lore: string; effects: string[]; color: string;
}[] = [
  { type: 'humanoid',    label: 'Humanoid',    color: '#8aa8c8',
    desc: 'Adaptable beings of flesh and relentless will',
    lore: 'Born from a billion years of competitive evolution, humanoids spread across the stars through sheer stubbornness.',
    effects: ['Balanced across all domains', '+10% to all resource rates'] },
  { type: 'insectoid',   label: 'Insectoid',   color: '#88cc44',
    desc: 'Hive-driven workers with chitinous exoskeletons',
    lore: 'The hive does not ask — the hive does. Each drone exists to serve the Great Colony.',
    effects: ['+25% build speed', '-15% diplomacy influence'] },
  { type: 'fungal',      label: 'Fungal',      color: '#bb66dd',
    desc: 'Networked mycelium consciousness spanning entire worlds',
    lore: 'They do not walk between stars — they grow. The spores of knowledge drift across the void.',
    effects: ['+30% research output', '-15% ship speed'] },
  { type: 'synthetic',   label: 'Synthetic',   color: '#44aaff',
    desc: 'Crystalline minds housed in titanium shells',
    lore: 'They killed their creators and inherited the stars. Logic, not emotion, guides every decision.',
    effects: ['No food consumption', '+35% compute output', '-20% population growth'] },
  { type: 'aquatic',     label: 'Aquatic',     color: '#22aabb',
    desc: 'Deep-sea leviathans who reached for the stars',
    lore: 'They conquered the crushing depths before the air. Space is simply another ocean.',
    effects: ['+35% efficiency on ocean worlds', '-20% on arid/desert worlds'] },
  { type: 'crystalline', label: 'Crystalline', color: '#88ddff',
    desc: 'Living lattices that resonate with cosmic energy',
    lore: 'Each Crystalline is a universe of refracted light. They see time the way others see color.',
    effects: ['+30% energy production', '-15% ship HP'] },
  { type: 'psionic',     label: 'Psionic',     color: '#cc88ff',
    desc: 'Minds so vast they reshape reality through thought alone',
    lore: 'Before they discovered fire, they discovered telepathy. The void between stars is just silence to think in.',
    effects: ['+25% research', '+25% diplomacy influence'] },
  { type: 'gaseous',     label: 'Gaseous',     color: '#ffaa44',
    desc: 'Cloud entities drifting between electromagnetic storms',
    lore: 'They are the weather itself. Their cities are cyclones, their roads are ionosphere currents.',
    effects: ['+35% on gas giant worlds', '+20% energy output'] },
];

// ── Pixel-art emblem definitions ─────────────────────────────────────────────
// Each emblem is 8 rows of 8 pixels (1 row = 1 byte, MSB = leftmost pixel).
// Rendered on a 16×16 canvas (2×2 px per logical pixel) → displayed at 40×40.

export interface EmblemDef { id: string; label: string; rows: number[] }

export const EMBLEM_DEFS: EmblemDef[] = [
  { id: 'star',      label: 'Star',      rows: [0x18,0x18,0xFF,0x7E,0x3C,0x6C,0xC6,0x00] },
  { id: 'diamond',   label: 'Diamond',   rows: [0x18,0x3C,0x7E,0xFF,0x7E,0x3C,0x18,0x00] },
  { id: 'cross',     label: 'Cross',     rows: [0x18,0x18,0x18,0xFF,0xFF,0x18,0x18,0x18] },
  { id: 'lightning', label: 'Lightning', rows: [0x0F,0x1E,0x3C,0xF8,0x1F,0x3C,0x78,0xF0] },
  { id: 'shield',    label: 'Shield',    rows: [0xFF,0xFF,0xFF,0xFF,0x7E,0x3C,0x18,0x00] },
  { id: 'arrow_up',  label: 'Arrow',     rows: [0x18,0x3C,0x7E,0xFF,0x18,0x18,0x18,0x18] },
  { id: 'eye',       label: 'Eye',       rows: [0x00,0x7E,0xFF,0xDB,0xDB,0xFF,0x7E,0x00] },
  { id: 'skull',     label: 'Skull',     rows: [0x3C,0x7E,0xDB,0xFF,0xFF,0x3C,0x66,0x66] },
  { id: 'flame',     label: 'Flame',     rows: [0x18,0x3C,0x7E,0xFF,0xFF,0x7E,0x7E,0x3C] },
  { id: 'crown',     label: 'Crown',     rows: [0x00,0x81,0xE7,0xFF,0xFF,0xFF,0xFF,0x00] },
  { id: 'crescent',  label: 'Moon',      rows: [0x3C,0x7C,0xFC,0xF8,0xF8,0xFC,0x7C,0x3C] },
  { id: 'sun',       label: 'Sun',       rows: [0x99,0x66,0x3C,0xFF,0xFF,0x3C,0x66,0x99] },
  { id: 'atom',      label: 'Atom',      rows: [0x66,0xDB,0xBD,0xFF,0xFF,0xBD,0xDB,0x66] },
  { id: 'gear',      label: 'Gear',      rows: [0x18,0xFF,0xFF,0xDB,0xDB,0xFF,0xFF,0x18] },
  { id: 'tree',      label: 'Tree',      rows: [0x18,0x3C,0xFF,0xFF,0x3C,0x3C,0x7E,0x00] },
  { id: 'sword',     label: 'Sword',     rows: [0x80,0xC0,0xE0,0x70,0x38,0x1C,0x0E,0x07] },
  { id: 'hourglass', label: 'Hourglass', rows: [0xFF,0x7E,0x3C,0x18,0x18,0x3C,0x7E,0xFF] },
  { id: 'target',    label: 'Target',    rows: [0x3C,0x42,0xA5,0x99,0x99,0xA5,0x42,0x3C] },
  { id: 'spade',     label: 'Spade',     rows: [0x18,0x7E,0xFF,0xFF,0x7E,0x18,0x7E,0x00] },
  { id: 'snowflake', label: 'Snowflake', rows: [0x99,0x5A,0x3C,0xFF,0xFF,0x3C,0x5A,0x99] },
  { id: 'infinity',  label: 'Infinity',  rows: [0x00,0x66,0xDB,0xFF,0xFF,0xDB,0x66,0x00] },
  { id: 'spiral',    label: 'Spiral',    rows: [0xFE,0x82,0xBA,0xA2,0xAA,0xB2,0x02,0xFE] },
  { id: 'hex',       label: 'Hexagon',   rows: [0x3C,0x7E,0xFF,0xFF,0xFF,0xFF,0x7E,0x3C] },
  { id: 'wave',      label: 'Wave',      rows: [0x00,0x66,0xFF,0x99,0x99,0xFF,0x66,0x00] },
  { id: 'wings',     label: 'Wings',     rows: [0x42,0xE7,0xFF,0x3C,0x3C,0xFF,0xE7,0x42] },
  { id: 'triangle',  label: 'Triangle',  rows: [0x18,0x3C,0x3C,0x7E,0x7E,0xFF,0xFF,0x00] },
  { id: 'arrow_r',   label: 'Arrow →',   rows: [0x18,0x1C,0x1E,0xFF,0xFF,0x1E,0x1C,0x18] },
  { id: 'dots',      label: '4 Points',  rows: [0xC3,0x42,0x24,0x18,0x18,0x24,0x42,0xC3] },
];

export function EmblemCanvas({ emblemId, color, size = 40 }: { emblemId: string; color: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const def = EMBLEM_DEFS.find(e => e.id === emblemId) ?? EMBLEM_DEFS[0];
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = color;
    for (let y = 0; y < 8; y++) {
      const row = def.rows[y];
      for (let x = 0; x < 8; x++) {
        if (row & (0x80 >> x)) ctx.fillRect(x * 2, y * 2, 2, 2);
      }
    }
  }, [emblemId, color, def]);
  return (
    <canvas
      ref={ref}
      width={16}
      height={16}
      style={{ width: size, height: size, imageRendering: 'pixelated', display: 'block' }}
    />
  );
}

const COLOR_PALETTE = [
  '#4488ff','#ff4455','#44ff88','#ffaa00',
  '#ff44ff','#44ffff','#ff8844','#8844ff',
  '#ff4488','#88ff44','#ffffff','#ff6600',
  '#00ccaa','#cc0044','#0044cc','#aacc00',
];

const HOME_WORLDS: { type: PlanetType; label: string; color: string; desc: string }[] = [
  { type: 'continental', label: 'Continental', color: '#3a6b4a', desc: 'Vast continents and inland seas' },
  { type: 'ocean',       label: 'Ocean',       color: '#1a4f7a', desc: 'Endless global ocean' },
  { type: 'arid',        label: 'Arid',        color: '#c08030', desc: 'Dry steppes and dusty plains' },
  { type: 'tundra',      label: 'Tundra',      color: '#7aa0b8', desc: 'Frozen wastes and ice caps' },
  { type: 'jungle',      label: 'Jungle',      color: '#1a6a30', desc: 'Dense canopy and ancient life' },
  { type: 'volcanic',    label: 'Volcanic',    color: '#8a1a10', desc: 'Forge-world of fire and ash' },
  { type: 'fungal',      label: 'Fungal',      color: '#6a2a8a', desc: 'Vast bioluminescent fungal forests' },
  { type: 'savanna',     label: 'Savanna',     color: '#c8a030', desc: 'Open grasslands and bronze skies' },
  { type: 'arctic',      label: 'Arctic',      color: '#d0e8f8', desc: 'Eternal winter and aurora skies' },
  { type: 'swamp',       label: 'Swamp',       color: '#2a5820', desc: 'Murky wetlands teeming with life' },
];

const GOVERNMENTS: {
  type: GovernmentType; label: string;
  desc: string; effects: string[];
}[] = [
  { type: 'democracy',     label: 'Democracy',
    desc: 'Rule by the voice of the people — slow but legitimate',
    effects: ['+20% diplomacy', '-10% build speed'] },
  { type: 'hive_mind',     label: 'Hive Mind',
    desc: 'A single will shared by all — perfect coordination',
    effects: ['+25% build speed', 'Cannot initiate diplomacy'] },
  { type: 'theocracy',     label: 'Theocracy',
    desc: 'Divine mandate drives science and conquest alike',
    effects: ['+20% research', '-15% trade income'] },
  { type: 'oligarchy',     label: 'Oligarchy',
    desc: 'The wealthy few decide the fate of the many',
    effects: ['+30% credits income', '-15% population growth'] },
  { type: 'military_junta', label: 'Military Junta',
    desc: 'The strongest rule through strength alone',
    effects: ['+25% combat power', '-20% research output'] },
  { type: 'federation',    label: 'Federation',
    desc: 'A coalition of worlds united in purpose',
    effects: ['+15% all trade', '+10% diplomacy'] },
];

const CULTURAL_FOCUSES: {
  type: CulturalFocus; label: string;
  desc: string; effects: string[];
}[] = [
  { type: 'scientific',   label: 'Scientific',
    desc: 'Knowledge is the highest virtue',
    effects: ['+35% research rate'] },
  { type: 'militaristic', label: 'Militaristic',
    desc: 'Peace is merely the interval between wars',
    effects: ['+25% combat', '+15% ship HP'] },
  { type: 'commercial',   label: 'Commercial',
    desc: 'Every star is a market waiting to be opened',
    effects: ['+35% credit income', '+15% trade deals'] },
  { type: 'expansionist', label: 'Expansionist',
    desc: 'The frontier is where destiny is forged',
    effects: ['-35% colonization time', '+1 claim range'] },
  { type: 'diplomatic',   label: 'Diplomatic',
    desc: 'The greatest weapon is a well-placed word',
    effects: ['+40% diplomacy influence', '+15% alliance bonuses'] },
  { type: 'isolationist', label: 'Isolationist',
    desc: 'The cosmos is dangerous — home is sacred',
    effects: ['+35% defense', '-20% diplomacy'] },
];

interface TraitDef {
  id: CivTrait; label: string;
  desc: string; effect: string; positive: boolean;
}

const ALL_TRAITS: TraitDef[] = [
  // Positive
  { id: 'resilient',      positive: true,  label: 'Resilient',
    desc: 'Built to endure the harshest conditions', effect: '+20% ship HP & structure durability' },
  { id: 'industrious',    positive: true,  label: 'Industrious',
    desc: 'Tireless workers who turn stone into starships', effect: '+20% mineral production' },
  { id: 'intelligent',    positive: true,  label: 'Intelligent',
    desc: 'Naturally gifted thinkers and problem-solvers', effect: '+20% research output' },
  { id: 'entrepreneurial', positive: true, label: 'Entrepreneurial',
    desc: 'Natural traders who see opportunity everywhere', effect: '+20% credit income' },
  { id: 'populous',       positive: true,  label: 'Populous',
    desc: 'Rapid breeders who fill planets quickly', effect: '+25% population growth' },
  { id: 'swift',          positive: true,  label: 'Swift',
    desc: 'Agile fleet commanders with lightning reflexes', effect: '+20% ship speed' },
  { id: 'adaptive',       positive: true,  label: 'Adaptive',
    desc: 'Able to thrive in almost any environment', effect: 'Colonize 4 additional planet types' },
  { id: 'psychic',        positive: true,  label: 'Psychic',
    desc: 'Limited precognition and empathic abilities', effect: '+15% all diplomacy outcomes' },
  // Negative
  { id: 'fragile',    positive: false, label: 'Fragile',
    desc: 'Physically delicate — evolved in gentle conditions', effect: '-20% ship HP' },
  { id: 'wasteful',   positive: false, label: 'Wasteful',
    desc: 'Terrible resource management is in the blood', effect: '-15% all resource efficiency' },
  { id: 'xenophobic', positive: false, label: 'Xenophobic',
    desc: 'Deep-seated fear and distrust of other species', effect: '-30% diplomacy, cannot ally' },
  { id: 'sluggish',   positive: false, label: 'Sluggish',
    desc: 'Evolution favoured endurance over speed', effect: '-20% ship speed' },
  { id: 'primitive',  positive: false, label: 'Primitive',
    desc: 'Only recently reached the stars — much to learn', effect: '-20% research, start behind 1 era' },
  { id: 'hungry',     positive: false, label: 'Hungry',
    desc: 'Enormous metabolic demands drain food stockpiles', effect: '+50% food consumption' },
];

const ORIGINS: {
  type: OriginType; label: string;
  desc: string; lore: string; bonus: string;
}[] = [
  { type: 'ancient_empire',  label: 'Ancient Empire',
    desc: 'You were old when others were young',
    lore: 'Your civilization has stood for ten thousand years. Empires rose and fell as monuments to your gods crumbled and were rebuilt.',
    bonus: '+200 Research, +100 Compute at start' },
  { type: 'recent_uplift',   label: 'Recent Uplift',
    desc: 'First contact launched you into the stars',
    lore: 'An alien signal changed everything. Within two generations, your species went from chipping flint to charting nebulae.',
    bonus: '+500 Credits, +300 Minerals at start' },
  { type: 'refugee_fleet',   label: 'Refugee Fleet',
    desc: 'You fled a dying world — nothing was left behind',
    lore: 'Your home star went nova. Eleven thousand ships escaped. Now the fleet IS your civilization.',
    bonus: '+3 starting ships, mobile starting base' },
  { type: 'merchant_guild',  label: 'Merchant Guild',
    desc: 'Commerce is your religion and profit your prayer',
    lore: 'The guild predates your government by centuries. Every colony is a franchise; every war a trade dispute.',
    bonus: '+600 Credits, extra trade hub' },
  { type: 'warrior_clans',   label: 'Warrior Clans',
    desc: 'Honor is forged in battle, civilization in blood',
    lore: 'Seven clans united under one banner after centuries of war. The fighting never truly stopped — it just moved outward.',
    bonus: '+25% combat strength, war never costs morale' },
];

// ─── Draft type ───────────────────────────────────────────────────────────────

interface CivDraft {
  speciesName:   string;
  speciesType:   SpeciesType;
  primaryColor:  string;
  emblem:        string;
  homeWorldType: PlanetType;
  government:    GovernmentType;
  culturalFocus: CulturalFocus;
  traits:        CivTrait[];
  origin:        OriginType;
  motto:         string;
}

const INITIAL_DRAFT: CivDraft = {
  speciesName: '', speciesType: 'humanoid',
  primaryColor: '#4488ff', emblem: EMBLEM_DEFS[0].id,
  homeWorldType: 'continental',
  government: 'democracy', culturalFocus: 'scientific',
  traits: [], origin: 'recent_uplift', motto: '',
};

const STEPS = [
  { n: 1, label: 'SPECIES'    },
  { n: 2, label: 'APPEARANCE' },
  { n: 3, label: 'HOME WORLD' },
  { n: 4, label: 'SOCIETY'    },
  { n: 5, label: 'TRAITS'     },
  { n: 6, label: 'ORIGIN'     },
  { n: 7, label: 'REVIEW'     },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function OptionCard({
  selected, onClick, children, accent = '#4488ff',
}: { selected: boolean; onClick: () => void; children: React.ReactNode; accent?: string }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left border transition-all duration-150 p-3"
      style={{
        borderColor:  selected ? accent : '#1a1a2a',
        background:   selected ? accent + '18' : '#050510',
        boxShadow:    selected ? `0 0 12px ${accent}33` : 'none',
      }}
    >
      {children}
    </button>
  );
}

function EffectPill({ text, positive }: { text: string; positive?: boolean }) {
  return (
    <span
      className="inline-block font-mono text-[8px] px-1.5 py-0.5 border mr-1 mt-1"
      style={{
        color: positive === false ? '#ff6666' : '#44cc88',
        borderColor: positive === false ? '#441111' : '#114422',
        background: positive === false ? '#1a0808' : '#081a10',
      }}
    >
      {text}
    </span>
  );
}

// Live preview card shown on the right
function CivPreviewCard({ draft }: { draft: CivDraft }) {
  const species = SPECIES_DATA.find(s => s.type === draft.speciesType);
  const gov     = GOVERNMENTS.find(g => g.type === draft.government);
  const focus   = CULTURAL_FOCUSES.find(f => f.type === draft.culturalFocus);
  const posTraits = ALL_TRAITS.filter(t => draft.traits.includes(t.id) && t.positive);
  const negTraits = ALL_TRAITS.filter(t => draft.traits.includes(t.id) && !t.positive);
  const hw      = HOME_WORLDS.find(w => w.type === draft.homeWorldType);
  const origin  = ORIGINS.find(o => o.type === draft.origin);

  return (
    <div
      className="flex flex-col h-full border font-mono"
      style={{ borderColor: draft.primaryColor + '44', background: '#030308' }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center gap-3 flex-shrink-0"
        style={{ background: draft.primaryColor + '18', borderBottom: `1px solid ${draft.primaryColor}33` }}
      >
        <EmblemCanvas emblemId={draft.emblem} color={draft.primaryColor} size={44} />
        <div>
          <div className="font-pixel text-[13px]" style={{ color: draft.primaryColor }}>
            {draft.speciesName || '???'}
          </div>
          <div className="text-[10px] text-[#4a6a7a]">
            {species?.label ?? '—'} · {gov?.label ?? '—'}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3 scrollable">
        {/* Species icon blob */}
        <div
          className="flex items-center justify-center rounded-sm"
          style={{ height: 90, background: draft.primaryColor + '10', border: `1px solid ${draft.primaryColor}22` }}
        >
          {species
            ? <PixelIcon id={species.type} color={draft.primaryColor} size={64} />
            : <span className="text-[#2a3a4a] font-pixel text-[20px]">?</span>
          }
        </div>

        {/* Lore snippet */}
        {species && (
          <p className="text-[9px] text-[#4a6070] italic leading-relaxed">{species.lore}</p>
        )}

        {/* Divider row */}
        <div className="border-t border-[#1a1a2a]" />

        <div className="flex flex-col gap-1.5 text-[10px]">
          <Row label="Home World" value={hw?.label ?? '—'} dot={hw?.color} />
          <Row label="Government" value={gov?.label ?? '—'} />
          <Row label="Culture"    value={focus?.label ?? '—'} />
          <Row label="Origin"     value={origin?.label ?? '—'} />
        </div>

        {/* Traits */}
        {draft.traits.length > 0 && (
          <div>
            <div className="font-pixel text-[8px] text-[#3a5a6a] mb-1">TRAITS</div>
            <div className="flex flex-wrap gap-1">
              {posTraits.map(t => (
                <span key={t.id} className="flex items-center gap-1 font-pixel text-[8px] px-1.5 py-0.5 border border-[#1a3a2a] bg-[#081a10]" style={{ color: '#44cc88' }}>
                  <PixelIcon id={t.id} color="#44cc88" size={9} />{t.label}
                </span>
              ))}
              {negTraits.map(t => (
                <span key={t.id} className="flex items-center gap-1 font-pixel text-[8px] px-1.5 py-0.5 border border-[#3a1a1a] bg-[#1a0808]" style={{ color: '#ff6666' }}>
                  <PixelIcon id={t.id} color="#ff6666" size={9} />{t.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Motto */}
        {draft.motto && (
          <div
            className="text-[9px] italic text-center py-2 px-3"
            style={{ color: draft.primaryColor + 'cc', borderTop: `1px solid ${draft.primaryColor}22` }}
          >
            "{draft.motto}"
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, dot }: { label: string; value: string; dot?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[#3a5a6a]">{label}</span>
      <span className="flex items-center gap-1.5 text-[#8aa0b0]">
        {dot && <span className="inline-block w-2 h-2 rounded-full" style={{ background: dot }} />}
        {value}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CivilizationCreator({
  onComplete, onCancel, initialCiv,
}: {
  onComplete: (civ: Civilization) => void;
  onCancel:   () => void;
  initialCiv?: Civilization;
}) {
  const [step,  setStep]  = useState(1);
  const [draft, setDraft] = useState<CivDraft>(initialCiv ? {
    speciesName:   initialCiv.speciesName,
    speciesType:   initialCiv.speciesType,
    primaryColor:  initialCiv.primaryColor,
    emblem:        EMBLEM_DEFS.some(e => e.id === initialCiv.emblem) ? initialCiv.emblem : EMBLEM_DEFS[0].id,
    homeWorldType: initialCiv.homeWorldType,
    government:    initialCiv.government,
    culturalFocus: initialCiv.culturalFocus,
    traits:        initialCiv.traits,
    origin:        initialCiv.origin,
    motto:         initialCiv.motto,
  } : { ...INITIAL_DRAFT });

  const up = (patch: Partial<CivDraft>) => setDraft(d => ({ ...d, ...patch }));

  const canNext = (): boolean => {
    if (step === 1) return draft.speciesName.trim().length >= 2;
    if (step === 5) {
      const pos = ALL_TRAITS.filter(t => draft.traits.includes(t.id) &&  t.positive).length;
      const neg = ALL_TRAITS.filter(t => draft.traits.includes(t.id) && !t.positive).length;
      return pos === 2 && neg === 1;
    }
    return true;
  };

  const toggleTrait = (id: CivTrait) => {
    const trait    = ALL_TRAITS.find(t => t.id === id)!;
    const current  = draft.traits;
    const isOn     = current.includes(id);
    const posCount = current.filter(t => ALL_TRAITS.find(x => x.id === t)?.positive).length;
    const negCount = current.filter(t => !ALL_TRAITS.find(x => x.id === t)?.positive).length;

    if (isOn) {
      up({ traits: current.filter(t => t !== id) });
    } else {
      if (trait.positive  && posCount >= 2) return;
      if (!trait.positive && negCount >= 1) return;
      up({ traits: [...current, id] });
    }
  };

  const finish = () => {
    if (!canNext()) return;
    onComplete({
      speciesName:   draft.speciesName.trim(),
      speciesType:   draft.speciesType,
      primaryColor:  draft.primaryColor,
      emblem:        draft.emblem,
      homeWorldType: draft.homeWorldType,
      government:    draft.government,
      culturalFocus: draft.culturalFocus,
      traits:        draft.traits,
      origin:        draft.origin,
      motto:         draft.motto.trim(),
    });
  };

  // ── Step content ────────────────────────────────────────────────────────────

  const renderStep = () => {
    switch (step) {

      /* ── 1. Species ─────────────────────────────────────────────── */
      case 1: return (
        <div className="flex flex-col gap-4">
          <StepHeader
            title="Who Are You?"
            sub="Name your species and choose what kind of beings inhabit your civilization."
          />
          <div className="flex flex-col gap-2">
            <label className="font-pixel text-[9px] text-[#5a7a8a]">SPECIES NAME</label>
            <input
              value={draft.speciesName}
              onChange={e => up({ speciesName: e.target.value })}
              placeholder="e.g. Zar'keth, The Verath, Nexus-7…"
              maxLength={30}
              className="bg-[#050510] border border-[#1a2a3a] text-[#c0d0e0] font-mono text-sm px-3 py-2 focus:outline-none focus:border-accent-cyan w-full"
            />
            {draft.speciesName.trim().length < 2 && (
              <span className="text-[9px] text-[#3a5a6a]">At least 2 characters required</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {SPECIES_DATA.map(s => (
              <OptionCard
                key={s.type}
                selected={draft.speciesType === s.type}
                onClick={() => up({ speciesType: s.type })}
                accent={s.color}
              >
                <div className="flex items-center gap-2 mb-1">
                  <PixelIcon id={s.type} color={s.color} size={18} />
                  <span className="font-pixel text-[9px]" style={{ color: s.color }}>{s.label}</span>
                </div>
                <p className="text-[9px] text-[#4a6070] leading-relaxed mb-1">{s.desc}</p>
                <div className="flex flex-wrap">
                  {s.effects.map(e => <EffectPill key={e} text={e} />)}
                </div>
              </OptionCard>
            ))}
          </div>
        </div>
      );

      /* ── 2. Appearance ──────────────────────────────────────────── */
      case 2: return (
        <div className="flex flex-col gap-4">
          <StepHeader
            title="How Do You Appear?"
            sub="Choose your empire's primary color and symbolic emblem."
          />

          <div>
            <label className="font-pixel text-[9px] text-[#5a7a8a] block mb-2">PRIMARY COLOR</label>
            <div className="grid grid-cols-8 gap-1.5">
              {COLOR_PALETTE.map(c => (
                <button
                  key={c}
                  onClick={() => up({ primaryColor: c })}
                  className="h-8 w-full border-2 transition-all"
                  style={{
                    background:   c,
                    borderColor:  draft.primaryColor === c ? '#ffffff' : 'transparent',
                    boxShadow:    draft.primaryColor === c ? `0 0 8px ${c}` : 'none',
                    transform:    draft.primaryColor === c ? 'scale(1.15)' : 'scale(1)',
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="font-pixel text-[9px] text-[#5a7a8a] block mb-2">EMBLEM / SYMBOL</label>
            <div className="grid grid-cols-7 gap-1.5">
              {EMBLEM_DEFS.map(e => (
                <button
                  key={e.id}
                  onClick={() => up({ emblem: e.id })}
                  title={e.label}
                  className="h-12 flex items-center justify-center border transition-all"
                  style={{
                    borderColor: draft.emblem === e.id ? draft.primaryColor : '#1a1a2a',
                    background:  draft.emblem === e.id ? draft.primaryColor + '22' : '#050510',
                    boxShadow:   draft.emblem === e.id ? `0 0 8px ${draft.primaryColor}44` : 'none',
                  }}
                >
                  <EmblemCanvas
                    emblemId={e.id}
                    color={draft.emblem === e.id ? draft.primaryColor : '#4a6a7a'}
                    size={28}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 border border-[#1a1a2a] bg-[#050510]">
            <div
              className="w-16 h-16 flex items-center justify-center border-2"
              style={{ borderColor: draft.primaryColor, boxShadow: `0 0 16px ${draft.primaryColor}44` }}
            >
              <EmblemCanvas emblemId={draft.emblem} color={draft.primaryColor} size={48} />
            </div>
            <div>
              <div className="font-pixel text-[10px]" style={{ color: draft.primaryColor }}>
                {draft.speciesName || '???'}
              </div>
              <div className="font-mono text-[9px] text-[#4a6a7a] mt-1">Your empire flag preview</div>
            </div>
          </div>
        </div>
      );

      /* ── 3. Home World ──────────────────────────────────────────── */
      case 3: return (
        <div className="flex flex-col gap-4">
          <StepHeader
            title="Where Do You Come From?"
            sub="Your home world shaped your biology, culture, and strengths."
          />
          <div className="grid grid-cols-2 gap-2">
            {HOME_WORLDS.map(w => (
              <OptionCard
                key={w.type}
                selected={draft.homeWorldType === w.type}
                onClick={() => up({ homeWorldType: w.type })}
                accent={w.color}
              >
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full flex-shrink-0 border border-white/10" style={{ background: w.color }} />
                  <div>
                    <div className="font-pixel text-[9px]" style={{ color: w.color }}>{w.label}</div>
                    <div className="text-[8px] text-[#4a6070]">{w.desc}</div>
                  </div>
                </div>
              </OptionCard>
            ))}
          </div>
        </div>
      );

      /* ── 4. Society ─────────────────────────────────────────────── */
      case 4: return (
        <div className="flex flex-col gap-4">
          <StepHeader
            title="How Do You Rule?"
            sub="Your government and cultural focus define how your civilization grows."
          />

          <div>
            <label className="font-pixel text-[9px] text-[#5a7a8a] block mb-2">GOVERNMENT</label>
            <div className="grid grid-cols-2 gap-2">
              {GOVERNMENTS.map(g => (
                <OptionCard
                  key={g.type}
                  selected={draft.government === g.type}
                  onClick={() => up({ government: g.type })}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <PixelIcon id={g.type} color={draft.government === g.type ? '#c0d0e0' : '#5a7a8a'} size={14} />
                    <span className="font-pixel text-[9px] text-[#c0d0e0]">{g.label}</span>
                  </div>
                  <p className="text-[8px] text-[#4a6070] mb-1">{g.desc}</p>
                  <div className="flex flex-wrap">
                    {g.effects.map(e => <EffectPill key={e} text={e} />)}
                  </div>
                </OptionCard>
              ))}
            </div>
          </div>

          <div>
            <label className="font-pixel text-[9px] text-[#5a7a8a] block mb-2">CULTURAL FOCUS</label>
            <div className="grid grid-cols-2 gap-2">
              {CULTURAL_FOCUSES.map(f => (
                <OptionCard
                  key={f.type}
                  selected={draft.culturalFocus === f.type}
                  onClick={() => up({ culturalFocus: f.type })}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <PixelIcon id={f.type} color={draft.culturalFocus === f.type ? '#c0d0e0' : '#5a7a8a'} size={14} />
                    <span className="font-pixel text-[9px] text-[#c0d0e0]">{f.label}</span>
                  </div>
                  <p className="text-[8px] text-[#4a6070] mb-1">{f.desc}</p>
                  <div className="flex flex-wrap">
                    {f.effects.map(e => <EffectPill key={e} text={e} />)}
                  </div>
                </OptionCard>
              ))}
            </div>
          </div>
        </div>
      );

      /* ── 5. Traits ──────────────────────────────────────────────── */
      case 5: {
        const pos = ALL_TRAITS.filter(t => draft.traits.includes(t.id) &&  t.positive).length;
        const neg = ALL_TRAITS.filter(t => draft.traits.includes(t.id) && !t.positive).length;
        return (
          <div className="flex flex-col gap-4">
            <StepHeader
              title="Strengths & Burdens"
              sub="Choose 2 positive traits and 1 negative trait that define your species."
            />
            <div className="flex gap-4 font-pixel text-[9px]">
              <span style={{ color: pos === 2 ? '#44cc88' : '#4a6a7a' }}>STRENGTHS {pos}/2</span>
              <span style={{ color: neg === 1 ? '#ff6666' : '#4a6a7a' }}>BURDENS {neg}/1</span>
            </div>

            <div>
              <div className="font-pixel text-[8px] text-[#3a8a5a] mb-2">STRENGTHS (pick 2)</div>
              <div className="grid grid-cols-2 gap-1.5">
                {ALL_TRAITS.filter(t => t.positive).map(t => {
                  const sel = draft.traits.includes(t.id);
                  const maxed = !sel && pos >= 2;
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggleTrait(t.id)}
                      disabled={maxed}
                      className="text-left p-2 border transition-all disabled:opacity-40"
                      style={{
                        borderColor: sel ? '#44cc88' : '#1a2a1a',
                        background:  sel ? '#083a18' : '#050510',
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <PixelIcon id={t.id} color={sel ? '#44cc88' : '#4a6a7a'} size={12} />
                        <span className="font-pixel text-[8px]" style={{ color: sel ? '#44cc88' : '#8aa0b0' }}>{t.label}</span>
                      </div>
                      <p className="text-[8px] text-[#3a5a4a] mt-0.5">{t.effect}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="font-pixel text-[8px] text-[#8a3a3a] mb-2">BURDEN (pick 1)</div>
              <div className="grid grid-cols-2 gap-1.5">
                {ALL_TRAITS.filter(t => !t.positive).map(t => {
                  const sel = draft.traits.includes(t.id);
                  const maxed = !sel && neg >= 1;
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggleTrait(t.id)}
                      disabled={maxed}
                      className="text-left p-2 border transition-all disabled:opacity-40"
                      style={{
                        borderColor: sel ? '#cc4444' : '#2a1a1a',
                        background:  sel ? '#2a0808' : '#050510',
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <PixelIcon id={t.id} color={sel ? '#ff6666' : '#6a4a4a'} size={12} />
                        <span className="font-pixel text-[8px]" style={{ color: sel ? '#ff6666' : '#8aa0b0' }}>{t.label}</span>
                      </div>
                      <p className="text-[8px] text-[#5a3a3a] mt-0.5">{t.effect}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      }

      /* ── 6. Origin & Motto ──────────────────────────────────────── */
      case 6: return (
        <div className="flex flex-col gap-4">
          <StepHeader
            title="Your Origin Story"
            sub="Where did your civilization begin its journey to the stars?"
          />
          <div className="flex flex-col gap-2">
            {ORIGINS.map(o => (
              <OptionCard
                key={o.type}
                selected={draft.origin === o.type}
                onClick={() => up({ origin: o.type })}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <PixelIcon id={o.type} color={draft.origin === o.type ? '#c0d0e0' : '#5a7a8a'} size={20} />
                  </div>
                  <div className="flex-1">
                    <div className="font-pixel text-[9px] text-[#c0d0e0] mb-1">{o.label}</div>
                    <p className="text-[9px] text-[#4a6070] italic mb-2 leading-relaxed">{o.lore}</p>
                    <div className="font-pixel text-[8px] text-[#44cc88]">▸ {o.bonus}</div>
                  </div>
                </div>
              </OptionCard>
            ))}
          </div>

          <div>
            <label className="font-pixel text-[9px] text-[#5a7a8a] block mb-2">
              CIVILIZATION MOTTO <span className="text-[#2a3a4a]">(optional)</span>
            </label>
            <input
              value={draft.motto}
              onChange={e => up({ motto: e.target.value })}
              placeholder={`"From dust we rose; to stars we reach"`}
              maxLength={60}
              className="bg-[#050510] border border-[#1a2a3a] text-[#c0d0e0] font-mono text-sm px-3 py-2 focus:outline-none focus:border-accent-cyan w-full italic"
            />
          </div>
        </div>
      );

      /* ── 7. Review ──────────────────────────────────────────────── */
      case 7: {
        const species  = SPECIES_DATA.find(s => s.type === draft.speciesType);
        const gov      = GOVERNMENTS.find(g => g.type === draft.government);
        const focus    = CULTURAL_FOCUSES.find(f => f.type === draft.culturalFocus);
        const origin   = ORIGINS.find(o => o.type === draft.origin);
        const posTraits = ALL_TRAITS.filter(t => draft.traits.includes(t.id) &&  t.positive);
        const negTraits = ALL_TRAITS.filter(t => draft.traits.includes(t.id) && !t.positive);
        const hw       = HOME_WORLDS.find(w => w.type === draft.homeWorldType);

        return (
          <div className="flex flex-col gap-4">
            <StepHeader title="Final Review" sub="Confirm your civilization before entering the stars." />

            <div className="border border-[#1a1a2a] bg-[#030308]">
              {/* Banner */}
              <div className="flex items-center gap-3 p-4 border-b border-[#1a1a2a]"
                style={{ background: draft.primaryColor + '14' }}>
                <EmblemCanvas emblemId={draft.emblem} color={draft.primaryColor} size={48} />
                <div>
                  <div className="font-pixel text-[14px]" style={{ color: draft.primaryColor }}>
                    {draft.speciesName}
                  </div>
                  <div className="font-mono text-[10px] text-[#4a6a7a]">
                    {species?.label} · {gov?.label}
                  </div>
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-0 border-b border-[#1a1a2a]">
                <Stat label="Home World"  value={hw?.label ?? '—'} />
                <Stat label="Culture"     value={focus?.label ?? '—'} />
                <Stat label="Origin"      value={origin?.label ?? '—'} />
                <Stat label="Species"     value={species?.label ?? '—'} />
              </div>

              {/* Traits */}
              <div className="p-3">
                <div className="font-pixel text-[8px] text-[#3a5a6a] mb-2">TRAITS</div>
                <div className="flex flex-wrap gap-1.5">
                  {posTraits.map(t => (
                    <span key={t.id} className="flex items-center gap-1 font-pixel text-[8px] px-2 py-1 border border-[#1a3a2a] bg-[#081a10] text-[#44cc88]">
                      <PixelIcon id={t.id} color="#44cc88" size={9} />{t.label}
                    </span>
                  ))}
                  {negTraits.map(t => (
                    <span key={t.id} className="flex items-center gap-1 font-pixel text-[8px] px-2 py-1 border border-[#3a1a1a] bg-[#1a0808] text-[#ff6666]">
                      <PixelIcon id={t.id} color="#ff6666" size={9} />{t.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Bonus */}
              {origin && (
                <div className="px-3 pb-3">
                  <div className="font-pixel text-[8px] text-[#44cc88]">▸ Starting Bonus: {origin.bonus}</div>
                </div>
              )}

              {/* Species effects */}
              {species && (
                <div className="px-3 pb-3 border-t border-[#1a1a2a] pt-3">
                  <div className="font-pixel text-[8px] text-[#3a5a6a] mb-1">SPECIES BONUSES</div>
                  <div className="flex flex-wrap">
                    {species.effects.map(e => <EffectPill key={e} text={e} />)}
                  </div>
                </div>
              )}

              {/* Motto */}
              {draft.motto && (
                <div className="px-4 py-3 border-t border-[#1a1a2a]">
                  <p className="font-mono text-[10px] italic text-center" style={{ color: draft.primaryColor + 'aa' }}>
                    "{draft.motto}"
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      }

      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#020208] overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#1a1a3a] bg-[#030310] flex-shrink-0">
        <div className="font-pixel text-[11px]" style={{ color: draft.primaryColor }}>
          CIVILIZATION CREATOR
        </div>
        <button onClick={onCancel} className="font-pixel text-[8px] text-[#3a4a5a] hover:text-[#6a8a9a]">
          CANCEL
        </button>
      </div>

      {/* Step indicator */}
      <div className="flex items-center px-6 py-2 gap-1 border-b border-[#1a1a2a] flex-shrink-0 overflow-x-auto">
        {STEPS.map((s, i) => {
          const done = step > s.n;
          const curr = step === s.n;
          return (
            <div key={s.n} className="flex items-center gap-1 flex-shrink-0">
              <div
                className="font-pixel text-[7px] px-2 py-1 border transition-all"
                style={{
                  borderColor: curr ? draft.primaryColor : done ? '#2a4a3a' : '#1a1a2a',
                  color:       curr ? draft.primaryColor : done ? '#44aa66' : '#2a3a4a',
                  background:  curr ? draft.primaryColor + '18' : 'transparent',
                }}
              >
                {done ? '✓' : s.n} {s.label}
              </div>
              {i < STEPS.length - 1 && (
                <div className="text-[#1a2a2a] text-[10px]">▸</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: step content */}
        <div className="flex-1 overflow-y-auto p-6 scrollable">
          {renderStep()}
        </div>

        {/* Right: live preview */}
        <div className="w-72 flex-shrink-0 border-l border-[#1a1a2a] overflow-hidden flex flex-col">
          <div className="font-pixel text-[8px] text-[#2a3a4a] px-3 py-2 border-b border-[#1a1a2a] flex-shrink-0">
            LIVE PREVIEW
          </div>
          <div className="flex-1 overflow-hidden">
            <CivPreviewCard draft={draft} />
          </div>
        </div>
      </div>

      {/* Bottom nav */}
      <div className="flex items-center justify-between px-6 py-3 border-t border-[#1a1a3a] bg-[#030310] flex-shrink-0">
        <button
          onClick={() => setStep(s => Math.max(1, s - 1) as any)}
          disabled={step === 1}
          className="btn-gray text-[9px] px-4 disabled:opacity-30"
        >
          ← BACK
        </button>

        <div className="font-pixel text-[9px] text-[#2a3a4a]">
          {step} / {STEPS.length}
        </div>

        {step < STEPS.length ? (
          <button
            onClick={() => { if (canNext()) setStep(s => (s + 1) as any); }}
            disabled={!canNext()}
            className="btn-cyan text-[9px] px-4 disabled:opacity-40"
          >
            NEXT →
          </button>
        ) : (
          <button
            onClick={finish}
            className="font-pixel text-[9px] px-6 py-2 border-2 transition-all"
            style={{
              borderColor: draft.primaryColor,
              color:        draft.primaryColor,
              background:   draft.primaryColor + '22',
              boxShadow:    `0 0 16px ${draft.primaryColor}44`,
            }}
          >
            FORGE CIVILIZATION ✦
          </button>
        )}
      </div>
    </div>
  );
}

function StepHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-2">
      <h2 className="font-pixel text-[13px] text-[#c0d0e0] mb-1">{title}</h2>
      <p className="font-mono text-[10px] text-[#4a6a7a]">{sub}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2 border-r border-b border-[#1a1a2a] font-mono text-[10px]">
      <div className="text-[#3a5a6a] text-[8px]">{label}</div>
      <div className="text-[#8aa0b0]">{value}</div>
    </div>
  );
}
