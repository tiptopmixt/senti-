-- =============================================================================
-- 0002_poi_contributions.sql — Luoghi e memorie
--
-- Tabelle: pois, contributions, contribution_links, post_votes, anon_aliases.
-- Viste pubbliche v_*_public che NON espongono mai author_id (meccanismo di
-- privacy: la RLS filtra righe, le viste filtrano colonne).
-- =============================================================================

-- Tipo di collegamento tra contributi (dedup e gestione conflitti).
create type public.link_kind as enum ('stesso_episodio', 'conflitto', 'correlato');

-- --- pois --------------------------------------------------------------------
-- Un luogo sulla mappa. Se hazard_flag è true le coordinate esatte non escono
-- mai dalle viste pubbliche (offuscamento deterministico).
create table public.pois (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid default auth.uid() references auth.users (id) on delete set null,
  name        text not null,
  description text,
  geog        geography(Point, 4326) not null,
  hazard_flag boolean not null default false,
  created_at  timestamptz not null default now()
);
create index pois_geog_idx on public.pois using gist (geog);
alter table public.pois enable row level security;

-- --- contributions -----------------------------------------------------------
-- Una memoria: foto/audio/testo su un luogo. I punti nascono all'approvazione.
create table public.contributions (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid default auth.uid() references auth.users (id) on delete set null,
  poi_id       uuid references public.pois (id) on delete cascade,
  kind         public.contribution_kind not null,
  body         text,                        -- testo (per kind='testo')
  media_path   text,                        -- percorso in Storage (foto/audio)
  transcript   text,                        -- trascrizione Whisper (audio)
  embedding    vector(1536),                -- embedding del contenuto
  is_anonymous boolean not null default true,
  status       public.contribution_status not null default 'in_attesa',
  created_at   timestamptz not null default now(),
  approved_at  timestamptz
);
create index contributions_poi_idx on public.contributions (poi_id);
create index contributions_author_idx on public.contributions (author_id);
alter table public.contributions enable row level security;

-- --- contribution_links ------------------------------------------------------
-- Collega due contributi (stesso episodio, conflitto, correlato). Azione
-- editoriale: la gestiscono i curatori.
create table public.contribution_links (
  id                uuid primary key default gen_random_uuid(),
  from_contribution uuid not null references public.contributions (id) on delete cascade,
  to_contribution   uuid not null references public.contributions (id) on delete cascade,
  kind              public.link_kind not null default 'correlato',
  note              text,
  created_by        uuid default auth.uid() references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  constraint contribution_links_distinct check (from_contribution <> to_contribution),
  constraint contribution_links_unique unique (from_contribution, to_contribution, kind)
);
alter table public.contribution_links enable row level security;

-- --- post_votes --------------------------------------------------------------
-- Reazioni ai contributi. Un utente non può votare un proprio contributo
-- (trigger sotto). Un voto per utente per contributo.
create table public.post_votes (
  id              uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references public.contributions (id) on delete cascade,
  voter_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  value           smallint not null default 1 check (value in (-1, 1)),
  created_at      timestamptz not null default now(),
  constraint post_votes_one_per_user unique (contribution_id, voter_id)
);
alter table public.post_votes enable row level security;

create or replace function public.forbid_self_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
begin
  select author_id into v_author from public.contributions where id = new.contribution_id;
  if v_author is not null and v_author = new.voter_id then
    raise exception 'Non puoi votare un tuo contributo';
  end if;
  return new;
end;
$$;

create trigger post_votes_no_self_vote
  before insert or update on public.post_votes
  for each row execute function public.forbid_self_vote();

-- --- anon_aliases ------------------------------------------------------------
-- Alias pubblico stabile per ogni utente: gli altri vedono "Voce anonima",
-- il public_id permette di riconoscere la stessa voce senza rivelare author_id.
create table public.anon_aliases (
  author_id  uuid primary key references auth.users (id) on delete cascade,
  public_id  uuid not null default gen_random_uuid() unique,
  label      text not null default 'Voce anonima',
  created_at timestamptz not null default now()
);
alter table public.anon_aliases enable row level security;

-- Estende il trigger di 0001: alla nascita di un utente crea profilo E alias.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  insert into public.anon_aliases (author_id) values (new.id) on conflict (author_id) do nothing;
  return new;
