import { getConfig } from './config.ts';
import type { SupabaseClient } from './types.ts';

export type NlpResult =
  | { intent: 'create_task'; title: string; due_at: string | null }
  | { intent: 'create_note'; content: string }
  | { intent: 'set_reminder'; text: string; remind_at: string }
  | { intent: 'list_tasks' }
  | { intent: 'list_notes' }
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

  const system = `You are an intent parser for a task-management bot. Current UTC time: ${nowIso}.
Classify the user message and extract parameters. Return JSON only — no markdown, no explanation.

Return exactly one of:
{"intent":"create_task","title":"<concise task title>","due_at":"<ISO 8601 UTC datetime or null>"}
{"intent":"create_note","content":"<text to save>"}
{"intent":"set_reminder","text":"<reminder message>","remind_at":"<ISO 8601 UTC datetime>"}
{"intent":"list_tasks"}
{"intent":"list_notes"}
{"intent":"search","query":"<search terms>"}
{"intent":"kb_ask","question":"<the question>"}
{"intent":"unknown"}

Classification rules:
- create_task: user wants to create/add a task. Resolve relative dates (e.g. "next Friday 09:00 UTC").
- create_note: user saves information, thoughts, prices, contacts — words like "save", "note", "записать", "запомни".
- set_reminder: user wants a timed notification. "remind me in 2 hours" → compute remind_at from now.
- list_tasks: user asks to see/show tasks. "покажи задачи", "what are my tasks".
- list_notes: user asks to see notes. "покажи заметки", "show my notes".
- search: user asks to find/search something specific. "найди задачу про максима".
- kb_ask: user asks a question expecting an answer from the knowledge base. "как оформить акт?".
- unknown: greetings, questions about the bot itself, unrecognizable input.`;

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
