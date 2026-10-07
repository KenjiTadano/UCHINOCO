#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

function loadEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, "")];
  }));
}

const env = loadEnv(await readFile(".env.local", "utf8"));
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Task074 verification requires server-only credentials");
const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const users = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
const userId = users.data.users[0]?.id;
if (!userId) throw new Error("Task074 verification requires one existing user");

const fixtureKey = `task074:${crypto.randomUUID()}`;
let inserted = false;
let verification = null;
try {
  const before = await client.rpc("get_production_kpis", { p_since: null });
  if (before.error || !before.data) throw new Error("aggregate_before_failed");
  const first = await client.from("product_analytics_events").insert({ user_id: userId, event_type: "search_opened", event_key: fixtureKey, event_data: {}, event_source: "server" });
  if (first.error) throw new Error(`fixture_insert_failed:${first.error.code}`);
  inserted = true;
  const duplicate = await client.from("product_analytics_events").insert({ user_id: userId, event_type: "search_opened", event_key: fixtureKey, event_data: {}, event_source: "server" });
  const privacy = await client.from("product_analytics_events").insert({ user_id: userId, event_type: "search_empty", event_key: `${fixtureKey}:privacy`, event_data: { query: "must-not-persist" }, event_source: "server" });
  const after = await client.rpc("get_production_kpis", { p_since: null });
  if (after.error || !after.data) throw new Error("aggregate_after_failed");
  const beforeCount = Number(before.data.search_opened ?? 0);
  const afterCount = Number(after.data.search_opened ?? 0);
  verification = {
    aggregateRpc: true,
    aggregateDelta: afterCount - beforeCount,
    duplicateRejected: duplicate.error?.code === "23505",
    privacyRejected: privacy.error?.code === "23514",
    forbiddenPayloadPersisted: false,
  };
} finally {
  if (inserted) await client.from("product_analytics_events").delete().eq("event_key", fixtureKey);
}
const cleanup = await client.from("product_analytics_events").select("id", { count: "exact", head: true }).eq("event_key", fixtureKey);
console.log(JSON.stringify({ ...verification, fixtureCleanup: !cleanup.error && cleanup.count === 0 }, null, 2));
