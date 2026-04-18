import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { Resvg } from "@resvg/resvg-js"
import pngToIco from "png-to-ico"

const ROOT = fileURLToPath(new URL("..", import.meta.url))

const LOGO_SVG_FILE = join(ROOT, "public", "logo.svg")

/** Matches `.dark` `--background` in app/globals.css (oklch(0.1 0.008 150) → #020403). */
const FAVICON_SQUARE_BG = "#020403"

function parseViewBoxRect(svg: string): {
  x: number
  y: number
  width: number
  height: number
} | null {
  const m = svg.match(
    /viewBox="\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*"/u
  )
  if (!m) {
    return null
  }
  return {
    x: Number(m[1]),
    y: Number(m[2]),
    width: Number(m[3]),
    height: Number(m[4]),
  }
}

function insertDirectlyAfterSvgOpenTag(svg: string, snippet: string): string {
  const open = svg.indexOf("<svg")
  if (open === -1) {
    return svg
  }
  const afterOpen = svg.indexOf(">", open)
  if (afterOpen === -1) {
    return svg
  }
  return svg.slice(0, afterOpen + 1) + snippet + svg.slice(afterOpen + 1)
}

/**
 * Full-bleed background for raster icons; strips self-closing circles if present
 * (not used by the current wolf mark).
 */
export function prepareIconSvgForFaviconRaster(svg: string): string {
  const withoutCircles = svg.replace(/<circle\b[^/]*\/>/gu, "")
  const vb = parseViewBoxRect(svg)
  const rect = vb
    ? `<rect x="${vb.x}" y="${vb.y}" width="${vb.width}" height="${vb.height}" fill="${FAVICON_SQUARE_BG}"/>`
    : `<rect width="100%" height="100%" fill="${FAVICON_SQUARE_BG}"/>`
  return insertDirectlyAfterSvgOpenTag(withoutCircles, rect)
}

function renderSvgToPng(svg: string, widthPx: number): Uint8Array {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: widthPx },
  })
  return resvg.render().asPng()
}

async function main() {
  const iconSourceSvg = await readFile(LOGO_SVG_FILE, "utf8")
  const faviconSvg = prepareIconSvgForFaviconRaster(iconSourceSvg)

  const png16 = renderSvgToPng(faviconSvg, 16)
  const png32 = renderSvgToPng(faviconSvg, 32)
  const png180 = renderSvgToPng(faviconSvg, 180)
  const png192 = renderSvgToPng(faviconSvg, 192)
  const png512 = renderSvgToPng(faviconSvg, 512)

  const faviconIco = join(ROOT, "app", "favicon.ico")
  const appleTouch = join(ROOT, "app", "apple-icon.png")
  const icon1 = join(ROOT, "app", "icon1.png")
  const icon2 = join(ROOT, "app", "icon2.png")
  const logo192 = join(ROOT, "public", "logo192.png")
  const logo512 = join(ROOT, "public", "logo512.png")

  const icoBuffer = await pngToIco([Buffer.from(png16), Buffer.from(png32)])

  for (const dir of [dirname(faviconIco), dirname(logo192)]) {
    await mkdir(dir, { recursive: true })
  }

  await writeFile(faviconIco, icoBuffer)
  await writeFile(appleTouch, png180)
  await writeFile(icon1, png32)
  await writeFile(icon2, png16)
  await writeFile(logo192, png192)
  await writeFile(logo512, png512)

  console.log(`Wrote ${faviconIco}`)
  console.log(`Wrote ${appleTouch}`)
  console.log(`Wrote ${icon1} (32×32)`)
  console.log(`Wrote ${icon2} (16×16)`)
  console.log(`Wrote ${logo192}`)
  console.log(`Wrote ${logo512}`)
}

void main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
