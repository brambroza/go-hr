// Runtime public config. One Docker image serves every customer: the Supabase URL / anon key are read
// from the server environment at request time and injected into the page as window.__GOHR_ENV
// (NEXT_PUBLIC_* variables would be frozen into the bundle at build time).

export interface PublicEnv {
  supabaseUrl: string;
  anonKey: string;
}

declare global {
  interface Window {
    __GOHR_ENV?: PublicEnv;
  }
}

const env = (k: string) => (typeof process !== "undefined" ? process.env[k] : undefined);

/** Name of the <meta> tag app/layout.tsx renders next to the inline script (the fallback when the script did not run) */
export const ENV_META_NAME = "gohr-env";

/** Parse the <meta name="gohr-env"> content; null when missing or malformed */
export function parseEnvMeta(content: string | null | undefined): PublicEnv | null {
  if (!content) return null;
  try {
    const v = JSON.parse(content) as Partial<PublicEnv>;
    if (typeof v?.supabaseUrl === "string" && typeof v?.anonKey === "string" && v.supabaseUrl && v.anonKey) return { supabaseUrl: v.supabaseUrl, anonKey: v.anonKey };
  } catch {
    /* fall through */
  }
  return null;
}

export function publicEnv(): PublicEnv {
  if (typeof window !== "undefined") {
    if (window.__GOHR_ENV) return window.__GOHR_ENV;
    // the inline script is not executed when React renders the root layout on the client (e.g. after a hydration
    // error) — the <meta> tag is plain DOM and survives that
    const fromMeta = parseEnvMeta(document.querySelector(`meta[name="${ENV_META_NAME}"]`)?.getAttribute("content"));
    if (fromMeta) {
      window.__GOHR_ENV = fromMeta;
      return fromMeta;
    }
  }
  return {
    supabaseUrl: env("PUBLIC_SUPABASE_URL") ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anonKey: env("SUPABASE_ANON_KEY") ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  };
}

/** URL the Next.js server uses to reach Supabase (may be an internal docker hostname) */
export function serverSupabaseUrl(): string {
  return env("SUPABASE_URL") ?? publicEnv().supabaseUrl;
}
