-- =============================================================================
-- 0008_audio_storage.sql — Bucket per le registrazioni
--
-- L'audio è la memoria: va conservato bene e servito solo a chi ha diritto.
-- Il bucket è PRIVATO. La lettura pubblica è concessa solo agli audio di
-- memorie approvate e con consenso del narratore: la stessa condizione della
-- vista v_contributions_public, applicata qui allo Storage.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audio',
  'audio',
  false,                                   -- privato: nessun accesso libero via URL
  52428800,                                -- 50 MB: ~40 minuti di voce in opus
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']
)
on conflict (id) do nothing;

-- --- Caricamento: ognuno scrive solo nella propria cartella ------------------
-- Il percorso è <uid>/<nome-file>: così un utente non può sovrascrivere
-- l'audio di un altro.
create policy audio_insert_own
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- --- Lettura -----------------------------------------------------------------
-- 1. Il proprietario può sempre riascoltare i propri file.
create policy audio_select_own
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 2. Chiunque può ascoltare l'audio di una memoria APPROVATA e CON CONSENSO.
--    Stessa condizione della vista pubblica: se una memoria non è pubblicabile,
--    la sua voce non è ascoltabile.
create policy audio_select_pubblicate
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'audio'
    and exists (
      select 1
        from public.contributions c
       where c.media_path = storage.objects.name
         and c.status = 'approvato'
         and c.narrator_consent = true
    )
  );

-- --- Cancellazione: solo i propri file, e solo finché non è approvato --------
create policy audio_delete_own
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
