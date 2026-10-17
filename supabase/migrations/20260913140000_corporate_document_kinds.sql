-- Corporate Drafting beyond letters and resolutions.
--
-- "resolution" covered a written board resolution, a set of minutes and a
-- shareholders' resolution alike, which is why every one of them opened on the
-- same two headings. Each is its own instrument with its own setup, structure
-- and execution, so each gets its own kind. The check widens rather than moves:
-- the legacy value stays valid so a row written before this migration still
-- reads, and is mapped on the way in.

alter table public.corporate_documents
  drop constraint if exists corporate_documents_kind_check;

alter table public.corporate_documents
  add constraint corporate_documents_kind_check check (
    kind in (
      'board_written_resolution',
      'board_minutes',
      'shareholder_written_resolution',
      'letter',
      -- Written before the kinds were split out.
      'resolution'
    )
  );

update public.corporate_documents
   set kind = 'board_written_resolution'
 where kind = 'resolution';

comment on column public.corporate_documents.kind is
  'The corporate instrument. Each kind has its own guided setup, structure and drafting guidance.';
