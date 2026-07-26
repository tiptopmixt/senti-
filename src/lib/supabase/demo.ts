import { getSupabaseClient } from "./client";

/**
 * Utenti demo per la modalità test.
 *
 * Esistono SOLO se NEXT_PUBLIC_DEMO=true. Con la variabile spenta, il selettore
 * e ogni traccia del seed spariscono: in produzione non c'è nessun account demo
 * e questo modulo non viene mai usato.
 *
 * La password è la stessa del seed: vale solo sul progetto Supabase di sviluppo.
 */
export const DEMO_ATTIVO = process.env.NEXT_PUBLIC_DEMO === "true";

const PASSWORD_DEMO = "demo123456";

export interface UtenteDemo {
  chiave: "anna" | "marco" | "moderatore";
  email: string;
  etichetta: string;
  descrizione: string;
}

export const UTENTI_DEMO: UtenteDemo[] = [
  {
    chiave: "anna",
    email: "anna@demo.local",
    etichetta: "Anna",
    descrizione: "con ritrovamenti e punti",
  },
  {
    chiave: "marco",
    email: "marco@demo.local",
    etichetta: "Marco",
    descrizione: "nuovo, zero contributi",
  },
  {
    chiave: "moderatore",
    email: "moderatore@demo.local",
    etichetta: "Moderatore",
    descrizione: "può moderare i contenuti segnalati",
  },
];

/** Entra come uno degli utenti demo (sostituisce la sessione corrente). */
export async function entraComeDemo(email: string): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: PASSWORD_DEMO,
  });
  if (error) throw new Error(`Accesso demo fallito: ${error.message}`);
}

/** Profilo dell'utente corrente (nome, se moderatore). */
export async function profiloCorrente(): Promise<{
  display_name: string | null;
  is_moderator: boolean;
} | null> {
  const supabase = getSupabaseClient();
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session) return null;

  const { data } = await supabase
    .from("profiles")
    .select("display_name, is_moderator")
    .eq("id", sess.session.user.id)
    .maybeSingle();
  return data ?? { display_name: null, is_moderator: false };
}
