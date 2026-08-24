const observedPools = new WeakSet();

export function observePostgresPool(pool, component) {
  if (!pool || typeof pool.on !== "function" || observedPools.has(pool)) return pool;
  observedPools.add(pool);
  const safeComponent = /^[a-z0-9_-]{1,48}$/.test(String(component || ""))
    ? String(component)
    : "database";
  pool.on("error", (error) => {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: "database_pool_idle_error",
      component: safeComponent,
      databaseCode: safeSqlState(error?.code),
    }));
  });
  return pool;
}

function safeSqlState(value) {
  const code = String(value || "").trim().toUpperCase();
  return /^[A-Z0-9]{5}$/.test(code) ? code : "UNKNOWN";
}
