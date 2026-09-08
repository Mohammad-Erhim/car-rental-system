/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_MAPS_ENABLED?: string;
  /** Absolute or root-relative URL of the public site (apps/site). Defaults to `/`, which the
   *  edge proxy (prod) and the Next dev rewrite (dev) both route to the site. */
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
