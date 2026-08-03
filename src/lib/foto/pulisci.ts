/**
 * Ripulisce una foto dai metadati (EXIF, incluso il GPS).
 *
 * Ridisegnando l'immagine su un canvas e ri-esportandola, TUTTI i metadati EXIF
 * vengono persi: la foto risultante non contiene le coordinate del luogo. Ne
 * approfitta anche per ridimensionare le foto enormi (peso e privacy).
 *
 * I formati HEIC/HEIF (tipici di iPhone) vengono convertiti in JPEG prima
 * dell'elaborazione. Se la conversione fallisce, lancia un errore con un
 * messaggio comprensibile (non tecnico).
 */

/** Rileva se il file è in formato HEIC/HEIF (dall'estensione o dal tipo MIME). */
function isHeic(file: File): boolean {
  const tipo = file.type.toLowerCase();
  if (tipo === "image/heic" || tipo === "image/heif") return true;
  const nome = file.name.toLowerCase();
  return nome.endsWith(".heic") || nome.endsWith(".heif");
}

/** Converte un file HEIC/HEIF in un Blob JPEG. */
async function convertiHeic(file: File): Promise<Blob> {
  const heic2any = (await import("heic2any")).default;
  const risultato = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.9,
  });
  return Array.isArray(risultato) ? risultato[0] : risultato;
}

export async function pulisciFoto(file: File): Promise<Blob> {
  let sorgente: Blob = file;

  if (isHeic(file)) {
    try {
      sorgente = await convertiHeic(file);
    } catch {
      throw new Error(
        "Questo formato foto non è supportato. Prova con un'altra immagine (JPEG, PNG o WebP).",
      );
    }
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(sorgente);
  } catch {
    throw new Error(
      "Impossibile aprire la foto. Prova con un'altra immagine (JPEG, PNG o WebP).",
    );
  }

  try {
    const maxLato = 2000;
    const scala = Math.min(1, maxLato / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scala));
    const h = Math.max(1, Math.round(bitmap.height * scala));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Impossibile elaborare la foto");
    ctx.drawImage(bitmap, 0, 0, w, h);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Impossibile elaborare la foto"))),
        "image/jpeg",
        0.85,
      );
    });
  } finally {
    bitmap.close?.();
  }
}
