// Genera l'immagine di anteprima (Open Graph) per la condivisione del link.
// 1200x630, tema pergamena/mappa. Rasterizza un SVG in PNG con sharp.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const W = 1200;
const H = 630;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#efe6cf"/>
      <stop offset="1" stop-color="#e3d4ad"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <!-- rotta stilizzata con frecce -->
  <path d="M 90 470 Q 380 300 620 400 T 1120 260" fill="none" stroke="#7a2f22" stroke-width="6" stroke-dasharray="2 18" stroke-linecap="round" opacity="0.55"/>
  <g font-family="Georgia, 'Times New Roman', serif" fill="#2f2415">
    <text x="90" y="210" font-size="132" font-weight="700">Senti</text>
    <text x="94" y="290" font-size="40" fill="#5c3a1e">La mappa mondiale dei ritrovamenti</text>
    <text x="94" y="345" font-size="40" fill="#5c3a1e">lungo le rotte dei grandi condottieri della storia.</text>
  </g>
  <text x="90" y="560" font-size="52">⚔️ &#160; 🗺️ &#160; 🏛️ &#160; 💎 &#160; 📜</text>
</svg>`;

await mkdir("public", { recursive: true });
await sharp(Buffer.from(svg)).png().toFile("public/senti-og.png");
console.log("[og] public/senti-og.png creata (1200x630)");
