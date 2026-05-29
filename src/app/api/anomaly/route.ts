import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TEXT_MODEL  = process.env.GEMINI_TEXT_MODEL  ?? 'gemini-3.1-flash-lite';
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL ?? 'imagen-4.0-fast-generate-001';

type Outcomes = Partial<Record<'credits' | 'minerals' | 'energy' | 'research' | 'compute' | 'food' | 'population', number>>;

// Keep AI-suggested resource swings inside sane gameplay bounds.
function clampOutcomes(raw: unknown): Outcomes {
  const out: Outcomes = {};
  if (!raw || typeof raw !== 'object') return out;
  const keys = ['credits', 'minerals', 'energy', 'research', 'compute', 'food', 'population'] as const;
  for (const k of keys) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === 'number' && isFinite(v)) {
      out[k] = Math.round(Math.max(-250, Math.min(600, v)));
    }
  }
  return out;
}

async function generateText(apiKey: string, prompt: string) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 1.0,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          anomaly_image_generation_prompt: { type: 'STRING' },
          anomaly_text: { type: 'STRING' },
          outcomes: {
            type: 'OBJECT',
            properties: {
              credits:    { type: 'NUMBER' },
              minerals:   { type: 'NUMBER' },
              energy:     { type: 'NUMBER' },
              research:   { type: 'NUMBER' },
              compute:    { type: 'NUMBER' },
              food:       { type: 'NUMBER' },
              population: { type: 'NUMBER' },
              summary:    { type: 'STRING' },
            },
          },
        },
        required: ['anomaly_image_generation_prompt', 'anomaly_text', 'outcomes'],
      },
    },
  };

  const res = await fetch(`${API_BASE}/${TEXT_MODEL}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`text ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('no text in response');
  return JSON.parse(text) as { anomaly_image_generation_prompt?: string; anomaly_text?: string; outcomes?: unknown };
}

async function generateImage(apiKey: string, prompt: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/${IMAGE_MODEL}:predict?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        // Request compressed JPEG so the data URL fits inside a Firestore doc (~1MB).
        parameters: {
          sampleCount: 1,
          aspectRatio: '4:3',
          outputOptions: { mimeType: 'image/jpeg', compressionQuality: 55 },
        },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const pred = data?.predictions?.[0];
    const b64 = pred?.bytesBase64Encoded;
    if (!b64) return null;
    const mime = pred?.mimeType ?? 'image/jpeg';
    const dataUrl = `data:${mime};base64,${b64}`;
    // Safety: drop anything that would blow the Firestore 1MB document cap.
    return dataUrl.length > 950_000 ? null : dataUrl;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  const { anomalyType, flavor, systemName, planetName, planetType } = await req.json().catch(() => ({}));

  if (!apiKey) {
    return NextResponse.json({ aiUsed: false, error: 'GEMINI_API_KEY not configured' }, { status: 200 });
  }

  const prompt = `You are the narrative engine for a pixel-art 4X space-strategy game called Galaxia.
A survey team is investigating a space anomaly during interstellar exploration.

Anomaly type: ${anomalyType ?? 'unknown'}${flavor ? ` (${flavor})` : ''}
Location: planet "${planetName ?? 'an unnamed world'}" (${planetType ?? 'unknown type'}) in the "${systemName ?? 'an uncharted'}" system.

Produce:
1. "anomaly_text": a vivid, self-contained discovery report of 2-4 sentences. Sci-fi tone, evocative, specific to this anomaly type and world.
2. "anomaly_image_generation_prompt": a concise vivid prompt for a 4:3 sci-fi illustration of this scene/discovery. Cinematic, detailed, NO text or words in the image.
3. "outcomes": resource changes the empire gains or loses from this discovery. Use any of: credits, minerals, energy, research, compute, food, population. Values may be positive or negative. Keep magnitudes modest and balanced (roughly -200 to +500). Include a short "summary" describing the reward/cost. Most anomalies should be net positive but interesting ones can carry a cost.`;

  try {
    const result = await generateText(apiKey, prompt);
    const imagePrompt = result.anomaly_image_generation_prompt ?? '';
    const image = imagePrompt ? await generateImage(apiKey, imagePrompt) : null;
    const outcomesRaw = (result.outcomes ?? {}) as Record<string, unknown>;
    return NextResponse.json({
      aiUsed: true,
      text: result.anomaly_text ?? '',
      imagePrompt,
      imageDataUrl: image,
      outcomes: clampOutcomes(outcomesRaw),
      summary: typeof outcomesRaw.summary === 'string' ? outcomesRaw.summary : '',
    });
  } catch (e) {
    return NextResponse.json({ aiUsed: false, error: String(e) }, { status: 200 });
  }
}
