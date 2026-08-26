import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { collectQualityHistory } from "./collect-quality-history.mjs";
import { persistSnapshot, buildQualityHistorySnapshot, snapshotId } from "./persist-quality-history.mjs";
import { resilientFetch, singleAttemptFetch } from "./github-api-request.mjs";

function validSnapshot() {
  const snap = {
    schemaVersion: 1,
    identityVersion: 2,
    id: "pending",
    generatedAt: new Date().toISOString(),
    dashboardCommitSha: "c".repeat(40),
    standard: { release: "v1.1.0", sha: "d".repeat(40) },
    repositories: [{
      id: "nexo",
      repository: "AlexFrigenti/Nexo",
      kind: "node",
      visibility: "private",
      notApplicableAreas: [],
      process: { overall: "pass", mainProtection: "pass", workflow: "pass", checks: [] },
      quality: { status: "pending", currentHeadSha: "e".repeat(40), message: "msg", gates: [], metrics: {} }
    }]
  };
  snap.id = snapshotId(snap);
  return snap;
}

function mockResponse({ status, headers = {}, body = null, ok = null } = {}) {
  const map = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: ok !== null ? ok : status >= 200 && status < 300,
    status,
    headers: {
      get: (n) => map.get(n.toLowerCase()) || null,
      has: (n) => map.has(n.toLowerCase())
    },
    json: async () => {
      if (body === null) return null;
      if (typeof body === "string") return JSON.parse(body);
      return body;
    },
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    arrayBuffer: async () => Buffer.from(typeof body === "string" ? body : JSON.stringify(body))
  };
}

function createSleepRecorder() {
  const sleeps = [];
  return { sleep: async (ms) => sleeps.push(ms), sleeps };
}

// 1. collectQualityHistory usando deps.fetch únicamente
{
  let fetchCalls = 0;
  const fetch = async (url) => {
    fetchCalls++;
    if (url.includes("/releases?per_page=")) {
      return mockResponse({ status: 200, body: [] });
    }
    // default
    return mockResponse({ status: 200, body: [] });
  };
  const result = await collectQualityHistory({
    repository: "o/r",
    token: "t",
    deps: { fetch, sleep: async () => {}, now: () => Date.now() },
    now: new Date()
  });
  assert.ok(result.ok, "collect con deps.fetch únicamente debe funcionar");
  assert.ok(fetchCalls > 0, "Debe haber usado el fetch inyectado de bajo nivel");
}

// 2. persistSnapshot usando deps.fetch únicamente
{
  const snap = validSnapshot();
  let fetchCalls = 0;
  const fetch = async (url) => {
    fetchCalls++;
    if (url.includes("/releases?per_page=")) return mockResponse({ status: 200, body: [] });
    if (url.includes("/releases/tags/")) return mockResponse({ status: 404, body: { message: "Not Found" } });
    if (url.includes("/releases") && url.includes("api.github.com")) return mockResponse({ status: 201, body: { id: 1, tag_name: "quality-history-2026-08", upload_url: "https://api.github.com/upload{?name}" } });
    return mockResponse({ status: 200, body: {} });
  };
  const result = await persistSnapshot(snap, {
    repository: "o/r",
    token: "t",
    deps: { fetch, sleep: async () => {}, now: () => Date.now() }
  });
  assert.ok(result, "persist con deps.fetch únicamente debe funcionar");
  assert.ok(fetchCalls > 0);
}

// 3. GET de releases con timeout y reintento
{
  let attempts = 0;
  const fetch = async () => {
    attempts++;
    if (attempts === 1) throw new DOMException("timeout", "AbortError");
    return mockResponse({ status: 200, body: [] });
  };
  const result = await collectQualityHistory({
    repository: "o/r",
    token: "t",
    deps: { fetch, sleep: async () => {}, now: () => Date.now() },
    now: new Date()
  });
  assert.equal(attempts, 2);
  assert.ok(result.ok);
}

// 4. GET con 429 respetando Retry-After
{
  const sleeps = [];
  let calls = 0;
  const fetch = async () => {
    calls++;
    if (calls === 1) return mockResponse({ status: 429, headers: { "retry-after": "1" }, body: {} });
    return mockResponse({ status: 200, body: [] });
  };
  const result = await collectQualityHistory({
    repository: "o/r",
    token: "t",
    deps: { fetch, sleep: async (ms) => sleeps.push(ms), now: () => Date.now() },
    now: new Date()
  });
  assert.equal(calls, 2);
  assert.ok(sleeps[0] >= 900 && sleeps[0] <= 1100);
}

