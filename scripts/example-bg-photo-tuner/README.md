# Example: background photo tuner (snapshot)

The **live app no longer ships** this HUD or the tune provider; background look is controlled only by **`--bg-*` variables** in [`app/globals.css`](../../app/globals.css) and [`SiteBackgroundLayer`](../../components/site-background-layer.tsx) (`next/image` quality `75`, object position from CSS vars).

This folder keeps **reference snapshots** if you want the same tuning workflow in another branch or project. The `.example.*` files are not imported by the build.

## Snapshot files

| File | Notes |
|------|--------|
| [`background-tuner-hud.example.tsx`](background-tuner-hud.example.tsx) | HUD UI: sliders, sessionStorage, copy-css. |
| [`bg-photo-tune-provider.example.tsx`](bg-photo-tune-provider.example.tsx) | React context + `useTheme` + applying vars to `document.documentElement`. |
| [`bg-photo-tune.example.ts`](bg-photo-tune.example.ts) | Types, defaults, clamping, storage keys, `formatTuneAsCssBlock`. |

## What the tuner did (when wired)

- **Panel:** fixed top-right “bg tuner” with controls for opacity, mask stops, blur, brightness, contrast, saturation, object position, scale, `next/image` quality, mix-blend.
- **Storage:** per-theme JSON in `sessionStorage` under keys like `error-wolf:bg-photo-tune:light` / `:dark` (see `BG_PHOTO_STORAGE_PREFIX` in the `.example.ts` file).
- **Overrides:** set inline CSS variables on `document.documentElement` so utilities such as `.bg-photo-strip-mask` / `.bg-photo-strip-inner` updated live.
- **Copy css:** emitted `:root` / `.dark` blocks to paste into `globals.css`.

HUD visibility (when integrated): dev by default, or production with **`NEXT_PUBLIC_BG_TUNER=1`**.

## Wiring if you reintroduce it

`ThemeProvider` → `BgPhotoTuneProvider` → `SiteBackgroundLayer` + main shell + `BackgroundTunerHud`. The provider must be **inside** `ThemeProvider` (`useTheme`).

Restore **`lib/bg-photo-tune.ts`** from `bg-photo-tune.example.ts` (drop the snapshot header line), copy the two component snapshots back to `components/`, and point [`app/layout.tsx`](../../app/layout.tsx) at them again. Add **`images.qualities`** in `next.config.mjs` if the HUD changes `quality` away from allowlisted values.

## Shipped defaults (this repo)

Edit **`app/globals.css`** `:root` and `.dark` for `--bg-photo-*` / mask vars. Tune **`quality`** on `<Image>` in `site-background-layer.tsx` if needed (must match `next.config.mjs` `images.qualities`).
