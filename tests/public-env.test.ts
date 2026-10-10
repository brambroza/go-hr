import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEnvMeta } from "../lib/public-env";

test("parseEnvMeta: reads the meta tag content", () => {
  assert.deepEqual(parseEnvMeta('{"supabaseUrl":"https://x.supabase.co","anonKey":"k"}'), { supabaseUrl: "https://x.supabase.co", anonKey: "k" });
});

test("parseEnvMeta: null for missing, malformed or incomplete content", () => {
  assert.equal(parseEnvMeta(null), null);
  assert.equal(parseEnvMeta("not json"), null);
  assert.equal(parseEnvMeta('{"supabaseUrl":""}'), null);
});
