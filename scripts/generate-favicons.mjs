/**
 * Generates universal favicon assets in public/ (run after changing the N mark).
 * Usage: node scripts/generate-favicons.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <rect width="32" height="32" rx="7" fill="#0B0B0F"/>
  <path d="M10 24V8h2.5l7.5 10.5V8H22.5v16h-2.5l-7.5-10.5V24H10z" fill="#1274F9"/>
</svg>`;

const APPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" fill="none">
  <rect width="180" height="180" rx="40" fill="#0B0B0F"/>
  <path d="M56 134V46h14l42 59V46H124v88h-14l-42-59v59H56z" fill="#1274F9"/>
</svg>`;

async function writePng(name, svg) {
  await sharp(Buffer.from(svg)).png().toFile(path.join(publicDir, name));
}

async function writeIco() {
  const sizes = [16, 32, 48];
  const pngBuffers = await Promise.all(
    sizes.map((size) =>
      sharp(Buffer.from(ICON_SVG)).resize(size, size).png().toBuffer(),
    ),
  );

  const images = pngBuffers.map((buf, i) => ({ size: sizes[i], buf }));
  const headerSize = 6 + images.length * 16;
  let offset = headerSize;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  images.forEach((img, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(img.size === 256 ? 0 : img.size, entry);
    header.writeUInt8(img.size === 256 ? 0 : img.size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(img.buf.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += img.buf.length;
  });

  await writeFile(
    path.join(publicDir, "favicon.ico"),
    Buffer.concat([header, ...images.map((i) => i.buf)]),
  );
}

await mkdir(publicDir, { recursive: true });
await writeFile(path.join(publicDir, "icon.svg"), ICON_SVG);
await writePng("favicon-32x32.png", ICON_SVG);
await writePng("apple-icon.png", APPLE_SVG);
await writeIco();
console.log("Wrote public/favicon.ico, favicon-32x32.png, apple-icon.png, icon.svg");
