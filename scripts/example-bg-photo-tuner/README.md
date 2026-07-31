# Example: background photo tuner (snapshot)

The **live app no longer ships** this HUD or the tune provider. The background look now comes only from the **`--bg-*` variables** in [`src/globals.css`](../../src/globals.css) and from [`SiteBackgroundLayer`](../../src/components/site-background-layer.tsx). That component builds a `<picture>` with vite-imagetools at quality `60`, and it takes the object position from the CSS variables.

This folder keeps **reference snapshots** if you want the same tuning workflow in another branch or project. The `.example.*` files are not imported by the build.

## Snapshot files

| File                                                                       | Notes                                                                     |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`background-tuner-hud.example.tsx`](background-tuner-hud.example.tsx)     | HUD UI: sliders, sessionStorage, copy-css.                                |
| [`bg-photo-tune-provider.example.tsx`](bg-photo-tune-provider.example.tsx) | React context + `useTheme` + applying vars to `document.documentElement`. |
| [`bg-photo-tune.example.ts`](bg-photo-tune.example.ts)                     | Types, defaults, clamping, storage keys, `formatTuneAsCssBlock`.          |

## What the tuner did (when wired)

- **Panel:** fixed top-right “bg tuner” with controls for opacity, mask stops, blur, brightness, contrast, saturation, object position, scale, image quality, mix-blend.
- **Storage:** per-theme JSON in `sessionStorage` under keys like `error-wolf:bg-photo-tune:light` / `:dark` (see `BG_PHOTO_STORAGE_PREFIX` in the `.example.ts` file).
- **Overrides:** set inline CSS variables on `document.documentElement` so utilities such as `.bg-photo-strip-mask` / `.bg-photo-strip-inner` updated live.
- **Copy css:** emitted `:root` / `.dark` blocks to paste into `globals.css`.

HUD visibility (when integrated): dev by default, or production with **`VITE_BG_TUNER=1`**.

## Wiring if you reintroduce it

`ThemeProvider` → `BgPhotoTuneProvider` → `SiteBackgroundLayer` + main shell + `BackgroundTunerHud`. The provider must be **inside** `ThemeProvider` (`useTheme`).

Restore **`src/lib/bg-photo-tune.ts`** from `bg-photo-tune.example.ts` (drop the snapshot header line), copy the two component snapshots back to `src/components/`, and point [`src/routes/__root.tsx`](../../src/routes/__root.tsx) at them again. The snapshots import `useTheme` from `next-themes`. Point them at `@/components/theme-provider` instead.

## Shipped defaults (this repo)

Edit **`src/globals.css`** `:root` and `.dark` for the `--bg-photo-*` and mask variables. Change the `quality` value in the imagetools import query in `site-background-layer.tsx` if needed.
