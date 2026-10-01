// Builds shellcheck-icons.woff from the SVGs in icons/. Each SVG must be a
// 16x16 filled path, and its code point must match the `fontCharacter` in
// package.json.
import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { SVGIcons2SVGFontStream } from "svgicons2svgfont";
import svg2ttf from "svg2ttf";
import ttf2woff from "ttf2woff";

const ICONS = { "shellcheck-logo": 0xe000 };
const here = new URL("./", import.meta.url);

const svgFont = await new Promise((resolve, reject) => {
  const chunks = [];
  const fontStream = new SVGIcons2SVGFontStream({
    fontName: "shellcheck-icons",
    fontHeight: 1000,
    // Ascent of a full em and no descent, as VS Code's own codicon font has,
    // so the glyph sits on the text line like a codicon.
    descent: 0,
    log: () => {},
  });
  fontStream
    .on("data", (chunk) => chunks.push(chunk))
    .on("end", () => resolve(Buffer.concat(chunks).toString()))
    .on("error", reject);
  for (const [name, codePoint] of Object.entries(ICONS)) {
    const glyph = createReadStream(new URL(`icons/${name}.svg`, here));
    glyph.metadata = { name, unicode: [String.fromCodePoint(codePoint)] };
    fontStream.write(glyph);
  }
  fontStream.end();
});

// A fixed timestamp keeps a rebuild byte-identical.
const ttf = svg2ttf(svgFont, { ts: 0 }).buffer;
await writeFile(new URL("shellcheck-icons.woff", here), ttf2woff(ttf));
