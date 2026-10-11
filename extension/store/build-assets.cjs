"use strict";

// Render new vector promotional compositions. The existing raster logo is
// embedded unchanged, and the Store icon is an exact copy of the runtime icon.
// Run after installing website dependencies: node extension/store/build-assets.cjs OUTPUT_DIRECTORY
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("../../website/node_modules/sharp");

const output = process.argv[2];
if (!output) throw new Error("An output directory is required.");

async function main() {
  await fs.mkdir(output, { recursive: true });
  const logoFile = path.join(__dirname, "..", "icons", "default128.png");
  const logo = `data:image/png;base64,${(await fs.readFile(logoFile)).toString("base64")}`;
  const definitions = `<defs>
    <linearGradient id="background" x2="1" y2="1"><stop stop-color="#021748"/><stop offset="1" stop-color="#085bff"/></linearGradient>
    <linearGradient id="panel" x2="1" y2="1"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#eaf2ff"/></linearGradient>
  </defs>`;
  const question = `<rect width="236" height="110" rx="14" fill="url(#panel)"/>
    <rect x="18" y="18" width="139" height="6" rx="3" fill="#263d70"/>
    <rect x="18" y="32" width="178" height="4" rx="2" fill="#c0cee4"/>
    <g fill="#c0cee4"><circle cx="24" cy="54" r="4"/><circle cx="24" cy="72" r="4"/><circle cx="24" cy="90" r="4"/>
    <rect x="39" y="51" width="108" height="5" rx="2"/><rect x="39" y="69" width="145" height="5" rx="2"/><rect x="39" y="87" width="90" height="5" rx="2"/></g>
    <path d="M8 25V8h17m186 0h17v17M8 85v17h17m186 0h17V85" fill="none" stroke="#0860ff" stroke-width="2.5" stroke-linecap="round"/>`;
  const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="280" viewBox="0 0 440 280">
    ${definitions}<rect width="440" height="280" fill="url(#background)"/>
    <circle cx="428" cy="290" r="210" fill="#1673ff" opacity=".23"/>
    <circle cx="420" cy="280" r="158" fill="none" stroke="#75adff" opacity=".19"/>
    <image href="${logo}" x="28" y="30" width="72" height="72"/>
    <g fill="#fff" font-family="Arial, sans-serif"><text x="119" y="67" font-size="32" font-weight="700">Zenaian</text>
    <text x="120" y="90" font-size="15" fill="#bdd5ff">AI MCQ Assistant</text></g>
    <g transform="translate(28 133)">${question}</g>
    <path d="M281 188h27m-7-7 8 7-8 7" fill="none" stroke="#a9cfff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="326" y="154" width="76" height="76" rx="20" fill="#fff"/>
    <text x="364" y="207" text-anchor="middle" fill="#0756ed" font-family="Arial, sans-serif" font-size="49" font-weight="700">B</text>
    <text x="364" y="249" text-anchor="middle" fill="#c8dfff" font-family="Arial, sans-serif" font-size="11">Proposed answer</text>
  </svg>`;
  const marquee = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="560" viewBox="0 0 1400 560">
    ${definitions}<rect width="1400" height="560" fill="url(#background)"/>
    <circle cx="1410" cy="610" r="660" fill="#1673ff" opacity=".23"/>
    <circle cx="1370" cy="570" r="450" fill="none" stroke="#75adff" opacity=".19" stroke-width="2"/>
    <image href="${logo}" x="85" y="97" width="112" height="112"/>
    <g fill="#fff" font-family="Arial, sans-serif"><text x="222" y="169" font-size="64" font-weight="700">Zenaian</text>
    <text x="89" y="284" font-size="32" fill="#c7ddff">AI MCQ Assistant</text>
    <text x="89" y="349" font-size="38" font-weight="700">Capture. Review. Verify.</text>
    <text x="89" y="414" font-size="21" fill="#b6d1ff">Proposed answers through your extension icon.</text></g>
    <g transform="translate(765 169) scale(1.55)">${question}</g>
    <path d="M1153 254h34m-9-9 10 9-10 9" fill="none" stroke="#a9cfff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="1214" y="209" width="101" height="101" rx="26" fill="#fff"/>
    <text x="1265" y="279" text-anchor="middle" fill="#0756ed" font-family="Arial, sans-serif" font-size="65" font-weight="700">B</text>
    <text x="1265" y="344" text-anchor="middle" fill="#c8dfff" font-family="Arial, sans-serif" font-size="15">Proposed answer</text>
  </svg>`;
  for (const [name, source] of [["zenaian-store-tile-440x280", tile], ["zenaian-store-marquee-1400x560", marquee]]) {
    await fs.writeFile(path.join(output, `${name}.svg`), source);
    await sharp(Buffer.from(source)).flatten({ background: "#021748" }).png().toFile(path.join(output, `${name}.png`));
  }
  await fs.copyFile(logoFile, path.join(output, "zenaian-store-icon-128.png"));
  for (const name of ["zenaian-store-icon-128.png", "zenaian-store-tile-440x280.png", "zenaian-store-marquee-1400x560.png"]) {
    const metadata = await sharp(path.join(output, name)).metadata();
    console.log(`${name}: ${metadata.width}x${metadata.height} ${metadata.format}`);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
