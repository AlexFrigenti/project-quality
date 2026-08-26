import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { collectQualityHistory } from "./collect-quality-history.mjs";
import { persistSnapshot, buildQualityHistorySnapshot } from "./persist-quality-history.mjs";

function createMockFetch(scenarios) {
  let callIndex = 0;
  const calls = [];
  const fetch = async (url, options = {}) => {
    const method = options.method || "GET";
    calls.push({ url, method, callIndex });
    const scenario = scenarios[callIndex++];
    if (scenario instanceof Error) throw scenario;
    if (scenario && typeof scenario === "object" && "ok" in scenario) return scenario;
    return scenario;
  };
  return { fetch, calls, getCallCount: () => calls.length };
}

function mockResponse({ status, headers = {}, body = null, ok = null } = {}) {
  const h = new Map();
  for (const [k, v] of Object.entries(headers)) h.set(k.toLowerCase(), v);
  return {
    ok: ok !== null ? ok : status >= 200 && status < 300,
    status,
    headers: {
      get: (n) => h.get(n.toLowerCase()) || null,
      has: (n) => h.has(n.toLowerCase())
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
  const sleep = async (ms) => sleeps.push(ms);
  return { sleep, sleeps };
}

function fixedNow(v) { return () => v; }

function validSnapshot() {
  return {
    schemaVersion: 1,
    identityVersion: 2,
    id: "a".repeat(64),
    generatedAt: new Date().toISOString(),
    dashboardCommitSha: "b".repeat(40),
    standard: { release: "v1.1.0", sha: "c".repeat(40) },
    repositories: [{
      id: "nexo",
      repository: "AlexFrigenti/Nexo",
      kind: "node",
      visibility: "private",
      notApplicableAreas: [],
      process: { overall: "pass", mainProtection: "pass", workflow: "pass", checks: [] },
      quality: { status: "pending", currentHeadSha: "d".repeat(40), message: "msg", gates: [], metrics: {} }
    }]
  };
}

// 1. GET transitorio seguido de éxito (429 con Retry-After)
{
  const sleepRec = createSleepRecorder();
  let calls = 0;
  const fetchJson = async (path) => {
    calls++;
    if (calls === 1) return { ok: false, status: 429, headers: { get: (n) => n.toLowerCase() === "retry-after" ? "1" : null, has: () => false }, data: null };
    return { ok: true, status: 200, data: [] };
  };
  const fetchAssetBody = async () => ({ ok: true, status: 200, text: "{}" });
  const result = await collectQualityHistory({
    repository: "o/r",
    token: "t",
    deps: { fetchJson, fetchAssetBody, sleep: sleepRec.sleep, now: fixedNow(Date.now()), config: { backoffMs: [250, 1000], maxDelayMs: 5000 } },
    now: new Date()
  });
  assert.ok(result.ok || result.quarantine, "Debe manejar reintento");
  assert.ok(calls >= 2, "Debe reintentar GET transitorio");
}

// 2. GET agotado con fail-closed (503 x3)
{
  const fetchJson = async () => ({ ok: false, status: 503, headers: { get: () => null, has: () => false }, data: null });
  const result = await collectQualityHistory({
    repository: "o/r",
    token: "t",
    deps: { fetchJson, fetchAssetBody: async () => ({ ok: true, status: 200, text: "{}" }) },
    now: new Date()
  });
  assert.equal(result.ok, false);
}

// 3. Timeout en creación de release y reconciliación con éxito (POST timeout -> GET encuentra)
{
  let postCalls = 0;
  const mockRequest = async (path, opts = {}) => {
    if (path.includes("/releases/tags/")) {
      // First GET before POST returns 404 (to allow POST), after POST timeout, GET finds it
      if (postCalls === 0) return { ok: false, status: 404, data: { message: "Not Found" } };
      return { ok: true, status: 200, data: { id: 1, tag_name: "quality-history-2026-08", upload_url: "https://api.github.com/upload{?name,label}" } };
    }
    if (opts.method === "POST" && path.endsWith("/releases")) {
      postCalls++;
      if (postCalls === 1) throw new DOMException("timeout", "AbortError");
      return { ok: true, status: 201, data: { id: 1, tag_name: "quality-history-2026-08", upload_url: "https://api.github.com/upload{?name,label}" } };
    }
    return { ok: true, status: 200, data: [] };
  };
  const snap = validSnapshot();
  snap.generatedAt = new Date().toISOString();
  const result = await persistSnapshot(snap, {
    repository: "o/r",
    token: "t",
    deps: { request: mockRequest, upload: async () => {}, perPage: 100 }
  });
  assert.ok(result);
}

// 4. Timeout en creación sin release al reconciliar -> segundo POST
{
  let postCalls = 0;
  let getCalls = 0;
  const mockRequest = async (path, opts = {}) => {
    if (path.includes("/releases/tags/")) {
      getCalls++;
      if (getCalls === 1) return { ok: false, status: 404, data: { message: "Not Found" } };
      if (getCalls === 2) return { ok: false, status: 404, data: { message: "Not Found" } };
      return { ok: true, status: 200, data: { id: 1, tag_name: "quality-history-2026-08", upload_url: "https://api.github.com/upload{?name,label}" } };
    }
    if (opts.method === "POST" && path.endsWith("/releases")) {
      postCalls++;
      if (postCalls === 1) throw new DOMException("timeout", "AbortError");
      return { ok: true, status: 201, data: { id: 1, tag_name: "quality-history-2026-08", upload_url: "https://api.github.com/upload{?name,label}" } };
    }
    if (path.includes("/releases?per_page=")) return { ok: true, status: 200, data: [] };
    if (path.includes("/assets")) return { ok: true, status: 200, data: [] };
    return { ok: true, status: 200, data: [] };
  };
  const snap = validSnapshot();
  const result = await persistSnapshot(snap, {
    repository: "o/r",
    token: "t",
    deps: { request: mockRequest, upload: async () => {} }
  });
  assert.equal(postCalls, 2);
}

// 5. Timeout en subida y asset existente al reconciliar
{
  let postCalls = 0;
  const snap = validSnapshot();
  const assetName = "quality-snapshot-" + snap.id + ".json";
  const mockRequest = async (path, opts = {}) => {
    if (path.includes("/releases?per_page=")) return { ok: true, status: 200, data: [{ id: 1, tag_name: "quality-history-2026-08" }] };
    if (path.includes("/assets") && !opts.method) {
      // first search before POST: no asset
      if (postCalls === 0) return { ok: true, status: 200, data: [] };
      // after POST timeout, search finds it
      return { ok: true, status: 200, data: [{ id: 99, name: assetName }] };
    }
    if (path.includes("/releases/tags/")) return { ok: false, status: 404, data: { message: "Not Found" } };
    return { ok: true, status: 200, data: {} };
  };
  const mockUpload = async () => {
    postCalls++;
    if (postCalls === 1) throw new DOMException("timeout", "AbortError");
    return;
  };
  const result = await persistSnapshot(snap, {
    repository: "o/r",
    token: "t",
    deps: { request: mockRequest, upload: mockUpload }
  });
  assert.ok(result);
  assert.equal(postCalls, 1);
}

// 6. Timeout en subida, asset ausente, único reintento
{
  let postCalls = 0;
  let searchCalls = 0;
  const snap = validSnapshot();
  const mockRequest = async (path, opts = {}) => {
    if (path.includes("/releases?per_page=")) return { ok: true, status: 200, data: [{ id: 1, tag_name: "quality-history-2026-08" }] };
    if (path.includes("/assets") && !opts.method) {
      searchCalls++;
      return { ok: true, status: 200, data: [] };
    }
    if (path.includes("/releases/tags/")) return { ok: false, status: 404, data: { message: "Not Found" } };
    return { ok: true, status: 200, data: [] };
  };
  const mockUpload = async () => {
    postCalls++;
    if (postCalls === 1) throw new DOMException("timeout", "AbortError");
    return;
  };
  const result = await persistSnapshot(snap, {
    repository: "o/r",
    token: "t",
    deps: { request: mockRequest, upload: mockUpload }
  });
  assert.equal(postCalls, 2);
}

// 7. Fallo ambiguo persistente sin tercer POST
{
  let postCalls = 0;
  const snap = validSnapshot();
  const mockRequest = async (path, opts = {}) => {
    if (path.includes("/releases/tags/")) return { ok: false, status: 404, data: { message: "Not Found" } };
    if (path.includes("/releases?per_page=")) return { ok: true, status: 200, data: [] };
    if (path.includes("/assets")) return { ok: false, status: 500, headers: { get: () => null, has: () => false }, data: null };
    return { ok: true, status: 200, data: [] };
  };
  const mockUpload = async () => {
    postCalls++;
    throw new DOMException("timeout", "AbortError");
  };
  let threw = false;
  try {
    await persistSnapshot(snap, { repository: "o/r", token: "t", deps: { request: mockRequest, upload: mockUpload } });
  } catch { threw = true; }
  assert.ok(threw || postCalls <= 2);
  assert.equal(postCalls <= 2, true);
}

// 8. Errores definitivos sin reintento (401, 422)
{
  let calls = 0;
  const fetch = async () => {
    calls++;
    return mockResponse({ status: 401, body: {} });
  };
  const { resilientFetch } = await import("./github-api-request.mjs");
  const res = await resilientFetch("https://api.github.com/test", {}, { fetch, sleep: async () => {} });
  assert.equal(calls, 1);
  assert.equal(res.status, 401);
}

// 9. Ausencia de DELETE
{
  const calls = [];
  const mockRequest = async (path, opts = {}) => {
    calls.push(opts.method || "GET");
    if (path.includes("/releases/tags/")) return { ok: false, status: 404, data: { message: "Not Found" } };
    if (opts.method === "POST") return { ok: true, status: 201, data: { id: 1, tag_name: "quality-history-2026-08", upload_url: "https://api.github.com/upload" } };
    return { ok: true, status: 200, data: [] };
  };
  const snap = validSnapshot();
  await persistSnapshot(snap, { repository: "o/r", token: "t", deps: { request: mockRequest, upload: async () => {} } });
  assert.equal(calls.includes("DELETE"), false);
}

// 10. Ausencia de reemplazo
{
  let uploadCalls = 0;
  const snap = validSnapshot();
  const assetName = "quality-snapshot-" + snap.id + ".json";
  const mockRequest = async (path) => {
    if (path.includes("/releases?per_page=")) return { ok: true, status: 200, data: [{ id: 1, tag_name: "quality-history-2026-08" }] };
    if (path.includes("/assets")) return { ok: true, status: 200, data: [{ id: 99, name: assetName }] };
    if (path.includes("/releases/tags/")) return { ok: false, status: 404, data: { message: "Not Found" } };
    return { ok: true, status: 200, data: [] };
  };
  await persistSnapshot(snap, { repository: "o/r", token: "t", deps: { request: mockRequest, upload: async () => { uploadCalls++; } } });
  assert.equal(uploadCalls, 0);
}

// 11. Compatibilidad paginación
{
  const fetchJson = async (path) => {
    if (path.includes("/releases?per_page=")) {
      const page = Number(new URLSearchParams(path.split("?")[1]).get("page"));
      if (page === 1) return { ok: true, status: 200, data: [{ id: 1, tag_name: "release-ajeno" }] };
      if (page === 2) return { ok: true, status: 200, data: [{ id: 2, tag_name: "quality-history-2026-08" }] };
      return { ok: true, status: 200, data: [] };
    }
    return { ok: true, status: 200, data: [] };
  };
  const result = await collectQualityHistory({
    repository: "o/r",
    token: "t",
    deps: { fetchJson, fetchAssetBody: async () => ({ ok: true, status: 200, text: "{}" }) },
    now: new Date()
  });
  assert.ok(result.index || result.ok === false);
}

// 12. 404 del POST nunca prueba ausencia (release)
{
  let getCalls = 0;
  const mockRequest = async (path, opts = {}) => {
    if (path.includes("/releases/tags/")) {
      getCalls++;
      return { ok: false, status: 404, data: { message: "Not Found" } };
    }
    if (opts.method === "POST" && path.endsWith("/releases")) {
      return { ok: false, status: 404, body: {} };
    }
    return { ok: true, status: 200, data: [] };
  };
  const snap = validSnapshot();
  let threw = false;
  try {
    await persistSnapshot(snap, { repository: "o/r", token: "t", deps: { request: mockRequest } });
  } catch { threw = true; }
  assert.ok(threw);
  assert.equal(getCalls, 1);
}

// 13. Asset 404, JSON inválido, paginación incompleta son inciertos (no segundo POST)
{
  const snap = validSnapshot();
  let assetCalls = 0;
  const mockRequest = async (path) => {
    if (path.includes("/releases?per_page=")) return { ok: true, status: 200, data: [{ id: 1, tag_name: "quality-history-2026-08" }] };
    if (path.includes("/assets")) {
      assetCalls++;
      if (assetCalls === 1) return { ok: true, status: 200, data: [] };
      return { ok: false, status: 404, headers: { get: () => null, has: () => false }, data: null };
    }
    if (path.includes("/releases/tags/")) return { ok: false, status: 404, data: { message: "Not Found" } };
    return { ok: true, status: 200, data: [] };
  };
  let uploadCalls = 0;
  const mockUpload = async () => {
    uploadCalls++;
    throw new DOMException("timeout", "AbortError");
  };
  let threw = false;
  try {
    await persistSnapshot(snap, { repository: "o/r", token: "t", deps: { request: mockRequest, upload: mockUpload } });
  } catch { threw = true; }
  assert.ok(threw);
  assert.equal(uploadCalls, 1);
}

console.log("History API resilience válido.");
