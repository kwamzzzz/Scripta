-- The client workspace was removed, and its feature flag row outlived it.
--
-- `feature_flags` holds only the rows an administrator has actually touched;
-- the catalogue in src/lib/features.ts is the list of features that exist.
-- Once `client` left the catalogue, its row named nothing. It was invisible in
-- the admin portal, which renders the catalogue rather than the rows, so this
-- is tidying rather than a fix — but a row describing a feature that does not
-- exist is exactly the kind of thing that confuses whoever reads the table
-- next.

delete from public.feature_flags where key = 'client';
