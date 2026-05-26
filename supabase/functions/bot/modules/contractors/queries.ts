import type { SupabaseClient } from '../../core/types.ts';

export interface Contractor {
  id: string;
  name: string;
  notes: string | null;
}

export async function createContractor(
  db: SupabaseClient,
  workspaceId: string,
  name: string,
): Promise<string> {
  const { data, error } = await db
    .from('contractors')
    .insert({ workspace_id: workspaceId, name })
    .select('id')
    .single();

  if (error || !data) throw new Error(`createContractor: ${error?.message}`);
  return (data as { id: string }).id;
}

export async function listContractors(db: SupabaseClient, workspaceId: string): Promise<Contractor[]> {
  const { data, error } = await db
    .from('contractors')
    .select('id, name, notes')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .order('name', { ascending: true })
    .limit(20);

  if (error) throw new Error(`listContractors: ${error.message}`);
  return (data ?? []) as Contractor[];
}

export async function searchContractors(
  db: SupabaseClient,
  workspaceId: string,
  query: string,
): Promise<Contractor[]> {
  const { data, error } = await db
    .from('contractors')
    .select('id, name, notes')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .ilike('name', `%${query}%`)
    .limit(10);

  if (error) throw new Error(`searchContractors: ${error.message}`);
  return (data ?? []) as Contractor[];
}
