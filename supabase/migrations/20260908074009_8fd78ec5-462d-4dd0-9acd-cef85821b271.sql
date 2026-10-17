ALTER TABLE public.feature_flags
  ADD COLUMN IF NOT EXISTS off_mode text NOT NULL DEFAULT 'dim';

ALTER TABLE public.feature_flags
  DROP CONSTRAINT IF EXISTS feature_flags_off_mode_check;

ALTER TABLE public.feature_flags
  ADD CONSTRAINT feature_flags_off_mode_check CHECK (off_mode IN ('dim', 'hidden'));