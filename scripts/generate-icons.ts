import { mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { Resvg } from "@resvg/resvg-js"
import { PNG } from "pngjs"
import pngToIco from "png-to-ico"

const ROOT = fileURLToPath(new URL("..", import.meta.url))

const LOGO_SVG_FILE = join(ROOT, "public", "logo.svg")

/** `.dark` `--primary` (oklch 0.82 0.2 145). Single favicon + PWA / OG glyph. */
const SITE_ICON_PATH_FILL = "#60e56b"

/**
 * Transparent pixels with alpha below this (and exterior flood) count as "empty"
 * for hole detection. Keeps anti-aliased glyph edges out of the flood.
 */
const HOLE_FLOOD_ALPHA_MAX = 10

function stripXmlComments(svg: string): string {
  return svg.replace(/<!--[\s\S]*?-->/gu, "")
}

/**
 * Prepares `public/logo.svg` for raster export: strips comments/styles, applies
 * path fill. No full-canvas background — transparency is preserved outside the
 * logo shape.
 */
export function buildRasterSvg(rawSvg: string, pathFill: string): string {
  let s = stripXmlComments(rawSvg)
  s = s.replace(/<style[^>]*>[\s\S]*?<\/style>\s*/iu, "")
  s = s.replace(/<circle\b[^/]*\/>/gu, "")
  s = s.replace(/class="cls-0"/gu, `fill="${pathFill}"`)
  return s
}

/**
 * Opaque black (#000) in enclosed transparent regions only. Pixels that can
 * reach the image edge through low-alpha seams stay transparent
 * (area outside the logo).
 */
function fillInteriorHolesBlack(rgba: Uint8Array, width: number, height: number) {
  const pix = width * height
  const exterior = new Uint8Array(pix)
  const stack: number[] = []

  const isClear = (i: number) => rgba[i * 4 + 3] < HOLE_FLOOD_ALPHA_MAX

  const pushIf = (idx: number) => {
    if (!isClear(idx) || exterior[idx]) {
      return
    }
    exterior[idx] = 1
    stack.push(idx)
  }

  for (let x = 0; x < width; x++) {
    pushIf(x)
    pushIf((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    pushIf(y * width)
    pushIf(y * width + width - 1)
  }

  while (stack.length > 0) {
    const idx = stack.pop()
    if (idx === undefined) {
      break
    }
    const x = idx % width
    const y = (idx / width) | 0
    if (x + 1 < width) {
      pushIf(idx + 1)
    }
    if (x > 0) {
      pushIf(idx - 1)
    }
    if (y + 1 < height) {
      pushIf(idx + width)
    }
    if (y > 0) {
      pushIf(idx - width)
    }
  }

  for (let i = 0; i < pix; i++) {
    if (exterior[i] !== 0 || !isClear(i)) {
      continue
    }
    const o = i * 4
    rgba[o] = 0
    rgba[o + 1] = 0
    rgba[o + 2] = 0
    rgba[o + 3] = 255
  }
}

function renderSvgToPng(svg: string, widthPx: number): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: widthPx },
  })
  const rendered = resvg.render()
  const w = rendered.width
  const h = rendered.height
  const rgba = new Uint8Array(rendered.pixels)
  fillInteriorHolesBlack(rgba, w, h)
  const png = new PNG({ width: w, height: h })
  png.data.set(rgba)
  return PNG.sync.write(png)
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

  const iconSvg = buildRasterSvg(raw, SITE_ICON_PATH_FILL)

  const icon16 = renderSvgToPng(iconSvg, 16)
  const icon32 = renderSvgToPng(iconSvg, 32)

  const faviconIco = join(ROOT, "public", "favicon-dark.ico")
  const appleTouch = join(ROOT, "app", "apple-icon.png")
  const logo192 = join(ROOT, "public", "logo192.png")
  const logo512 = join(ROOT, "public", "logo512.png")

  const ico = await pngToIco([icon16, icon32])

  await mkdir(dirname(faviconIco), { recursive: true })
  await mkdir(dirname(appleTouch), { recursive: true })

  await writeFile(faviconIco, ico)
  await writeFile(appleTouch, renderSvgToPng(iconSvg, 180))
  await writeFile(logo192, renderSvgToPng(iconSvg, 192))
  await writeFile(logo512, renderSvgToPng(iconSvg, 512))

  await rmIfExists(join(ROOT, "public", "favicon-light.ico"))

  await rmIfExists(join(ROOT, "app", "favicon.ico"))
  await rmIfExists(join(ROOT, "app", "icon1.png"))
  await rmIfExists(join(ROOT, "app", "icon2.png"))

  console.log(`Wrote ${faviconIco}`)
  console.log(`Wrote ${appleTouch}`)
  console.log(`Wrote ${logo192}`)
  console.log(`Wrote ${logo512}`)
  console.log("Removed legacy app/favicon.ico, app/icon1.png, app/icon2.png")
}

void main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
