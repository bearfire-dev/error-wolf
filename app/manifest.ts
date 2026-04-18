import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "error-wolf",
    short_name: "error-wolf",
    description: "collapse noisy stacks. ship clean issues.",
    start_url: "/",
    display: "standalone",
    background_color: "#020403",
    theme_color: "#60e56b",
    icons: [
      {
        src: "/logo192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/logo512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  }
}
