import { z } from "zod";
import { getSupabaseClient } from "@/lib/supabase/client";
import { uuidSchema } from "@/lib/validation";

/**
 * Dati geografici per la mappa.
 *
 * Tutto passa dalle viste `v_*_public`: `author_id` non esce mai, e le
 * coordinate dei luoghi sensibili sono già offuscate a monte dal database.
 * Il client non ha modo di ottenere la posizione esatta nemmeno volendo.
 */

// --- Luoghi ------------------------------------------------------------------
const luogoSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  description: z.string().nullable(),
  hazard_flag: z.boolean(),
  lat: z.number(),
  lon: z.number(),
});
export type Luogo = z.infer<typeof luogoSchema>;

export async function luoghiPubblici(): Promise<Luogo[]> {
  const { data, error } = await getSupabaseClient()
    .from("v_pois_public")
    .select("id, name, description, hazard_flag, lat, lon");
  if (error) throw new Error(`Lettura dei luoghi fallita: ${error.message}`);
  return luogoSchema.array().parse(data ?? []);
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
  certainty: z.enum(["attestato", "probabile", "ipotetico"]),
  date_from: z.string().nullable(),
  date_to: z.string().nullable(),
  geojson: geoJsonLineaSchema,
});
export type Segmento = z.infer<typeof segmentoSchema>;

export async function segmentiPercorsi(): Promise<Segmento[]> {
  const { data, error } = await getSupabaseClient()
    .from("v_route_segments_public")
    .select("id, route_id, seq, certainty, date_from, date_to, geojson");
  if (error) throw new Error(`Lettura dei percorsi fallita: ${error.message}`);
  return segmentoSchema.array().parse(data ?? []);
}

// --- Luoghi da raccontare ----------------------------------------------------
const luogoDaRaccontareSchema = z.object({
  id: z.number(),
  name: z.string(),
  population: z.number().nullable(),
  lat: z.number(),
  lon: z.number(),
  memory_count: z.number(),
});
export type LuogoDaRaccontare = z.infer<typeof luogoDaRaccontareSchema>;

/** Centri abitati senza (o quasi senza) memorie: i luoghi ancora muti. */
export async function luoghiDaRaccontare(
  sogliaMemorie = 1,
): Promise<LuogoDaRaccontare[]> {
  const { data, error } = await getSupabaseClient()
    .from("v_places_to_tell")
    .select("id, name, population, lat, lon, memory_count")
    .lt("memory_count", sogliaMemorie);
  if (error) throw new Error(`Lettura dei luoghi da raccontare fallita: ${error.message}`);
  return luogoDaRaccontareSchema.array().parse(data ?? []);
}

// --- Controllo dei doppioni --------------------------------------------------
const luogoVicinoSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  distanza_m: z.number(),
});
export type LuogoVicino = z.infer<typeof luogoVicinoSchema>;

/**
 * Luoghi già presenti entro `raggio` metri.
 * Serve a chiedere "intendevi X?" prima di creare un doppione: senza questo
 * controllo la mappa si riempie di tre versioni dello stesso ponte.
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
  if (error) throw new Error(`Ricerca dei luoghi vicini fallita: ${error.message}`);
  return luogoVicinoSchema.array().parse(data ?? []);
}

// --- Creazione di un luogo ---------------------------------------------------
const nuovoLuogoSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  lon: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
});

/** Crea un nuovo luogo alle coordinate indicate. */
export async function creaLuogo(
  nome: string,
  lon: number,
  lat: number,
): Promise<{ id: string }> {
  const dati = nuovoLuogoSchema.parse({ nome, lon, lat });
  const { ensureSession } = await import("@/lib/supabase/auth");
  const session = await ensureSession();

  const { data, error } = await getSupabaseClient()
    .from("pois")
    .insert({
      author_id: session.user.id,
      name: dati.nome,
      // PostGIS accetta l'EWKT: più leggibile di una geometria binaria.
      geog: `SRID=4326;POINT(${dati.lon} ${dati.lat})`,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Creazione del luogo fallita: ${error.message}`);
  return { id: String(data.id) };
}
