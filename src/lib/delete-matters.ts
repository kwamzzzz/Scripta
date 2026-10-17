import { supabase } from "@/integrations/supabase/client";

/** Delete uploaded objects before their document rows disappear by cascade. */
export async function deleteMatters(matterIds: string[]) {
  const ids = [...new Set(matterIds.filter(Boolean))];
  if (!ids.length) return;

  const { data: documents, error: documentsError } = await supabase
    .from("documents")
    .select("storage_path")
    .in("matter_id", ids)
    .not("storage_path", "is", null);
  if (documentsError) throw documentsError;

  const paths = (documents ?? [])
    .map((document) => document.storage_path)
    .filter((path): path is string => !!path);
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from("matter-documents").remove(paths);
    if (storageError) throw storageError;
  }

  const { error } = await supabase.from("matters").delete().in("id", ids);
  if (error) throw error;
}
