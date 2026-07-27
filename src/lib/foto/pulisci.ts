/**
 * Ripulisce una foto dai metadati (EXIF, incluso il GPS).
 *
 * Ridisegnando l'immagine su un canvas e ri-esportandola, TUTTI i metadati EXIF
 * vengono persi: la foto risultante non contiene le coordinate del luogo. Ne
 * approfitta anche per ridimensionare le foto enormi (peso e privacy).
 */
export async function pulisciFoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
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
