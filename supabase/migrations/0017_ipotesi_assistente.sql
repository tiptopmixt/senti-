-- 0017 — Ipotesi dell'assistente IA sui ritrovamenti
--
-- L'assistente IA (Edge Function `ipotesi`, che chiama Claude con la chiave che
-- vive SOLO nella funzione) guarda foto + testo di un ritrovamento AL MOMENTO
-- della pubblicazione e scrive, UNA VOLTA SOLA, un commento al condizionale su
-- cosa POTREBBE essere. Non dice mai se la memoria è vera o falsa: è un'ipotesi.
--
-- Riuso la tabella `contribution_context`, che è già "il riquadro separato dal
-- ritrovamento" con la sua policy di lettura pubblica. Aggiungo:
--   - `tipo`: distingue il contesto storico con fonte ('contesto_storico', il
--     comportamento storico, resta il default) dall'ipotesi dell'IA
--     ('ipotesi_assistente'). Così i due riquadri convivono sulla stessa memoria
--     senza sovrascriversi.
--   - `avviso`: nota di SICUREZZA prioritaria (mostrata in rosso, sopra al testo).
--     Per i residuati bellici contiene sempre l'avviso "non toccarlo, chiama il
--     112". È testo, generato dal server (mai dal modello), così è identico
--     ovunque.
--
-- Nessun contenuto qui viene mai spacciato per prova: l'ipotesi è etichettata
-- come tale e resta separata dalla voce di chi ha pubblicato (invariante di
-- progetto: i due livelli non si fondono mai).

alter table public.contribution_context
  add column if not exists tipo   text not null default 'contesto_storico',
  add column if not exists avviso text;

alter table public.contribution_context
  drop constraint if exists contribution_context_tipo_check;
alter table public.contribution_context
  add constraint contribution_context_tipo_check
  check (tipo in ('contesto_storico', 'ipotesi_assistente'));

-- Prima la memoria poteva avere UN solo riquadro (unique su contribution_id).
-- Ora può averne uno per tipo: contesto storico E ipotesi dell'assistente.
-- Elimino QUALSIASI vincolo unique sul solo contribution_id, comunque si chiami.
do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'contribution_context'
      and con.contype = 'u'
      and con.conkey = array[
        (select attnum from pg_attribute
          where attrelid = 'public.contribution_context'::regclass
            and attname = 'contribution_id')
      ]
  loop
    execute format('alter table public.contribution_context drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.contribution_context
  drop constraint if exists contribution_context_contribution_id_tipo_key;
alter table public.contribution_context
  add constraint contribution_context_contribution_id_tipo_key
  unique (contribution_id, tipo);

-- La policy di SELECT pubblica esiste già (using true), quindi anche le righe
-- 'ipotesi_assistente' sono leggibili da anon/authenticated. La scrittura resta
-- solo lato Edge Function (service_role, che scavalca la RLS): il client non
-- scrive mai qui.

notify pgrst, 'reload schema';
