// Header CORS comuni a tutte le Edge Functions.
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/** Risponde al preflight CORS, se è quello che è arrivato. */
export function preflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}

/** Risposta JSON con header CORS. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Risposta di errore uniforme. */
export function fail(message: string, status = 400, extra?: unknown): Response {
  return json({ error: message, ...(extra ? { dettagli: extra } : {}) }, status);
}
