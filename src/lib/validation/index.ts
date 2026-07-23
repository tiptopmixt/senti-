import { z } from "zod";

/**
 * Confine di validazione tra database e applicazione.
 *
 * Ogni dato che entra o esce dal DB viene validato qui con zod prima di essere
 * usato. Gli schemi concreti (POI, contributi, percorsi, ...) verranno aggiunti
 * insieme alle rispettive migrazioni.
 */

// Le lingue dei contenuti/interfaccia supportate.
export const localeSchema = z.enum(["it", "en"]);
export type Locale = z.infer<typeof localeSchema>;

// Esempio di primitiva riutilizzabile: un UUID Supabase.
export const uuidSchema = z.string().uuid();
