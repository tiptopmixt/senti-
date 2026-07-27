import { z } from "zod";
import { getSupabaseClient } from "@/lib/supabase/client";
import { certaintySchema, findingTypeSchema, uuidSchema } from "@/lib/validation";

/**
 * Dati geografici per la mappa.
 *
 * Tutto passa dalle viste `v_*_public`: `author_id` non esce mai, e le
 * coordinate dei ritrovamenti sensibili sono già offuscate a monte dal database.
 */

// --- Ritrovamenti (pin) ------------------------------------------------------
const luogoSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  description: z.string().nullable(),
  finding_type: findingTypeSchema,
  certainty: certaintySchema,
  event_year: z.number().int().nullable(),
  hazard_flag: z.boolean(),
  lat: z.number(),
  lon: z.number(),
  zone_radius_m: z.number().int().nullable(),
});
export type Luogo = z.infer<typeof luogoSchema>;

export async function luoghiPubblici(): Promise<Luogo[]> {
  const { data, error } = await getSupabaseClient()
    .from("v_pois_public")
    .select("id, name, description, finding_type, certainty, event_year, hazard_flag, lat, lon, zone_radius_m");
  if (error) throw new Error(`Lettura dei ritrovamenti fallita: ${error.message}`);
  return luogoSchema.array().parse(data ?? []);
}

// --- Condottieri e percorsi --------------------------------------------------
const condottieroSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  name: z.string(),
  epoch: z.string().nullable(),
  region: z.string().nullable(),
  bio: z.string().nullable(),
  combattenti: z.string().nullable(),
  esito: z.string().nullable(),
  durata: z.string().nullable(),
  source_name: z.string().nullable(),
  source_url: z.string().nullable(),
  empire_id: uuidSchema.nullable(),
});
export type Condottiero = z.infer<typeof condottieroSchema>;

export async function condottieri(): Promise<Condottiero[]> {
  const { data, error } = await getSupabaseClient()
    .from("v_commanders_public")
    .select("id, slug, name, epoch, region, bio, combattenti, esito, durata, source_name, source_url, empire_id")
    .order("name", { ascending: true });
  if (error) throw new Error(`Lettura dei condottieri fallita: ${error.message}`);
  return condottieroSchema.array().parse(data ?? []);
}

// --- Imperi / potenze (livello padre) ----------------------------------------
const imperoSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  name: z.string(),
  continent: z.string().nullable(),
  region: z.string().nullable(),
  epoch: z.string().nullable(),
  description: z.string().nullable(),
  apogeo: z.string().nullable(),
  source_name: z.string().nullable(),
  source_url: z.string().nullable(),
});
export type Impero = z.infer<typeof imperoSchema>;

export async function imperi(): Promise<Impero[]> {
  const { data, error } = await getSupabaseClient()
    .from("v_empires_public")
    .select("id, slug, name, continent, region, epoch, description, apogeo, source_name, source_url")
    .order("name", { ascending: true });
  if (error) throw new Error(`Lettura degli imperi fallita: ${error.message}`);
  return imperoSchema.array().parse(data ?? []);
}

// --- Battaglie (punti di scontro lungo i percorsi) ---------------------------
const battagliaSchema = z.object({
  id: uuidSchema,
  commander_id: uuidSchema.nullable(),
  name: z.string(),
  year: z.number().int().nullable(),
  side_a: z.string().nullable(),
  side_b: z.string().nullable(),
  outcome: z.string().nullable(),
  source_name: z.string().nullable(),
  lat: z.number(),
  lon: z.number(),
});
export type Battaglia = z.infer<typeof battagliaSchema>;

export async function battaglie(): Promise<Battaglia[]> {
  const { data, error } = await getSupabaseClient()
    .from("v_battles_public")
    .select("id, commander_id, name, year, side_a, side_b, outcome, source_name, lat, lon");
  if (error) throw new Error(`Lettura delle battaglie fallita: ${error.message}`);
  return battagliaSchema.array().parse(data ?? []);
}

// --- Segmenti dei percorsi ---------------------------------------------------
// La certezza vive qui: è ciò che decide come viene disegnata la linea.
const geoJsonLineaSchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(z.tuple([z.number(), z.number()])),
});

const segmentoSchema = z.object({
  id: uuidSchema,
  route_id: uuidSchema,
  seq: z.number().int(),
  certainty: certaintySchema,
  date_from: z.string().nullable(),
  date_to: z.string().nullable(),
  importance: z.number().int(),
  geojson: geoJsonLineaSchema,
});
export type Segmento = z.infer<typeof segmentoSchema>;

export async function segmentiPercorsi(): Promise<Segmento[]> {
  const { data, error } = await getSupabaseClient()
    .from("v_route_segments_public")
    .select("id, route_id, seq, certainty, date_from, date_to, importance, geojson");
  if (error) throw new Error(`Lettura dei percorsi fallita: ${error.message}`);
  return segmentoSchema.array().parse(data ?? []);
}

const percorsoSchema = z.object({
  id: uuidSchema,
  commander_id: uuidSchema.nullable(),
  kind: z.string(),
  title: z.string(),
});
export type Percorso = z.infer<typeof percorsoSchema>;

export async function percorsi(): Promise<Percorso[]> {
  const { data, error } = await getSupabaseClient()
    .from("v_routes_public")
    .select("id, commander_id, kind, title");
  if (error) throw new Error(`Lettura dei percorsi fallita: ${error.message}`);
  return percorsoSchema.array().parse(data ?? []);
}

// --- Controllo dei doppioni --------------------------------------------------
const luogoVicinoSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  finding_type: findingTypeSchema,
  lat: z.number(),
  lon: z.number(),
  distanza_m: z.number(),
});
export type LuogoVicino = z.infer<typeof luogoVicinoSchema>;

/**
 * Ritrovamenti già presenti entro `raggio` metri.
 * Serve a chiedere "intendevi X?" prima di creare un doppione.
 */
export async function luoghiVicini(
  lon: number,
  lat: number,
  raggio = 100,
): Promise<LuogoVicino[]> {
  const { data, error } = await getSupabaseClient().rpc("luoghi_vicini", {
    p_lon: lon,
    p_lat: lat,
    p_raggio: raggio,
  });
  if (error) throw new Error(`Ricerca dei ritrovamenti vicini fallita: ${error.message}`);
  return luogoVicinoSchema.array().parse(data ?? []);
}
