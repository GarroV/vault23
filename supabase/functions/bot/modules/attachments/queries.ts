import type { SupabaseClient } from '../../core/types.ts';

const BUCKET = 'attachments';
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export { MAX_FILE_BYTES };

export interface TaskPick {
  id: string;
  title: string;
}

export async function getTasksForPicker(db: SupabaseClient, workspaceId: string): Promise<TaskPick[]> {
  const { data, error } = await db
    .from('tasks')
    .select('id, title')
    .eq('workspace_id', workspaceId)
    .in('status', ['open', 'in_progress'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(8);

  if (error) throw new Error(`getTasksForPicker: ${error.message}`);
  return (data ?? []) as TaskPick[];
}

export async function uploadAndRecord(
  db: SupabaseClient,
  workspaceId: string,
  taskId: string,
  fileBytes: Uint8Array,
  fileName: string,
  mimeType: string,
): Promise<void> {
  // Ensure bucket exists (idempotent)
  await db.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: MAX_FILE_BYTES,
  }).catch(() => {});

  const ext = fileName.includes('.') ? '' : '';
  const storagePath = `${workspaceId}/tasks/${taskId}/${crypto.randomUUID()}-${fileName}${ext}`;

  const { error: uploadError } = await db.storage
    .from(BUCKET)
    .upload(storagePath, fileBytes, { contentType: mimeType, upsert: false });

  if (uploadError) throw new Error(`storage upload: ${uploadError.message}`);

  const { error: dbError } = await db.from('attachments').insert({
    workspace_id: workspaceId,
    entity_type: 'task',
    entity_id: taskId,
    file_name: fileName,
    mime_type: mimeType,
    file_size: fileBytes.byteLength,
    storage_path: storagePath,
  });

  if (dbError) throw new Error(`createAttachment: ${dbError.message}`);
}
