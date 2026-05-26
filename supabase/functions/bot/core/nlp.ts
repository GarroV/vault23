import { getConfig } from './config.ts';
import type { SupabaseClient } from './types.ts';

export interface NlpRecurrence {
  type: 'daily' | 'weekly' | 'monthly' | 'interval';
  weekday?: number;
  day?: number;
  days?: number;
}

export type NlpResult =
  | { intent: 'create_item'; content: string; due_at: string | null; assignee: string | null; recurrence?: NlpRecurrence | null }
  | { intent: 'list_items' }
  | { intent: 'search'; query: string }
  | { intent: 'kb_ask'; question: string }
  | { intent: 'unknown' };

export async function parseDateTime(
  db: SupabaseClient,
  text: string,
  nowIso: string,
): Promise<string | null> {
  const apiKey = await getConfig(db, 'OPENAI_API_KEY');
  if (!apiKey) return null;

  const system = `Convert the user's date/time expression to an ISO 8601 UTC datetime string. Current UTC time: ${nowIso}.
Return JSON only: {"iso":"<ISO 8601 UTC>"} or {"iso":null} if not parseable.
No markdown, no explanation. Examples:
- "пятница" → next Friday at 09:00 UTC
- "25 мая" → May 25 at 09:00 UTC (current year)
- "завтра 10:00" → tomorrow at 10:00 UTC
- "через 2 часа" → now + 2 hours`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: text },
        ],
        max_tokens: 60,
        temperature: 0,
      }),
    });
    if (!res.ok) return null;
    const json = await res.json() as { choices: Array<{ message: { content: string } }> };
    const raw = json.choices[0]?.message?.content?.trim() ?? '';
    const parsed = JSON.parse(raw) as { iso: string | null };
    return parsed.iso ?? null;
  } catch {
    return null;
  }
}

export async function parseNaturalLanguage(
  db: SupabaseClient,
  text: string,
  nowIso: string,
): Promise<NlpResult> {
  const apiKey = await getConfig(db, 'OPENAI_API_KEY');
  if (!apiKey) return { intent: 'unknown' };

  const system = `You are an intent parser for a personal assistant bot. Current UTC time: ${nowIso}.
Classify the user message and extract parameters. Return JSON only — no markdown, no explanation.

Return exactly one of:
{"intent":"create_item","content":"<the text to save>","due_at":"<ISO 8601 UTC or null>","assignee":"<person name or null>","recurrence":<recurrence or null>}
{"intent":"list_items"}
{"intent":"search","query":"<search terms>"}
{"intent":"kb_ask","question":"<the question>"}
{"intent":"unknown"}

Recurrence format (use null if not recurring):
{"type":"monthly","day":5}        — every month on day 5
{"type":"weekly","weekday":5}     — every week on Friday (0=Sun,1=Mon,...,6=Sat)
{"type":"daily"}                  — every day
{"type":"interval","days":14}     — every 14 days

Rules:
- create_item: anything the user wants to save, remember, do, or be reminded about. Tasks, notes, reminders, ideas — all become items. Extract due_at for any deadline or time mention. Extract assignee if a person is mentioned as the doer (e.g. "→ Ivan", "поручить Максу", "Ivan should do").
- list_items: user wants to see their list. "покажи задачи", "what do I have", "show my list".
- search: user wants to find something specific. "найди задачу про максима".
- kb_ask: user asks a question expecting an answer from the knowledge base.
- unknown: greetings, bot questions, unrecognizable input.`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: text },
        ],
        max_tokens: 150,
        temperature: 0,
      }),
    });

    if (!res.ok) return { intent: 'unknown' };

    const json = await res.json() as { choices: Array<{ message: { content: string } }> };
    const raw = json.choices[0]?.message?.content?.trim() ?? '';
    const result = JSON.parse(raw) as NlpResult;
    return result;
  } catch {
    return { intent: 'unknown' };
  }
}
