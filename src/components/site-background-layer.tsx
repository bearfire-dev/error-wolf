import Image from "next/image"

import jardenPhoto from "@/public/jarden-bellamkonda-hiqo3s7-VZA-unsplash.jpg"

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
            aspectRatio: `${jardenPhoto.width} / ${jardenPhoto.height}`,
          }}
        >
          <Image
            src={jardenPhoto}
            alt=""
            fill
            sizes="100vw"
            quality={60}
            loading="eager"
            draggable={false}
            className="object-cover"
            style={{
              objectPosition: "var(--bg-photo-pos-x) var(--bg-photo-pos-y)",
            }}
          />
        </div>
      </div>
    </div>
  )
}
