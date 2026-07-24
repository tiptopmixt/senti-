/**
 * share — pagina pubblica condivisibile di un POI o di un percorso.
 *
 * Il canale reale è WhatsApp: l'anteprima conta quanto l'app. Quindi la pagina
 * espone meta tag Open Graph completi e un'immagine generata 1200x630.
 * L'immagine è composta in SVG e rasterizzata in PNG, perché WhatsApp e
 * Facebook non renderizzano SVG.
 *
 * Uso:
 *   GET ?type=poi&id=<uuid>[&lang=it]            -> pagina HTML con OG tag
 *   GET ?type=route&id=<uuid>[&lang=it]          -> pagina HTML con OG tag
 *   GET ?type=poi&id=<uuid>&format=png           -> immagine per og:image
 *   GET ?type=poi&id=<uuid>&format=svg           -> immagine in SVG (debug)
 *
 * Questa funzione va servita senza verifica JWT (vedi config.toml).
 */
import { corsHeaders } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";

const SITE_URL = Deno.env.get("SENTI_SITE_URL") ?? "";

/**
 * URL pubblico base delle Edge Functions, es. https://<progetto>.supabase.co/functions/v1
 *
 * Serve perché dentro il container `req.url` è l'indirizzo INTERNO
 * (http://supabase_edge_runtime_...:8081/share): metterlo in og:image
 * renderebbe l'anteprima WhatsApp impossibile da scaricare.
 */
const FUNCTIONS_URL = Deno.env.get("SENTI_FUNCTIONS_URL") ?? "";

/** Costruisce un URL pubblico e assoluto verso questa stessa funzione. */
function buildShareUrl(req: Request, params: URLSearchParams): string {
  const qs = params.toString();

  // 1. Configurazione esplicita: è la via affidabile in produzione.
  if (FUNCTIONS_URL) {
    return `${FUNCTIONS_URL.replace(/\/$/, "")}/share?${qs}`;
  }

  // 2. Header inoltrati dal gateway. Attenzione: l'host può arrivare senza
  //    porta, e un URL senza porta punta a 80/443 (in locale non risponde).
  const fwdProto = req.headers.get("x-forwarded-proto") ?? "https";
  const fwdPort = req.headers.get("x-forwarded-port");
  const rawHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");

  if (rawHost && !rawHost.startsWith("supabase_edge_runtime")) {
    let host = rawHost;
    if (!host.includes(":") && fwdPort && fwdPort !== "80" && fwdPort !== "443") {
      host = `${host}:${fwdPort}`;
    }
    return `${fwdProto}://${host}/functions/v1/share?${qs}`;
  }

  // 3. Ultimo fallback: stack locale.
  return `http://127.0.0.1:54321/functions/v1/share?${qs}`;
}

// --- Rasterizzazione SVG -> PNG ---------------------------------------------
// resvg gira in WebAssembly e NON vede i font di sistema: senza fontBuffers
// scarta silenziosamente tutto il testo e rasterizza solo lo sfondo. I font
// vanno quindi incorporati (Noto Serif, licenza SIL OFL, in ./fonts).
const FONT_FAMILY = "Noto Serif";

let resvgReady: Promise<typeof import("npm:@resvg/resvg-wasm@2.6.2")> | null = null;
let fontsReady: Promise<Uint8Array[]> | null = null;

