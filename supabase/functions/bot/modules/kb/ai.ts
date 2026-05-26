import { getConfig } from '../../core/config.ts';
import type { SupabaseClient } from '../../core/types.ts';

const OPENAI_API = 'https://api.openai.com/v1';

async function apiKey(db: SupabaseClient): Promise<string> {
  const key = await getConfig(db, 'OPENAI_API_KEY');
  if (!key) throw new Error('OPENAI_API_KEY not set');
  return key;
}

export async function generateEmbedding(db: SupabaseClient, text: string): Promise<number[]> {
  const res = await fetch(`${OPENAI_API}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await apiKey(db)}` },
    body: JSON.stringify({ input: text, model: 'text-embedding-3-small' }),
  });

  if (!res.ok) throw new Error(`Embeddings API ${res.status}: ${await res.text()}`);
  const json = await res.json() as { data: Array<{ embedding: number[] }> };
  return json.data[0].embedding;
}

export async function chatCompletion(db: SupabaseClient, systemPrompt: string, userMessage: string): Promise<string> {
  const res = await fetch(`${OPENAI_API}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await apiKey(db)}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 800,
      temperature: 0.3,
    }),
  });

  if (!res.ok) throw new Error(`ChatCompletion API ${res.status}: ${await res.text()}`);
  const json = await res.json() as {
    choices: Array<{ message: { content: string } }>;
    usage?: { total_tokens: number };
  };
  return json.choices[0].message.content.trim();
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}
