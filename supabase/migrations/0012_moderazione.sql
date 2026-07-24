-- =============================================================================
-- 0012_moderazione.sql — La coda di moderazione della curatrice
--
-- Chiude l'anello: una memoria nasce 'in_attesa' e diventa pubblica solo quando
-- una curatrice l'approva. I punti nascono proprio all'approvazione (trigger di
-- 0003), non alla registrazione.
--
-- Anche la curatrice non vede author_id: l'anonimato vale verso chiunque, non
-- solo verso il pubblico. Modera il contenuto, non l'identità.
-- =============================================================================

-- --- La coda: memorie in attesa ----------------------------------------------
create or replace function public.memorie_da_moderare()
returns table (
  id                  uuid,
  poi_id              uuid,
  poi_nome            text,
  kind                public.contribution_kind,
  body                text,
  transcript          text,
  media_path          text,
  narrator_name       text,
  narrator_birth_year integer,
  event_year          integer,
  text_source         public.text_source,
  narrator_consent    boolean,
  created_at          timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Solo le curatrici vedono la coda. Chiunque altro riceve un elenco vuoto.
  if not public.is_curator(auth.uid()) then
    return;
  end if;

  return query
    select
      c.id, c.poi_id, p.name, c.kind, c.body, c.transcript, c.media_path,
      c.narrator_name, c.narrator_birth_year, c.event_year, c.text_source,
      c.narrator_consent, c.created_at
    from public.contributions c
    left join public.pois p on p.id = c.poi_id
    where c.status = 'in_attesa'
    order by c.created_at asc;
end;
$$;

-- --- L'azione: approva o rifiuta ---------------------------------------------
-- Centralizzata in una RPC così la curatrice non tocca mai la colonna author_id.
-- L'approvazione fa scattare il trigger che assegna i punti all'autore.
create or replace function public.modera_memoria(
  p_id     uuid,
  p_approva boolean,
  p_motivo  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_curator(auth.uid()) then
    raise exception 'Solo una curatrice può moderare le memorie'
      using errcode = 'insufficient_privilege';
  end if;

  update public.contributions
     set status = case when p_approva then 'approvato'::public.contribution_status
                       else 'rifiutato'::public.contribution_status end
   where id = p_id
     and status = 'in_attesa';   -- si modera solo ciò che è ancora in attesa

  if not found then
    raise exception 'Memoria non trovata o già moderata';
  end if;
end;
$$;

grant execute on function public.memorie_da_moderare() to authenticated;
grant execute on function public.modera_memoria(uuid, boolean, text) to authenticated;
