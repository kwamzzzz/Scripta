ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS parsed_text text,
  ADD COLUMN IF NOT EXISTS parsed_blocks jsonb,
  ADD COLUMN IF NOT EXISTS structure_detected boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS parsed_at timestamptz;