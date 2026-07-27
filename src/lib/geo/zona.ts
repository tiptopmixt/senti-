/**
 * Zona ampia, mai il punto esatto.
 *
 * Il punto preciso (GPS o tocco) serve solo a calcolare un CENTRO scostato a
 * caso, poi si scarta. Sulla mappa la memoria è sempre un cerchio ampio.
 */

const R_TERRA = 6378137; // raggio terrestre (m)

/** Sposta un punto di `distanzaM` metri lungo il rilevamento `bearingRad`. */
export function spostaPunto(
  lon: number,
  lat: number,
  distanzaM: number,
  bearingRad: number,
): [number, number] {
  const d = distanzaM / R_TERRA;
  const f1 = (lat * Math.PI) / 180;
  const l1 = (lon * Math.PI) / 180;
  const f2 = Math.asin(
    Math.sin(f1) * Math.cos(d) + Math.cos(f1) * Math.sin(d) * Math.cos(bearingRad),
  );
  const l2 =
    l1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(d) * Math.cos(f1),
      Math.cos(d) - Math.sin(f1) * Math.sin(f2),
    );
  const lonOut = (((l2 * 180) / Math.PI + 540) % 360) - 180;
  return [lonOut, (f2 * 180) / Math.PI];
}

/**
 * Centro OFFUSCATO: sposta il punto preciso di una distanza casuale (fino a ~45%
 * del raggio) in una direzione casuale. Così il vero punto non coincide col
 * centro del cerchio e resta comunque dentro la zona. Il punto preciso non viene
 * mai inviato né memorizzato: qui si scarta subito dopo il calcolo.
 */
export function centroOffuscato(
  lon: number,
  lat: number,
  raggioM: number,
): [number, number] {
  const distanza = Math.random() * raggioM * 0.45;
  const bearing = Math.random() * 2 * Math.PI;
  return spostaPunto(lon, lat, distanza, bearing);
}

/** Poligono (cerchio) per disegnare la zona ampia sulla mappa. */
export function cerchioGeoJSON(
  lon: number,
  lat: number,
  raggioM: number,
  punti = 48,
): GeoJSON.Polygon {
  const anello: [number, number][] = [];
  for (let i = 0; i <= punti; i++) {
    anello.push(spostaPunto(lon, lat, raggioM, (i / punti) * 2 * Math.PI));
  }
  return { type: "Polygon", coordinates: [anello] };
}
