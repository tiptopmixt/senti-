#!/usr/bin/env bash
# Applica migrazioni ed Edge Functions a un progetto Supabase (cloud).
#
# Il SEED non viene mai eseguito: gira solo in locale (supabase db reset).
# La service_role key non entra mai nel frontend: qui si impostano solo i
# secret delle Edge Functions.
#
# Prerequisiti:
#   - Supabase CLI installata e autenticata: supabase login
#   - il project-ref del progetto (Dashboard → Project Settings → General)
#
# Uso:
#   ./scripts/deploy-supabase.sh <project-ref>
set -euo pipefail

REF="${1:?Uso: ./scripts/deploy-supabase.sh <project-ref>}"

echo "==> Collego il progetto $REF"
supabase link --project-ref "$REF"

echo "==> Applico le migrazioni (mai il seed)"
supabase db push

echo "==> Pubblico le Edge Functions"
for fn in share narrative transcribe curate context; do
  echo "    - $fn"
  supabase functions deploy "$fn"
done

cat <<'NOTA'

==> Fatto. Ultimi passi manuali, una volta sola per progetto:

  1) Secret delle Edge Functions (mai nel frontend):
       supabase secrets set --env-file supabase/functions/.env
     Devono contenere almeno ANTHROPIC_API_KEY (narrative, curate, context),
     e OPENAI_API_KEY solo se attivi la trascrizione. SUPABASE_URL e
     SUPABASE_SERVICE_ROLE_KEY sono iniettate in automatico.
     Imposta anche SENTI_FUNCTIONS_URL con l'URL pubblico delle funzioni
     (https://<ref>.supabase.co/functions/v1) per l'anteprima WhatsApp di `share`.

  2) Nel Dashboard Supabase → Authentication → Providers:
       - abilita "Anonymous sign-ins" (è il login di base dell'app).
       - (facoltativo, futuro) Google/Facebook, chiedendo solo l'email.

  3) Il bucket "audio" e le tabelle nascono dalle migrazioni: nulla da fare.

NOTA
