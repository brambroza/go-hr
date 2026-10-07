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

export function publicEnv(): PublicEnv {
  if (typeof window !== "undefined" && window.__GOHR_ENV) return window.__GOHR_ENV;
  return {
    supabaseUrl: env("PUBLIC_SUPABASE_URL") ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anonKey: env("SUPABASE_ANON_KEY") ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  };
}

/** URL the Next.js server uses to reach Supabase (may be an internal docker hostname) */
export function serverSupabaseUrl(): string {
  return env("SUPABASE_URL") ?? publicEnv().supabaseUrl;
}