async function loadResvg() {
  if (!resvgReady) {
    resvgReady = (async () => {
      const mod = await import("npm:@resvg/resvg-wasm@2.6.2");
      await mod.initWasm(
        fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm"),
      );
      return mod;
    })();
  }
  return resvgReady;
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function loadFonts(): Promise<Uint8Array[]> {
  if (!fontsReady) {
    fontsReady = (async () => {
      // Import dinamico: i font pesano, si caricano solo quando serve un'immagine.
      const [{ regularBase64 }, { boldBase64 }] = await Promise.all([
        import("./fonts/regular.ts"),
        import("./fonts/bold.ts"),
      ]);
      return [decodeBase64(regularBase64), decodeBase64(boldBase64)];
    })();
  }
  return fontsReady;
}

async function svgToPng(svg: string): Promise<Uint8Array | null> {
  try {
    const [{ Resvg }, fontBuffers] = await Promise.all([loadResvg(), loadFonts()]);
    const r = new Resvg(svg, {
      fitTo: { mode: "width", value: 1200 },
      font: {
        fontBuffers,
        defaultFontFamily: FONT_FAMILY,
        loadSystemFonts: false,
      },
    });
    return r.render().asPng();
  } catch (e) {
    console.error("Rasterizzazione PNG fallita, servo SVG:", String(e));
    return null;
  }
}

// --- Utilità ----------------------------------------------------------------
function esc(s: unknown): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Manda a capo un testo su più righe per l'SVG (nessun word-wrap automatico). */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars) {
      lines.push(cur.trim());
      cur = w;
      if (lines.length === maxLines) break;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur.trim());
  if (lines.length === maxLines && words.length > lines.join(" ").split(/\s+/).length) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/[.,;:]?$/, "…");
  }
  return lines;
}