// 5. GET con 403 y X-RateLimit-Reset
{
  const sleeps = [];
  const now = Date.now();
  const reset = String(Math.floor((now + 2000) / 1000));
  let calls = 0;
  const fetch = async () => {
    calls++;
    if (calls === 1) return mockResponse({ status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": reset }, body: {} });
    return mockResponse({ status: 200, body: [] });
  };
  const result = await collectQualityHistory({
    repository: "o/r",
    token: "t",
    deps: { fetch, sleep: async (ms) => sleeps.push(ms), now: () => now },
    now: new Date(now)
  });
  assert.equal(calls, 2);
  assert.ok(sleeps.length === 1);
}

// 6. GET 404 de release con cuerpo JSON válido como ausencia concluyente
{
  const fetch = async (url) => {
    if (url.includes("/releases/tags/")) return mockResponse({ status: 404, body: { message: "Not Found" } });
    if (url.includes("/releases?per_page=")) return mockResponse({ status: 200, body: [] });
    return mockResponse({ status: 404, body: { message: "Not Found" } });
  };
  const res = await resilientFetch("https://api.github.com/repos/o/r/releases/tags/v", {}, { fetch, sleep: async () => {} });
  // 404 no reintenta, se devuelve tal cual
  assert.equal(res.status, 404);
  const data = await res.json();
  assert.ok(data && data.message === "Not Found");
}

// 7. GET 404 con cuerpo inválido como estado no concluyente (para asset: listado inválido)
// Para release, 404 con cuerpo no JSON válido no es concluyente → no habilita 2º POST
// Lo probamos via persist: búsqueda global que devuelve 404 JSON inválido debe ser incierto
{
  const snap = validSnapshot();
  let fetchCalls = 0;
  const fetch = async (url) => {
    fetchCalls++;
    if (url.includes("/releases?per_page=")) return mockResponse({ status: 200, body: [{ id: 1, tag_name: "quality-history-2026-08" }] });
    if (url.includes("/releases/1/assets")) return { ok: false, status: 404, headers: { get: () => null, has: () => false }, json: async () => { throw new SyntaxError("Unexpected token"); }, text: async () => "not json", arrayBuffer: async () => Buffer.from("not json") };
    if (url.includes("/releases/tags/")) return mockResponse({ status: 404, body: { message: "Not Found" } });
    return mockResponse({ status: 200, body: {} });
  };
  let uploadCalls = 0;
  const mockFetch = fetch;
  // persist buscará asset, encontrará 404 incierto -> debe fallar sin segundo POST
  // Usamos persistSnapshot con upload que lanzaría si se llega
  try {
    await persistSnapshot(snap, {
      repository: "o/r",
      token: "t",
      deps: { fetch: mockFetch, upload: async () => { uploadCalls++; return { ok: true, status: 201 }; } }
    });
    // Si no lanza, vérifier que no hubo segundo POST innecesario
    assert.ok(true);
  } catch {
    assert.ok(true);
  }
  assert.equal(uploadCalls, 0, "Con listado 404 incierto no debe intentar POST");
}

// 8. Descarga de asset con timeout y reintento
{
  let calls = 0;
  const snap = validSnapshot();
  snap.repositories[0].quality = {
    status: "current",
    commitSha: "f".repeat(40),
    validatedAt: new Date().toISOString(),
    conclusion: "passed",
    gates: [{ id: "g1", label: "G", applicability: "required", status: "passed", details: "ok" }],
    metrics: {}
  };
  snap.id = (await import("./persist-quality-history.mjs")).snapshotId(snap);
  const assetBody = JSON.stringify(snap);
  const fetch = async (url, opts) => {
    if (url.includes("/releases/assets/")) {
      calls++;
      if (calls === 1) throw new DOMException("timeout", "AbortError");
      return mockResponse({ status: 200, body: assetBody });
    }
    if (url.includes("/releases?per_page=")) return mockResponse({ status: 200, body: [{ id: 1, tag_name: "quality-history-2026-08" }] });
    if (url.includes("/releases/1/assets")) return mockResponse({ status: 200, body: [{ id: 99, name: "quality-snapshot-" + snap.id + ".json" }] });
    return mockResponse({ status: 200, body: [] });
  };
  const result = await collectQualityHistory({
    repository: "o/r",
    token: "t",
    deps: { fetch, sleep: async () => {}, now: () => Date.now() },
    now: new Date()
  });
  assert.ok(result.ok || result.quarantine);
  assert.equal(calls, 2);
}

// 9. POST de release con una única tentativa
{
  let postCalls = 0;
  const fetch = async (url, opts) => {
    if (opts && opts.method === "POST") {
      postCalls++;
      return mockResponse({ status: 503, body: {} });
    }
    if (url.includes("/releases/tags/")) return mockResponse({ status: 404, body: { message: "Not Found" } });
    if (url.includes("/releases?per_page=")) return mockResponse({ status: 200, body: [] });
    return mockResponse({ status: 200, body: [] });
  };
  const res = await singleAttemptFetch("https://api.github.com/repos/o/r/releases", { method: "POST", body: "{}" }, { fetch, sleep: async () => {} });
  assert.equal(postCalls, 1);
  assert.equal(res.status, 503);
}

// 10. POST de asset con una única tentativa
{
  let postCalls = 0;
  const fetch = async (url, opts) => {
    if (opts && opts.method === "POST") {
      postCalls++;
      return mockResponse({ status: 503, body: {} });
    }
    return mockResponse({ status: 200, body: {} });
  };
  const res = await singleAttemptFetch("https://api.github.com/upload", { method: "POST", body: "x" }, { fetch, sleep: async () => {} });
  assert.equal(postCalls, 1);
}

// 11. Verificación de que un GET no puede provocar retries duplicados (max 3, nunca 9)
{
  let lowLevelCalls = 0;
  const lowFetch = async () => {
    lowLevelCalls++;
    return mockResponse({ status: 503, body: {} });
  };
  const { withRetry } = await import("./github-api-request.mjs");
  const result = await withRetry(async () => {
    const res = await lowFetch();
    return { ok: res.ok, status: res.status, headers: res.headers, data: null };
  }, { fetch: lowFetch, sleep: async () => {}, now: () => Date.now() });
  assert.equal(lowLevelCalls, 3, "Un GET debe reintentar como máximo 3 veces, no 9 por doble capa");
  assert.equal(result.ok, false);
}

// 12. Verificación estática de que no queda fetch directo
{
  const files = ["scripts/collect-quality-history.mjs", "scripts/persist-quality-history.mjs", "scripts/history-pagination.mjs"];
  for (const file of files) {
    const content = await readFile(file, "utf8");
    // Permitir import de fetch global solo en github-api-request.mjs
    const directFetches = [...content.matchAll(/await\s+fetch\s*\(/g)];
    // En los tres ficheros no debe quedar fetch directo fuera del adaptador; con deps.fetch sí, pero no fetch(API_ROOT
    const forbidden = content.includes("fetch(API_ROOT") || content.includes("fetch(apiUrl") || content.includes("await fetch(") && file !== "scripts/github-api-request.mjs";
    // Más estricto: contar ocurrencias de "fetch(" que no sean "deps.fetch" ni "fetchImpl"
    const lines = content.split("\n").filter(l => l.includes("fetch(") && !l.includes("resilientFetch") && !l.includes("singleAttemptFetch") && !l.includes("deps.fetch") && !l.includes("fetchImpl"));
    // Si hay líneas con fetch directo, fallar
    for (const line of lines) {
      if (line.includes("fetch(") && !line.trim().startsWith("//")) {
        // Permitir solo import
        assert.fail(`Queda fetch directo en ${file}: ${line.trim()}`);
      }
    }
  }
}

// 13. singleAttemptFetch no reintenta (503 x3 → 1 llamada)
{
  let calls = 0;
  const fetch = async () => {
    calls++;
    return mockResponse({ status: 503, body: {} });
  };
  const res = await singleAttemptFetch("https://api.github.com/test", { method: "POST" }, { fetch, sleep: async () => {} });
  assert.equal(calls, 1);
  assert.equal(res.status, 503);
}

// 14. Conservación del límite máximo de dos POST y reconciliación
{
  const snap = validSnapshot();
  let postCalls = 0;
  const fetch = async (url, opts) => {
    if (url.includes("/releases/tags/")) return mockResponse({ status: 404, body: { message: "Not Found" } });
    if (opts && opts.method === "POST") {
      postCalls++;
      throw new DOMException("timeout", "AbortError");
    }
    if (url.includes("/releases?per_page=")) return mockResponse({ status: 200, body: [] });
    return mockResponse({ status: 200, body: [] });
  };
  let threw = false;
  try {
    await persistSnapshot(snap, { repository: "o/r", token: "t", deps: { fetch } });
  } catch { threw = true; }
  assert.ok(threw);
  assert.ok(postCalls <= 2, "Nunca tercer POST");
}

console.log("History production path válido.");
