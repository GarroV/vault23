import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { TelegramUser, UserIdentity, Language } from './types.ts';

// Shape of joined auth_methods → users query result
interface AuthRow {
  user_id: string;
  users: { id: string; workspace_id: string; language: string };
}

function detectLanguage(code?: string): Language {
  return code === 'ru' ? 'ru' : 'en';
}

function buildDisplayName(from: TelegramUser): string {
  const parts = [from.first_name, from.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : (from.username ?? 'User');
}

export async function identifyUser(
  db: SupabaseClient,
  from: TelegramUser,
): Promise<UserIdentity> {
  const telegramId = String(from.id);

  const { data, error } = await db
    .from('auth_methods')
    .select('user_id, users(id, workspace_id, language)')
    .eq('type', 'telegram')
    .eq('value', telegramId)
    .maybeSingle();

  if (error) throw new Error(`auth lookup failed: ${error.message}`);

  if (data) {
    const row = data as unknown as AuthRow;
    return {
      userId: row.users.id,
      workspaceId: row.users.workspace_id,
      language: (row.users.language as Language) ?? detectLanguage(from.language_code),
      telegramId,
      isNew: false,
    };
  }

  return registerUser(db, from, telegramId, detectLanguage(from.language_code));
}

async function registerUser(
  db: SupabaseClient,
  from: TelegramUser,
  telegramId: string,
  language: Language,
): Promise<UserIdentity> {
  const displayName = buildDisplayName(from);

  // Workspace (trigger auto-seeds default topic + categories)
  const { data: workspace, error: wsError } = await db
    .from('workspaces')
    .insert({ name: `${displayName}'s workspace` })
    .select('id')
    .single();
  if (wsError || !workspace) throw new Error(`workspace creation failed: ${wsError?.message}`);

  const { data: user, error: userError } = await db
    .from('users')
    .insert({ workspace_id: workspace.id, display_name: displayName, language })
    .select('id')
    .single();
  if (userError || !user) throw new Error(`user creation failed: ${userError?.message}`);

  const { error: authError } = await db
    .from('auth_methods')
    .insert({ user_id: user.id, type: 'telegram', value: telegramId, confirmed: true });
  if (authError) throw new Error(`auth_method creation failed: ${authError.message}`);

  // People record for the owner (axis 4 of tasks)
  const { error: peopleError } = await db
    .from('people')
    .insert({ workspace_id: workspace.id, name: displayName, user_id: user.id });
  if (peopleError) throw new Error(`people creation failed: ${peopleError.message}`);

  // Initial idle session
  const { error: sessionError } = await db
    .from('bot_sessions')
    .insert({ workspace_id: workspace.id, user_id: user.id, state: 'idle', data: {} });
  if (sessionError) throw new Error(`bot_session creation failed: ${sessionError.message}`);

  console.log('[identify] new user registered', { userId: user.id, workspaceId: workspace.id });

  return { userId: user.id, workspaceId: workspace.id, language, telegramId, isNew: true };
}
