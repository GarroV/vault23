import type { BotContext, ModuleResult } from '../../core/types.ts';
import {
  createKbEntry,
  approveKbEntry,
  rejectKbEntry,
  getKbEntryById,
  getApprovedEntries,
  searchKbFts,
} from './queries.ts';
import { generateEmbedding, chatCompletion, cosineSimilarity } from './ai.ts';
import { trackUsage } from '../../core/usage.ts';

// --- /addkb flow ---

export async function handleAddKbCommand(ctx: BotContext): Promise<ModuleResult> {
  await ctx.reply(ctx.t('ask_kb_title'));
  return { ok: true, session: { state: 'kb_awaiting_title', data: {} } };
}

export async function handleKbTitleInput(ctx: BotContext): Promise<ModuleResult> {
  const title = ctx.event.text?.trim() ?? '';
  if (!title) {
    await ctx.reply(ctx.t('error_empty_kb_title'));
    return { ok: false };
  }
  await ctx.reply(ctx.t('ask_kb_content'));
  return { ok: true, session: { state: 'kb_awaiting_content', data: { title } } };
}

export async function handleKbContentInput(ctx: BotContext): Promise<ModuleResult> {
  const content = ctx.event.text?.trim() ?? '';
  const title = ctx.session.data.title as string | undefined;

  if (!content || !title) {
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }

  try {
    const entryId = await createKbEntry(ctx.db, ctx.user.workspaceId, title, content);
    const preview = content.length > 300 ? `${content.slice(0, 300)}…` : content;

    await ctx.replyWithButtons(
      ctx.t('kb_review_prompt', { title, preview }),
      [[
        { text: ctx.t('kb_btn_approve'), callbackData: `kb_approve:${entryId}` },
        { text: ctx.t('kb_btn_reject'), callbackData: `kb_reject:${entryId}` },
      ]],
    );
    return { ok: true, clearSession: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[kb] handleKbContentInput error', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

// --- Review gate (7.6) ---

export async function handleKbApprove(ctx: BotContext): Promise<ModuleResult> {
  const entryId = ctx.event.callbackData?.split(':')[1];
  if (!entryId) {
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }

  try {
    const entry = await getKbEntryById(ctx.db, ctx.user.workspaceId, entryId);
    if (!entry) {
      await ctx.reply(ctx.t('kb_not_found'));
      return { ok: false, clearSession: true };
    }

    const embedding = await generateEmbedding(ctx.db, `${entry.title}\n${entry.content}`);
    await approveKbEntry(ctx.db, ctx.user.workspaceId, entryId, embedding);
    trackUsage(ctx.db, ctx.user.workspaceId, 'embedding', 'text-embedding-3-small', 1).catch(() => {});

    await ctx.reply(ctx.t('kb_approved', { title: entry.title }));
    return { ok: true, clearSession: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[kb] handleKbApprove error', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

export async function handleKbReject(ctx: BotContext): Promise<ModuleResult> {
  const entryId = ctx.event.callbackData?.split(':')[1];
  if (!entryId) {
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }

  try {
    await rejectKbEntry(ctx.db, ctx.user.workspaceId, entryId);
    await ctx.reply(ctx.t('kb_rejected'));
    return { ok: true, clearSession: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[kb] handleKbReject error', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

// --- /ask command (7.7) ---

export async function handleAskCommand(ctx: BotContext): Promise<ModuleResult> {
  await ctx.reply(ctx.t('ask_question_prompt'));
  return { ok: true, session: { state: 'kb_awaiting_question', data: {} } };
}

export async function handleAskQuestion(ctx: BotContext): Promise<ModuleResult> {
  const question = ctx.event.text?.trim() ?? '';
  if (!question) {
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }

  try {
    await ctx.reply(ctx.t('ask_searching'));

    // FTS search first (fast, no API call)
    const ftsResults = await searchKbFts(ctx.db, ctx.user.workspaceId, question);

    // Vector search: embed question, compute similarity against all approved entries
    let vectorResults: typeof ftsResults = [];
    try {
      const queryEmbedding = await generateEmbedding(ctx.db, question);
      trackUsage(ctx.db, ctx.user.workspaceId, 'embedding', 'text-embedding-3-small', 1).catch(() => {});

      const allEntries = await getApprovedEntries(ctx.db, ctx.user.workspaceId);
      const scored = allEntries
        .filter(e => e.embedding)
        .map(e => ({ entry: e, score: cosineSimilarity(queryEmbedding, e.embedding as number[]) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      vectorResults = scored.filter(s => s.score > 0.7).map(s => s.entry);
    } catch {
      // embedding failed — continue with FTS results only
    }

    // Merge, deduplicate by id, take top 5
    const seen = new Set<string>();
    const context = [...vectorResults, ...ftsResults].filter(e => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    }).slice(0, 5);

    if (context.length === 0) {
      await ctx.reply(ctx.t('ask_no_context'));
      return { ok: true, clearSession: true };
    }

    const lang = ctx.user.language === 'ru' ? 'Russian' : 'English';
    const contextText = context.map(e => `## ${e.title}\n${e.content}`).join('\n\n');
    const systemPrompt =
      `You are a helpful assistant for a task management system. Answer in ${lang}. ` +
      `Use only the provided knowledge base context. If the answer is not in the context, say so.\n\n` +
      `Knowledge base:\n${contextText}`;

    const answer = await chatCompletion(ctx.db, systemPrompt, question);
    trackUsage(ctx.db, ctx.user.workspaceId, 'chat', 'gpt-4o-mini', answer.length).catch(() => {});

    await ctx.reply(answer);
    return { ok: true, clearSession: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[kb] handleAskQuestion error', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}