end;
$$;

-- =============================================================================
-- RLS policies
-- =============================================================================

-- pois: lettura diretta solo al proprietario (o curatore). Il pubblico usa la vista.
create policy pois_select_own on public.pois for select
  using (author_id = auth.uid() or public.is_curator());
create policy pois_insert_own on public.pois for insert
  with check (author_id = auth.uid());
create policy pois_update_own on public.pois for update
  using (author_id = auth.uid() or public.is_curator())
  with check (author_id = auth.uid() or public.is_curator());
create policy pois_delete_own on public.pois for delete
  using (author_id = auth.uid() or public.is_curator());

-- contributions: lettura diretta solo all'autore (o curatore).
create policy contributions_select_own on public.contributions for select
  using (author_id = auth.uid() or public.is_curator());
create policy contributions_insert_own on public.contributions for insert
  with check (author_id = auth.uid());
create policy contributions_update_own on public.contributions for update
  using (author_id = auth.uid() or public.is_curator())
  with check (author_id = auth.uid() or public.is_curator());
create policy contributions_delete_own on public.contributions for delete
  using (author_id = auth.uid() or public.is_curator());

-- contribution_links: solo i curatori (azione editoriale).
create policy contribution_links_curator_all on public.contribution_links for all
  using (public.is_curator())
  with check (public.is_curator());

-- post_votes: si vede solo il proprio voto; si inserisce/cancella solo il proprio.
create policy post_votes_select_own on public.post_votes for select
  using (voter_id = auth.uid());
create policy post_votes_insert_own on public.post_votes for insert
  with check (voter_id = auth.uid());
create policy post_votes_delete_own on public.post_votes for delete
  using (voter_id = auth.uid());

-- anon_aliases: si vede solo il proprio alias. Nessuna scrittura dal client.
create policy anon_aliases_select_own on public.anon_aliases for select
  using (author_id = auth.uid());

-- =============================================================================
-- Viste pubbliche — non espongono MAI author_id
-- (default security_invoker = false: girano coi diritti del proprietario e
--  scavalcano la RLS delle tabelle base, esponendo solo colonne sicure)
-- =============================================================================

-- Luoghi pubblici: coordinate offuscate se hazard_flag.
create view public.v_pois_public as
select
  p.id,
  p.name,
  p.description,
  p.hazard_flag,
  g.geog,
  st_y(g.geog::geometry) as lat,
  st_x(g.geog::geometry) as lon,
  p.created_at
from public.pois p
cross join lateral (
  select case
           when p.hazard_flag then public.obfuscate_geog(p.geog, p.id)
           else p.geog
         end as geog
) g;

-- Memorie pubbliche: solo approvate; autore mostrato come etichetta/alias,
-- mai come author_id.
create view public.v_contributions_public as
select
  c.id,
  c.poi_id,
  c.kind,
  case when c.kind = 'testo' then c.body else null end as body,
  c.transcript,
  c.media_path,
  c.is_anonymous,
  case when c.is_anonymous then a.label else pr.display_name end as author_label,
  case when c.is_anonymous then a.public_id else null end as author_public_id,
  c.created_at
from public.contributions c
left join public.anon_aliases a on a.author_id = c.author_id
left join public.profiles pr on pr.id = c.author_id
where c.status = 'approvato';

-- Conteggi dei voti per contributo: aggregati, mai l'identità di chi ha votato.
create view public.v_contribution_votes_public as
select
  contribution_id,
  coalesce(sum(value), 0)::int              as score,
  count(*) filter (where value = 1)::int    as upvotes,
  count(*) filter (where value = -1)::int   as downvotes
from public.post_votes
group by contribution_id;

-- =============================================================================
-- Grants
-- =============================================================================
grant select, insert, update, delete on public.pois to authenticated;
grant select, insert, update, delete on public.contributions to authenticated;
grant select, insert, update, delete on public.contribution_links to authenticated;
grant select, insert, delete on public.post_votes to authenticated;
grant select on public.anon_aliases to authenticated;

-- Le viste pubbliche sono leggibili da tutti (anche sessioni anonime).
grant select on public.v_pois_public to anon, authenticated;
grant select on public.v_contributions_public to anon, authenticated;
grant select on public.v_contribution_votes_public to anon, authenticated;
