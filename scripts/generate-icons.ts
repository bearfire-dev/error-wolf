import { mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { Resvg } from "@resvg/resvg-js"
import pngToIco from "png-to-ico"

const ROOT = fileURLToPath(new URL("..", import.meta.url))

const LOGO_SVG_FILE = join(ROOT, "public", "logo.svg")

/** `:root` `--primary` in app/globals.css (oklch 0.55 0.16 150). */
const LIGHT_UI_PATH_FILL = "#008a39"
/** `:root` `--background` (oklch 0.985 0.008 95). */
const LIGHT_UI_BG = "#fcfaf4"

/** `.dark` `--primary` (oklch 0.82 0.2 145). */
const DARK_UI_PATH_FILL = "#60e56b"
/** `.dark` `--background` (oklch 0.1 0.008 150). */
const DARK_UI_BG = "#020403"

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

function stripXmlComments(svg: string): string {
  return svg.replace(/<!--[\s\S]*?-->/gu, "")
}

/**
 * Removes authored `<style>`, applies `pathFill` to `.cls-0` paths, optional
 * circle strip, then full-viewBox background for raster export.
 */
export function buildRasterSvg(
  rawSvg: string,
  pathFill: string,
  bgHex: string
): string {
  let s = stripXmlComments(rawSvg)
  s = s.replace(/<style[^>]*>[\s\S]*?<\/style>\s*/iu, "")
  s = s.replace(/<circle\b[^/]*\/>/gu, "")
  s = s.replace(/class="cls-0"/gu, `fill="${pathFill}"`)
  const vb = parseViewBoxRect(s)
  const rect = vb
    ? `<rect x="${vb.x}" y="${vb.y}" width="${vb.width}" height="${vb.height}" fill="${bgHex}"/>`
    : `<rect width="100%" height="100%" fill="${bgHex}"/>`
  return insertDirectlyAfterSvgOpenTag(s, rect)
}

function renderSvgToPng(svg: string, widthPx: number): Uint8Array {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: widthPx },
  })
  return resvg.render().asPng()
}

async function rmIfExists(path: string) {
  try {
    await unlink(path)
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? e.code : null
    if (code !== "ENOENT") {
      throw e
    }
  }
}

async function main() {
  const raw = await readFile(LOGO_SVG_FILE, "utf8")

  const lightSvg = buildRasterSvg(raw, LIGHT_UI_PATH_FILL, LIGHT_UI_BG)
  const darkSvg = buildRasterSvg(raw, DARK_UI_PATH_FILL, DARK_UI_BG)

  const light16 = renderSvgToPng(lightSvg, 16)
  const light32 = renderSvgToPng(lightSvg, 32)
  const dark16 = renderSvgToPng(darkSvg, 16)
  const dark32 = renderSvgToPng(darkSvg, 32)

  const faviconLightIco = join(ROOT, "public", "favicon-light.ico")
  const faviconDarkIco = join(ROOT, "public", "favicon-dark.ico")
  const appleTouch = join(ROOT, "app", "apple-icon.png")
  const logo192 = join(ROOT, "public", "logo192.png")
  const logo512 = join(ROOT, "public", "logo512.png")

  const icoLight = await pngToIco([Buffer.from(light16), Buffer.from(light32)])
  const icoDark = await pngToIco([Buffer.from(dark16), Buffer.from(dark32)])

  await mkdir(dirname(faviconLightIco), { recursive: true })
  await mkdir(dirname(appleTouch), { recursive: true })

  await writeFile(faviconLightIco, icoLight)
  await writeFile(faviconDarkIco, icoDark)
  await writeFile(appleTouch, renderSvgToPng(darkSvg, 180))
  await writeFile(logo192, renderSvgToPng(darkSvg, 192))
  await writeFile(logo512, renderSvgToPng(darkSvg, 512))

  await rmIfExists(join(ROOT, "app", "favicon.ico"))
  await rmIfExists(join(ROOT, "app", "icon1.png"))
  await rmIfExists(join(ROOT, "app", "icon2.png"))

  console.log(`Wrote ${faviconLightIco}`)
  console.log(`Wrote ${faviconDarkIco}`)
  console.log(`Wrote ${appleTouch}`)
  console.log(`Wrote ${logo192}`)
  console.log(`Wrote ${logo512}`)
  console.log("Removed legacy app/favicon.ico, app/icon1.png, app/icon2.png")
}

void main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
