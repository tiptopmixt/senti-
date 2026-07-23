# src/lib/queries — accesso al database

Regola di progetto (vedi `CLAUDE.md`):

> **Le query al database vivono SOLO qui.** Nessun componente o pagina interroga
> Supabase direttamente.

Ogni funzione in questa cartella:

1. accetta input già tipizzati;
2. esegue la query tramite il client Supabase (`getSupabaseClient()`);
3. **valida il risultato con zod** (schemi in `src/lib/validation/`) prima di
   restituirlo — è il confine di fiducia tra DB e applicazione.

Invarianti collegati:

- Le **letture pubbliche** passano solo dalle viste `v_*_public`: `author_id` non
  deve mai comparire nei dati restituiti al pubblico.
- **Nessuna scrittura** diretta sul `points_ledger`: i punti nascono solo da
  trigger/RPC lato database.
