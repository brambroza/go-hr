// Same auth cookie name on browser and server, even when the server reaches Supabase
// through an internal URL (e.g. http://kong:8000) — the default name is derived from the URL host.
export const AUTH_COOKIE = { name: "gohr-auth" };
