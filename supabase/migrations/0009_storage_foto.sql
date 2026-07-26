-- =============================================================================
-- 0009_storage_foto.sql — Bucket Storage per le foto dei ritrovamenti
--
-- Niente audio: l'unico media è la foto. Il bucket è pubblico in lettura (i
-- ritrovamenti sono pubblici subito), ma la scrittura è consentita solo dentro
-- la cartella del proprio utente: `<uid>/<file>`.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('foto', 'foto', true)
on conflict (id) do nothing;

-- Lettura pubblica delle foto (contenuto pubblico).
create policy "foto_select_all" on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'foto');

-- Scrittura solo nella propria cartella (primo segmento del path = uid).
create policy "foto_insert_own" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'foto'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "foto_update_own" on storage.objects for update
  to authenticated
  using (bucket_id = 'foto' and owner = auth.uid());

create policy "foto_delete_own" on storage.objects for delete
  to authenticated
  using (bucket_id = 'foto' and owner = auth.uid());
