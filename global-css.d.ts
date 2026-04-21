// tsgo resolves side-effect imports; classic tsc did not flag plain `.css` without a shim
// (see next/types/global.d.ts — only `*.module.css` is declared there).
declare module "*.css" {}