// --- Immagine Open Graph (estetica "carta antica") --------------------------
function buildSvg(opts: {
  kicker: string;
  title: string;
  subtitle: string;
  footer: string;
}): string {
  const titleLines = wrap(opts.title, 26, 3);
  const subLines = wrap(opts.subtitle, 60, 2);
  const titleY = 250 - (titleLines.length - 1) * 34;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="carta" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f3e8cd"/>
      <stop offset="100%" stop-color="#e3d2ad"/>
    </linearGradient>
    <filter id="grana">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" result="n"/>
      <feColorMatrix in="n" type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.06"/></feComponentTransfer>
    </filter>
  </defs>

  <rect width="1200" height="630" fill="url(#carta)"/>
  <rect width="1200" height="630" filter="url(#grana)" opacity="0.5"/>

  <!-- curve di livello accennate -->
  <g stroke="#8a7550" stroke-width="1.5" fill="none" opacity="0.35">
    <path d="M-40 470 C 220 400, 420 520, 700 440 S 1040 380, 1240 430"/>
    <path d="M-40 520 C 240 450, 440 570, 720 490 S 1060 430, 1240 480"/>
    <path d="M-40 570 C 260 500, 460 620, 740 540 S 1080 480, 1240 530"/>
  </g>

  <rect x="36" y="36" width="1128" height="558" fill="none" stroke="#6b5537" stroke-width="3"/>

  <text x="88" y="130" font-family="Noto Serif, Georgia, serif" font-size="26"
        letter-spacing="6" fill="#7a6440">${esc(opts.kicker.toUpperCase())}</text>

  ${titleLines.map((l, i) =>
    `<text x="88" y="${titleY + i * 74}" font-family="Noto Serif, Georgia, serif" font-size="66" font-weight="bold" fill="#2f2415">${esc(l)}</text>`
  ).join("\n  ")}

  ${subLines.map((l, i) =>
    `<text x="88" y="${titleY + titleLines.length * 74 + 22 + i * 38}" font-family="Noto Serif, Georgia, serif" font-size="30" fill="#5a4a30">${esc(l)}</text>`
  ).join("\n  ")}

  <text x="88" y="556" font-family="Noto Serif, Georgia, serif" font-size="26" fill="#7a6440">${esc(opts.footer)}</text>
  <text x="1112" y="556" text-anchor="end" font-family="Noto Serif, Georgia, serif"
        font-size="30" font-weight="bold" letter-spacing="3" fill="#2f2415">SENTI</text>
</svg>`;
}

// --- Pagina HTML ------------------------------------------------------------
function buildHtml(opts: {
  title: string;
  description: string;
  imageUrl: string;
  canonical: string;
  appUrl: string;
  lang: string;
  bodyHtml: string;
}): string {
  return `<!doctype html>
<html lang="${esc(opts.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)} — Senti</title>
<meta name="description" content="${esc(opts.description)}">

<meta property="og:type" content="article">
<meta property="og:site_name" content="Senti">
<meta property="og:locale" content="${opts.lang === "en" ? "en_GB" : "it_IT"}">
<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="${esc(opts.description)}">
<meta property="og:url" content="${esc(opts.canonical)}">
<meta property="og:image" content="${esc(opts.imageUrl)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(opts.title)}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(opts.title)}">
<meta name="twitter:description" content="${esc(opts.description)}">
<meta name="twitter:image" content="${esc(opts.imageUrl)}">

<style>
  :root { color-scheme: light dark; }
  body { margin:0; font-family: Georgia, 'Times New Roman', serif;
         background:#f3e8cd; color:#2f2415; line-height:1.6; }
  main { max-width: 44rem; margin: 0 auto; padding: 1.5rem 1.25rem 4rem; }
  .kicker { letter-spacing:.28em; text-transform:uppercase; font-size:.78rem; color:#7a6440; }
  h1 { font-size: clamp(1.8rem, 6vw, 2.6rem); margin:.35rem 0 1rem; line-height:1.15; }
  .memoria { border-left:3px solid #b39a6c; padding:.15rem 0 .15rem 1rem; margin:1.25rem 0; }
  .testimone { font-size:.9rem; color:#6b5537; margin-top:.35rem; }
  .cta { display:inline-block; margin-top:2rem; padding:.9rem 1.4rem;
         background:#2f2415; color:#f3e8cd; text-decoration:none; border-radius:.5rem;
         font-size:1.05rem; }
  img.hero { width:100%; height:auto; border:2px solid #6b5537; margin-bottom:1.25rem; }
  @media (prefers-color-scheme: dark) {
    body { background:#221a10; color:#efe3c8; }
    .cta { background:#efe3c8; color:#221a10; }
    .testimone { color:#c3ac82; }
  }
</style>
</head>
<body>
<main>
  <img class="hero" src="${esc(opts.imageUrl)}" alt="${esc(opts.title)}" width="1200" height="630">
  ${opts.bodyHtml}
  ${opts.appUrl ? `<a class="cta" href="${esc(opts.appUrl)}">Apri in Senti</a>` : ""}
</main>
</body>
</html>`;
}

// --- Handler ----------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "poi";
  const id = url.searchParams.get("id");
  const lang = url.searchParams.get("lang") === "en" ? "en" : "it";
  const format = url.searchParams.get("format");

  if (!id) {
    return new Response("Parametro 'id' mancante", { status: 400, headers: corsHeaders });
  }
  if (type !== "poi" && type !== "route") {
    return new Response("'type' deve essere 'poi' o 'route'", {
      status: 400,
      headers: corsHeaders,
    });
  }

  const db = adminClient();

  let kicker = "";
  let title = "";
  let description = "";
  let footer = "Senti — memorie del territorio";
  let bodyHtml = "";

  if (type === "poi") {
    const { data: poi } = await db
      .from("v_pois_public")
      .select("id, name, description")
      .eq("id", id)
      .maybeSingle();
    if (!poi) {
      return new Response("Luogo non trovato", { status: 404, headers: corsHeaders });
    }

    const { data: memories } = await db
      .from("v_contributions_public")
      .select("id, body, transcript, narrator_name, narrator_birth_year")
      .eq("poi_id", id)
      .order("created_at", { ascending: true })
      .limit(3);

    const all = memories ?? [];
    const n = all.length;
    kicker = lang === "en" ? "A place with memories" : "Un luogo raccontato";
    title = poi.name ?? "";
    description = n > 0
      ? (lang === "en"
        ? `${n} ${n === 1 ? "memory" : "memories"} told by witnesses.`
        : `${n} ${n === 1 ? "memoria" : "memorie"} raccontate da chi c'era.`)
      : (poi.description ??
        (lang === "en" ? "A place still without memories." : "Un luogo ancora senza memorie."));
    footer = n > 0
      ? (lang === "en" ? `${n} voices` : `${n} voci`)
      : (lang === "en" ? "Be the first voice" : "Sii la prima voce");

    bodyHtml = `<p class="kicker">${esc(kicker)}</p>
  <h1>${esc(title)}</h1>
  ${poi.description ? `<p>${esc(poi.description)}</p>` : ""}
  ${all.map((m) => {
      const testo = (m.body ?? m.transcript ?? "").trim();
      if (!testo) return "";
      const anno = m.narrator_birth_year ? `, ${m.narrator_birth_year}` : "";
      return `<div class="memoria"><p>«${esc(testo)}»</p>
      <p class="testimone">— ${esc(m.narrator_name ?? "Voce anonima")}${esc(anno)}</p></div>`;
    }).join("\n  ")}`;
  } else {
    const { data: route } = await db
      .from("v_routes_public")
      .select("id, kind, title, actor, length_m")
      .eq("id", id)
      .maybeSingle();
    if (!route) {
      return new Response("Percorso non trovato", { status: 404, headers: corsHeaders });
    }

    const { data: segs } = await db
      .from("route_segments")
      .select("certainty")
      .eq("route_id", id);

    const counts = { attestato: 0, probabile: 0, ipotetico: 0 } as Record<string, number>;
    for (const s of segs ?? []) counts[s.certainty] = (counts[s.certainty] ?? 0) + 1;
    const km = route.length_m ? (route.length_m / 1000).toFixed(1) : null;

    kicker = route.kind === "campagna"
      ? (lang === "en" ? "Campaign" : "Campagna")
      : (lang === "en" ? "Trail" : "Sentiero");
    title = route.title ?? "";
    const certLabel = lang === "en"
      ? `${counts.attestato} attested, ${counts.probabile} probable, ${counts.ipotetico} hypothetical`
      : `${counts.attestato} attestati, ${counts.probabile} probabili, ${counts.ipotetico} ipotetici`;
    description = [route.actor, km ? `${km} km` : null, certLabel]
      .filter(Boolean).join(" · ");
    footer = km ? `${km} km` : footer;

    bodyHtml = `<p class="kicker">${esc(kicker)}${route.actor ? ` · ${esc(route.actor)}` : ""}</p>
  <h1>${esc(title)}</h1>
  <p>${esc(description)}</p>
  <p class="testimone">${lang === "en"
      ? "Certainty is visible: solid line = attested, dashed = probable, dotted = hypothetical."
      : "La certezza è visibile: linea continua = attestato, tratteggiata = probabile, punteggiata = ipotetico."}</p>`;
  }

  // Immagine richiesta esplicitamente.
  if (format === "png" || format === "svg") {
    const svg = buildSvg({ kicker, title, subtitle: description, footer });
    if (format === "svg") {
      return new Response(svg, {
        headers: {
          ...corsHeaders,
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
    const png = await svgToPng(svg);
    if (png) {
      return new Response(png, {
        headers: {
          ...corsHeaders,
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
    // Fallback: se la rasterizzazione non è disponibile, meglio l'SVG che nulla.
    return new Response(svg, {
      headers: {
        ...corsHeaders,
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  }

  // Pagina HTML con i meta tag. Gli URL devono essere PUBBLICI e assoluti,
  // altrimenti WhatsApp non riesce a scaricare l'immagine di anteprima.
  const canonicalParams = new URLSearchParams({ type, id, lang });
  const imageParams = new URLSearchParams({ type, id, lang, format: "png" });
  const canonicalUrl = buildShareUrl(req, canonicalParams);
  const imageUrl = buildShareUrl(req, imageParams);

  const appUrl = SITE_URL
    ? `${SITE_URL.replace(/\/$/, "")}/${lang}/${type === "poi" ? "luogo" : "percorso"}/${id}/`
    : "";

  const html = buildHtml({
    title,
    description,
    imageUrl,
    canonical: canonicalUrl,
    appUrl,
    lang,
    bodyHtml,
  });

  return new Response(html, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
});
