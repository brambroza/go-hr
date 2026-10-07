// Paged reads that work with any Supabase client (browser or server, RLS applies).
// PostgREST returns at most 1000 rows per request; `build` must return a fresh, ORDERED query.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any;

export async function fetchRows<T>(build: () => Q, page = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await build().range(from, from + page - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < page) return out;
  }
}

/** fetchRows over chunks of ids for `.in(col, ids)` filters */
export async function fetchRowsIn<T>(ids: (number | string)[], build: (part: (number | string)[]) => Q, chunk = 200): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += chunk) out.push(...(await fetchRows<T>(() => build(ids.slice(i, i + chunk)))));
  return out;
}
