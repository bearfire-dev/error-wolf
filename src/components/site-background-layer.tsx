/**
 * The source is a 5472x3648 Unsplash JPEG (2.8 MB). `next/image` resized it per
 * request; vite-imagetools now resizes it once at build time. The photo lives
 * in `src/assets` and not in `public/`, so only the generated variants ship.
 * Quality 60 matches the old `next/image` setting.
 */
import backgroundPhoto from "@/assets/jarden-bellamkonda-hiqo3s7-VZA-unsplash.jpg?w=768;1280;1920;2560&format=avif;webp;jpg&quality=60&as=picture"

import { cn } from "@/lib/utils"

export function SiteBackgroundLayer() {
  return (
    <div
      className={cn(
        "bg-photo-strip-mask pointer-events-none fixed inset-x-0 bottom-0 z-0 w-full"
      )}
      aria-hidden
    >
      <div className="bg-photo-strip-opacity w-full">
        <div
          className="bg-photo-strip-inner relative w-full max-w-full"
          style={{
            aspectRatio: `${backgroundPhoto.img.w} / ${backgroundPhoto.img.h}`,
          }}
        >
          <picture>
            {Object.entries(backgroundPhoto.sources).map(([format, srcSet]) => (
              <source
                key={format}
                type={`image/${format}`}
                srcSet={srcSet}
                sizes="100vw"
              />
            ))}
            <img
              src={backgroundPhoto.img.src}
              alt=""
              width={backgroundPhoto.img.w}
              height={backgroundPhoto.img.h}
              sizes="100vw"
              loading="eager"
              decoding="async"
              fetchPriority="high"
              draggable={false}
              className="absolute inset-0 size-full object-cover"
              style={{
                objectPosition: "var(--bg-photo-pos-x) var(--bg-photo-pos-y)",
              }}
            />
          </picture>
        </div>
      </div>
    </div>
  )
}
