ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS jurisdiction text,
  ADD COLUMN IF NOT EXISTS effective_date date,
  ADD COLUMN IF NOT EXISTS parties text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS confidentiality text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS last_edited_by uuid,
  ADD COLUMN IF NOT EXISTS last_edited_at timestamptz;

CREATE INDEX IF NOT EXISTS documents_parsed_text_fts_idx
  ON public.documents USING gin (to_tsvector('english', coalesce(parsed_text, '')));
CREATE INDEX IF NOT EXISTS documents_matter_idx ON public.documents (matter_id);
CREATE INDEX IF NOT EXISTS documents_archived_idx ON public.documents (archived_at);

CREATE TABLE IF NOT EXISTS public.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  matter_id uuid NOT NULL REFERENCES public.matters(id) ON DELETE CASCADE,
  label text,
  note text,
  storage_path text,
  mime_type text,
  byte_size bigint,
  page_count integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_versions_document_idx
  ON public.document_versions (document_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_versions TO authenticated;
GRANT ALL ON public.document_versions TO service_role;

ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read document versions" ON public.document_versions
  FOR SELECT TO authenticated USING (public.is_matter_member(matter_id));
CREATE POLICY "Writers add document versions" ON public.document_versions
  FOR INSERT TO authenticated WITH CHECK (public.can_write_matter(matter_id));
CREATE POLICY "Writers edit document versions" ON public.document_versions
  FOR UPDATE TO authenticated USING (public.can_write_matter(matter_id))
  WITH CHECK (public.can_write_matter(matter_id));
CREATE POLICY "Writers delete document versions" ON public.document_versions
  FOR DELETE TO authenticated USING (public.can_write_matter(matter_id));

CREATE TRIGGER document_versions_updated_at BEFORE UPDATE ON public.document_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();