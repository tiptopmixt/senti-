import { z } from "zod";

/**
 * Confine di validazione tra database e applicazione.
 *
 * Ogni dato che entra o esce dal DB viene validato qui con zod prima di essere
 * usato. È il punto in cui ci si accorge se lo schema e il codice divergono.
 */

// Le lingue dei contenuti/interfaccia supportate.
export const localeSchema = z.enum(["it", "en"]);
export type Locale = z.infer<typeof localeSchema>;

// Primitive riutilizzabili.
export const uuidSchema = z.guid();

// Enum allineati alle migrazioni.
export const contributionKindSchema = z.enum(["foto", "audio", "testo"]);
export const contributionStatusSchema = z.enum([
  "in_attesa",
  "approvato",
  "rifiutato",
]);
export const textSourceSchema = z.enum([
  "raccoglitore",
  "automatica",
  "nessuno",
]);

const currentYear = new Date().getFullYear();

/**
 * Dati del testimone raccolti dall'interfaccia.
 * Il consenso è il cancello: senza, la memoria resta privata.
 */
export const narratorInputSchema = z.object({
  narratorName: z.string().trim().min(1).max(120).nullable(),
  narratorBirthYear: z
    .number()
    .int()
    .min(1850)
    .max(currentYear)
    .nullable(),
  narratorConsent: z.boolean(),
});
export type NarratorInput = z.infer<typeof narratorInputSchema>;

/** Payload per creare una memoria audio. */
export const audioContributionInputSchema = narratorInputSchema.extend({
  poiId: uuidSchema.nullable(),
  mediaPath: z.string().min(1),
  audioDurationMs: z.number().int().min(0).max(7_200_000).nullable(),
  // Nota scritta da chi raccoglie: indice di servizio, non le parole del testimone.
  note: z.string().trim().max(5000).nullable(),
});
export type AudioContributionInput = z.infer<
  typeof audioContributionInputSchema
>;

/** Memoria come esce dalla vista pubblica (mai `author_id`). */
export const publicContributionSchema = z.object({
  id: uuidSchema,
  poi_id: uuidSchema.nullable(),
  kind: contributionKindSchema,
  body: z.string().nullable(),
  transcript: z.string().nullable(),
  media_path: z.string().nullable(),
  is_anonymous: z.boolean(),
  author_label: z.string().nullable(),
  author_public_id: uuidSchema.nullable(),
  created_at: z.string(),
  narrator_name: z.string().nullable(),
  narrator_birth_year: z.number().int().nullable(),
  text_source: textSourceSchema,
  audio_duration_ms: z.number().int().nullable(),
});
export type PublicContribution = z.infer<typeof publicContributionSchema>;
