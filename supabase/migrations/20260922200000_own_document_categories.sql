-- Key documents: the firm's own shelf, named the firm's way.
--
-- `documents.org_category` was one of eleven words, fixed in a check
-- constraint. They are good words — a company secretary would recognise every
-- one — but they are not everybody's, and a shelf you cannot label is somebody
-- else's shelf. A client with "Trust deeds", "Tax rulings" or "NOCs" had to
-- file them under "Other records" and lose the distinction.
--
-- So the constraint now asks only that a category be a category: present and
-- not blank. The eleven stay as the offered choices, with their labels, and
-- anything typed is kept as typed.
--
-- `clients.doc_category_order` is the order the shelf is read in. Alphabetical
-- is a filing system nobody chose; the order a company secretary keeps — the
-- constitution first, the correspondence last — is a judgement about the
-- client, so it is stored against the client rather than guessed.

alter table public.documents drop constraint if exists documents_org_category_check;

alter table public.documents
  add constraint documents_org_category_check
  check (org_category is null or btrim(org_category) <> '');

comment on column public.documents.org_category is
  'The shelf this document is filed on. One of ORG_CATEGORY_LABEL, or whatever the client calls it.';

alter table public.clients
  add column if not exists doc_category_order jsonb not null default '[]'::jsonb;

comment on column public.clients.doc_category_order is
  'Key document categories in the order this client files them. Anything not listed follows, in the built-in order.';
