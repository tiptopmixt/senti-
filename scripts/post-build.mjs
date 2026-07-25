// Ritocchi all'export statico per GitHub Pages, eseguiti dopo `next build`.
//
//  - .nojekyll: senza, GitHub Pages ignora la cartella _next (inizia con "_").
//  - index.html alla radice: l'export non genera una home per il dominio nudo
//    (le pagine sono /it/ e /en/). Qui si crea un redirect che sceglie la lingua
//    dal browser. Usa percorsi relativi, così funziona anche sotto un basePath.
//  - 404.html: stesso redirect, così un indirizzo sconosciuto atterra comunque
//    sulla home nella lingua giusta.

import { writeFileSync, existsSync } from "node:fs";

const OUT = "out";
if (!existsSync(OUT)) {
  console.error("[post-build] cartella out/ assente: eseguo dopo `next build`?");
  process.exit(0);
}

writeFileSync(`${OUT}/.nojekyll`, "");

const redirect = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<title>Senti</title>
<script>
  (function () {
    var lang = (navigator.language || "it").toLowerCase().indexOf("en") === 0 ? "en" : "it";
    location.replace("./" + lang + "/" + location.search + location.hash);
  })();
</script>
<meta http-equiv="refresh" content="0; url=./it/">
</head>
<body>Senti — <a href="./it/">apri</a></body>
</html>
`;

writeFileSync(`${OUT}/index.html`, redirect);
writeFileSync(`${OUT}/404.html`, redirect);

console.log("[post-build] .nojekyll, index.html e 404.html creati in out/");
