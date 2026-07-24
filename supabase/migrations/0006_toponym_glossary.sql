-- =============================================================================
-- 0006_toponym_glossary.sql — Glossario dei toponimi per area
--
-- Serve alla Edge Function `transcribe`: Whisper riconosce molto meglio i nomi
-- di luogo locali se glieli si passa come suggerimento. Il glossario è
-- organizzato per area; se `area` (poligono) è presente si seleziona per
-- contenimento del punto, altrimenti si usa l'area di default.
-- =============================================================================

create table public.toponym_glossary (
  id         uuid primary key default gen_random_uuid(),
  area_name  text not null,
  area       geography(Polygon, 4326),          -- opzionale: ambito geografico
  terms      text[] not null default '{}',      -- toponimi e varianti
  lang       text not null default 'it',
  is_default boolean not null default false,    -- fallback se il punto non ricade in nessuna area
  created_at timestamptz not null default now(),
  constraint toponym_glossary_area_lang_unique unique (area_name, lang)
);
create index toponym_glossary_area_idx on public.toponym_glossary using gist (area);
alter table public.toponym_glossary enable row level security;

-- Dato di riferimento pubblico: lettura a tutti, scrittura solo curatori.
create policy toponym_glossary_select_all on public.toponym_glossary for select
  using (true);
create policy toponym_glossary_curator_write on public.toponym_glossary for all
  using (public.is_curator())
  with check (public.is_curator());

-- Restituisce i toponimi utili per un punto: prima l'area che lo contiene,
-- altrimenti l'area di default. Usata dalla Edge Function transcribe.
create or replace function public.toponyms_for_point(
  p_geog geography,
  p_lang text default 'it'
)
returns text[]
language sql
stable
as $$
  select coalesce(
    (select g.terms
       from public.toponym_glossary g
      where g.lang = p_lang
        and g.area is not null
        and st_intersects(g.area, p_geog)
      order by st_area(g.area::geometry) asc   -- l'area più specifica vince
      limit 1),
    (select g.terms
       from public.toponym_glossary g
      where g.lang = p_lang and g.is_default
      limit 1),
    '{}'::text[]
  );
$$;

grant select on public.toponym_glossary to anon, authenticated;
grant execute on function public.toponyms_for_point(geography, text) to anon, authenticated;
