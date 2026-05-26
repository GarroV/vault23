import type { SupabaseClient } from '../../core/types.ts';

export interface Service {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  currency: string;
  unit: string | null;
  project_id: string | null;
  project_name: string | null;
}

export async function createService(
  db: SupabaseClient,
  workspaceId: string,
  name: string,
  price: number | null,
  unit: string | null,
  projectId: string | null,
): Promise<string> {
  const { data, error } = await db
    .from('services')
    .insert({ workspace_id: workspaceId, name, price, unit, project_id: projectId })
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
    .select('id, name, description, price, currency, unit, project_id, projects(name)')
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
    project_id: r.project_id as string | null,
    project_name: (r.projects as { name?: string } | null)?.name ?? null,
  }));
}

export interface Project {
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
    .from('projects')
    .insert({ workspace_id: workspaceId, name })
    .select('id')
    .single();

  if (error || !data) throw new Error(`createProject: ${error?.message}`);
  return (data as { id: string }).id;
}

export async function listContractors(db: SupabaseClient, workspaceId: string): Promise<Project[]> {
  const { data, error } = await db
    .from('projects')
    .select('id, name, notes')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .order('name', { ascending: true })
    .limit(20);

  if (error) throw new Error(`listProjects: ${error.message}`);
  return (data ?? []) as Project[];
}

export async function searchContractors(
  db: SupabaseClient,
  workspaceId: string,
  query: string,
): Promise<Project[]> {
  const { data, error } = await db
    .from('projects')
    .select('id, name, notes')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .ilike('name', `%${query}%`)
    .limit(10);

  if (error) throw new Error(`searchProjects: ${error.message}`);
  return (data ?? []) as Project[];
}
