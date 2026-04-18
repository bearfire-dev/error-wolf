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
        <div className="bg-photo-strip-inner relative w-full">
          <Image
            src={jardenPhoto}
            alt=""
            width={jardenPhoto.width}
            height={jardenPhoto.height}
            sizes="100vw"
            quality={75}
            loading="lazy"
            draggable={false}
            className="h-auto w-full max-w-full"
            style={{
              objectPosition:
                "var(--bg-photo-pos-x) var(--bg-photo-pos-y)",
            }}
          />
        </div>
      </div>
    </div>
  )
}
