import type { SupabaseClient } from '../../core/types.ts';

export interface Service {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  currency: string;
  unit: string | null;
  contractor_id: string | null;
  contractor_name: string | null;
}

export async function createService(
  db: SupabaseClient,
  workspaceId: string,
  name: string,
  price: number | null,
  unit: string | null,
  contractorId: string | null,
): Promise<string> {
  const { data, error } = await db
    .from('services')
    .insert({ workspace_id: workspaceId, name, price, unit, contractor_id: contractorId })
    .select('id')
    .single();
  if (error || !data) throw new Error(`createService: ${error?.message}`);
  return (data as { id: string }).id;
}

export async function listServices(
  db: SupabaseClient,
  workspaceId: string,
): Promise<Service[]> {
  const { data, error } = await db
    .from('services')
    .select('id, name, description, price, currency, unit, contractor_id, contractors(name)')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .order('name');
  if (error) throw new Error(`listServices: ${error.message}`);
  return ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
    id: r.id as string,
    name: r.name as string,
    description: r.description as string | null,
    price: r.price as number | null,
    currency: (r.currency as string) ?? 'RUB',
    unit: r.unit as string | null,
    contractor_id: r.contractor_id as string | null,
    contractor_name: (r.contractors as { name?: string } | null)?.name ?? null,
  }));
}

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
