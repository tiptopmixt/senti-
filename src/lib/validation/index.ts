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

// Enum allineati alle migrazioni (0001).
export const contributionKindSchema = z.enum(["foto", "testo"]);
export const contributionStatusSchema = z.enum(["pubblicato", "rimosso"]);
export const certaintySchema = z.enum(["attestato", "probabile", "ipotetico"]);

// Le 12 categorie/icone di ritrovamento. L'ordine è quello del picker.
export const findingTypeSchema = z.enum([
  "battaglia",
  "munizioni",
  "equipaggiamento",
  "fortificazione",
  "caduti",
  "tesori",
  "minerali",
  "fossili",
  "archeologico",
  "monumento",
  "aneddoto",
  "foto_storica",
]);
export type FindingType = z.infer<typeof findingTypeSchema>;

/** Emoji segnaposto per categoria (poi sostituite da SVG dedicati). */
export const FINDING_EMOJI: Record<FindingType, string> = {
  battaglia: "⚔️",
  munizioni: "🔫",
  equipaggiamento: "🪖",
  fortificazione: "🏰",
  caduti: "⚰️",
  tesori: "🗝️",
  minerali: "💎",
  fossili: "🦴",
  archeologico: "🏺",
  monumento: "🏛️",
  aneddoto: "📜",
  foto_storica: "📷",
};

/** Ordine di presentazione delle categorie nel picker. */
export const FINDING_TYPES: FindingType[] = findingTypeSchema.options;

/** Raggi ammessi per la zona (mai più stretto di 1 km). */
export const RAGGI_ZONA = [1000, 3000, 5000] as const;

/** Payload per pubblicare un ritrovamento (RPC pubblica_ritrovamento). */
export const nuovoRitrovamentoSchema = z.object({
  findingType: findingTypeSchema,
  name: z.string().trim().min(1).max(200),
  lon: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  zoneRadiusM: z.number().int().min(1000).max(5000),
  kind: contributionKindSchema,
  body: z.string().trim().max(5000).nullable(),
  mediaPath: z.string().nullable(),
  poiId: uuidSchema.nullable(),
  routeId: uuidSchema.nullable(),
  eventYear: z.number().int().min(-3000).max(new Date().getFullYear() + 1).nullable(),
  hazardFlag: z.boolean(),
  isAnonymous: z.boolean(),
  vocePropria: z.boolean(),
  permessoTerzi: z.boolean().nullable(),
  veridicita: z.boolean(),
  clientKey: uuidSchema.nullable().optional(),
});
export type NuovoRitrovamento = z.infer<typeof nuovoRitrovamentoSchema>;

/** Contenuto come esce dalla vista pubblica (mai `author_id`). */
export const publicContributionSchema = z.object({
  id: uuidSchema,
  poi_id: uuidSchema.nullable(),
  kind: contributionKindSchema,
  body: z.string().nullable(),
  media_path: z.string().nullable(),
  is_anonymous: z.boolean(),
  author_label: z.string().nullable(),
  author_public_id: uuidSchema.nullable(),
  created_at: z.string(),
});
export type PublicContribution = z.infer<typeof publicContributionSchema>;
