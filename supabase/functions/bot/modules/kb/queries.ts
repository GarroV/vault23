import type { SupabaseClient } from '../../core/types.ts';

export interface KbEntry {
  id: string;
  title: string;
  content: string;
  status: string;
  embedding: number[] | null;
}

export async function createKbEntry(
  db: SupabaseClient,
  workspaceId: string,
  title: string,
  content: string,
): Promise<string> {
  const { data, error } = await db
    .from('kb_entries')
    .insert({ workspace_id: workspaceId, title, content, status: 'pending', source_type: 'manual' })
    .select('id')
    .single();

  if (error || !data) throw new Error(`createKbEntry: ${error?.message}`);
  return (data as { id: string }).id;
}

export async function approveKbEntry(
  db: SupabaseClient,
  workspaceId: string,
  entryId: string,
  embedding: number[],
): Promise<void> {
  const { error } = await db
    .from('kb_entries')
    .update({ status: 'approved', embedding: JSON.stringify(embedding) })
    .eq('id', entryId)
    .eq('workspace_id', workspaceId);

  if (error) throw new Error(`approveKbEntry: ${error.message}`);
}

export async function rejectKbEntry(
  db: SupabaseClient,
  workspaceId: string,
  entryId: string,
): Promise<void> {
  const { error } = await db
    .from('kb_entries')
    .delete()
    .eq('id', entryId)
    .eq('workspace_id', workspaceId);

  if (error) throw new Error(`rejectKbEntry: ${error.message}`);
}

export async function getKbEntryById(
  db: SupabaseClient,
  workspaceId: string,
  entryId: string,
): Promise<KbEntry | null> {
  const { data, error } = await db
    .from('kb_entries')
    .select('id, title, content, status, embedding')
    .eq('id', entryId)
    .eq('workspace_id', workspaceId)
    .single();

  if (error) return null;
  return data as KbEntry;
}

export async function getApprovedEntries(db: SupabaseClient, workspaceId: string): Promise<KbEntry[]> {
  const { data, error } = await db
    .from('kb_entries')
    .select('id, title, content, status, embedding')
    .eq('workspace_id', workspaceId)
    .eq('status', 'approved')
    .limit(200);

  if (error) throw new Error(`getApprovedEntries: ${error.message}`);
  return (data ?? []) as KbEntry[];
}

export async function searchKbFts(
  db: SupabaseClient,
  workspaceId: string,
  query: string,
): Promise<KbEntry[]> {
  const { data, error } = await db
    .from('kb_entries')
    .select('id, title, content, status, embedding')
    .eq('workspace_id', workspaceId)
    .eq('status', 'approved')
    .ilike('content', `%${query}%`)
    .limit(5);

  if (error) throw new Error(`searchKbFts: ${error.message}`);
  return (data ?? []) as KbEntry[];
}
