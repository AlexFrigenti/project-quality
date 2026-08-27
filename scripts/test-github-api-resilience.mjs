import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectQualityEvidence } from "./collect-quality-evidence.mjs";
import { auditRepository } from "./audit-repository.mjs";
import { resilientFetch } from "./github-api-request.mjs";

function createMockFetch(responses) {
  let callIndex = 0;
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({ url, options, callIndex });
    const entry = responses[callIndex++];
    if (entry instanceof Error) throw entry;
    if (entry && typeof entry === "object" && "ok" in entry) {
      // already a mock response
      return entry;
    }
    // fallback: treat entry as { status, headers, body }
    return entry;
  };
  return { fetch, calls, getCallCount: () => calls.length };
}

function mockResponse({ status, headers = {}, body = null, ok = null } = {}) {
  const h = new Map();
  for (const [k, v] of Object.entries(headers)) h.set(k.toLowerCase(), v);
  return {
    ok: ok !== null ? ok : (status >= 200 && status < 300),
    status,
    headers: {
      get(name) { return h.get(name.toLowerCase()) || null; },
      has(name) { return h.has(name.toLowerCase()); }
    },
    json: async () => {
      if (typeof body === "string") return JSON.parse(body);
      return body;
    },
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    arrayBuffer: async () => {
      if (body instanceof Uint8Array || Buffer.isBuffer(body)) return body;
      if (typeof body === "string") return Buffer.from(body);
      return Buffer.from(JSON.stringify(body));
    }
  };
}

function createSleepRecorder() {
  const sleeps = [];
  const sleep = async (ms) => { sleeps.push(ms); };
  return { sleep, sleeps };
}

function fixedNow(value) {
  return () => value;
}

// 1. HTTP 429 seguido de éxito
{
  const sleepRec = createSleepRecorder();
  const mock = createMockFetch([
    mockResponse({ status: 429, headers: { "retry-after": "1" }, body: {} }),
    mockResponse({ status: 200, headers: {}, body: { ok: true } })
  ]);
  const response = await resilientFetch("https://api.github.com/test", {}, { fetch: mock.fetch, sleep: sleepRec.sleep, now: fixedNow(Date.now()), config: { backoffMs: [250, 1000], maxDelayMs: 5000, timeoutMs: 10000 } });
  assert.equal(response.ok, true);
  assert.equal(mock.getCallCount(), 2);
  assert.equal(sleepRec.sleeps.length, 1);
  assert.ok(sleepRec.sleeps[0] >= 900 && sleepRec.sleeps[0] <= 1100, "Debe respetar Retry-After ~1000ms");
}

// 2. HTTP 403 con x-ratelimit-remaining: 0 seguido de éxito
{
  const sleepRec = createSleepRecorder();
  const now = Date.now();
  const resetSeconds = Math.floor((now + 2000) / 1000);
  const mock = createMockFetch([
    mockResponse({ status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(resetSeconds) }, body: {} }),
    mockResponse({ status: 200, body: { ok: true } })
  ]);
  const response = await resilientFetch("https://api.github.com/test", {}, { fetch: mock.fetch, sleep: sleepRec.sleep, now: fixedNow(now) });
  assert.equal(response.ok, true);
  assert.equal(mock.getCallCount(), 2);
  assert.equal(sleepRec.sleeps.length, 1);
}

// 3. HTTP 503 seguido de éxito
{
  const sleepRec = createSleepRecorder();
  const mock = createMockFetch([
    mockResponse({ status: 503, body: {} }),
    mockResponse({ status: 200, body: { ok: true } })
  ]);
  const response = await resilientFetch("https://api.github.com/test", {}, { fetch: mock.fetch, sleep: sleepRec.sleep });
  assert.equal(response.ok, true);
  assert.equal(mock.getCallCount(), 2);
}

// 4. Error de red seguido de éxito
{
  const sleepRec = createSleepRecorder();
  const mock = createMockFetch([
    new TypeError("fetch failed"),
    mockResponse({ status: 200, body: { ok: true } })
  ]);
  const response = await resilientFetch("https://api.github.com/test", {}, { fetch: mock.fetch, sleep: sleepRec.sleep });
  assert.equal(response.ok, true);
  assert.equal(mock.getCallCount(), 2);
}

// 5. Timeout seguido de éxito
{
  const sleepRec = createSleepRecorder();
  let attempt = 0;
  const fetch = async () => {
    attempt++;
    if (attempt === 1) {
      const err = new DOMException("The operation was aborted", "AbortError");
      throw err;
    }
    return mockResponse({ status: 200, body: { ok: true } });
  };
  const response = await resilientFetch("https://api.github.com/test", {}, { fetch, sleep: sleepRec.sleep });
  assert.equal(response.ok, true);
  assert.equal(attempt, 2);
}

// 6. HTTP 404: una sola llamada, no reintento
{
  const sleepRec = createSleepRecorder();
  const mock = createMockFetch([
    mockResponse({ status: 404, body: {} }),
    mockResponse({ status: 200, body: { ok: true } })
  ]);
  const response = await resilientFetch("https://api.github.com/test", {}, { fetch: mock.fetch, sleep: sleepRec.sleep });
  assert.equal(response.status, 404);
  assert.equal(mock.getCallCount(), 1);
  assert.equal(sleepRec.sleeps.length, 0);
}

// 7. Tres fallos transitorios consecutivos
{
  const sleepRec = createSleepRecorder();
  const mock = createMockFetch([
    mockResponse({ status: 500, body: {} }),
    mockResponse({ status: 503, body: {} }),
    mockResponse({ status: 502, body: {} })
  ]);
  const response = await resilientFetch("https://api.github.com/test", {}, { fetch: mock.fetch, sleep: sleepRec.sleep });
  assert.equal(response.ok, false);
  assert.equal(mock.getCallCount(), 3);
  assert.equal(sleepRec.sleeps.length, 2);
  // debe clasificarse como transient/http y no debe filtrar detalles sensibles
  assert.ok(!JSON.stringify(response).includes("Authorization"));
}

// 8. Descarga binaria con fallo transitorio inicial y luego correcta
{
  const sleepRec = createSleepRecorder();
  const zipPayload = Buffer.from(JSON.stringify({ hello: "world" }));
  const mock = createMockFetch([
    mockResponse({ status: 503, body: {} }),
    { ok: true, status: 200, headers: { get: () => null, has: () => false }, arrayBuffer: async () => zipPayload, text: async () => zipPayload.toString(), json: async () => JSON.parse(zipPayload.toString()) }
  ]);
  const response = await resilientFetch("https://api.github.com/zip", {}, { fetch: mock.fetch, sleep: sleepRec.sleep });
  assert.equal(response.ok, true);
  const buf = Buffer.from(await response.arrayBuffer());
  assert.equal(JSON.parse(buf.toString()).hello, "world");
  assert.equal(mock.getCallCount(), 2);
}

// 9. Descarga binaria agotada
{
  const sleepRec = createSleepRecorder();
  const mock = createMockFetch([
    mockResponse({ status: 503, body: {} }),
    mockResponse({ status: 503, body: {} }),
    mockResponse({ status: 503, body: {} })
  ]);
  const response = await resilientFetch("https://api.github.com/zip", {}, { fetch: mock.fetch, sleep: sleepRec.sleep });
  assert.equal(response.ok, false);
  assert.equal(mock.getCallCount(), 3);
  const serialized = JSON.stringify(response);
  assert.ok(!serialized.includes("Bearer"));
  assert.ok(!serialized.includes("token"));
}

// 10. Integración audit-repository con rate limit agotado
{
  const sleepRec = createSleepRecorder();
  let fetchCalls = 0;
  const fetch = async () => {
    fetchCalls++;
    return mockResponse({ status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor(Date.now()/1000)+1) }, body: {} });
  };
  const tempDir = await mkdtemp(join(tmpdir(), "test-github-resilience-"));
  try {
    const report = await auditRepository({
      env: { AUDIT_REPOSITORY: "AlexFrigenti/Nucleo", AUDIT_PROFILE: "nucleo", AUDIT_VISIBILITY: "public", QUALITY_STANDARD_SHA: "a".repeat(40), OUTPUT_FILE: join(tempDir, "quality-report.json") },
      deps: { fetch, sleep: sleepRec.sleep, now: fixedNow(Date.now()) }
    });
    // debe producir error/unavailable y no verde
    assert.ok(report.overall !== "pass");
    assert.ok(report.repository.access !== "available" || report.checks.some(c => c.status !== "pass") || report.qualityEvidence.status !== "current");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

// 11. Integración collect-quality-evidence con error transitorio agotado -> unavailable, nunca pending
{
  const sleepRec = createSleepRecorder();
  const fetch = async () => mockResponse({ status: 503, body: {} });
  const result = await collectQualityEvidence({
    repository: "AlexFrigenti/example",
    currentCommitSha: "abc",
    deps: { fetch, sleep: sleepRec.sleep }
  });
  assert.equal(result.status, "unavailable");
  assert.notEqual(result.status, "pending");
  assert.notEqual(result.status, "current");
}

// 12. Retry-After inválido o excesivo usa backoff seguro y respeta máximo
{
  const sleepRec = createSleepRecorder();
  const mock = createMockFetch([
    mockResponse({ status: 429, headers: { "retry-after": "999999" }, body: {} }),
    mockResponse({ status: 200, body: { ok: true } })
  ]);
  const response = await resilientFetch("https://api.github.com/test", {}, { fetch: mock.fetch, sleep: sleepRec.sleep, config: { maxDelayMs: 5000, backoffMs: [250,1000] } });
  assert.equal(response.ok, true);
  assert.ok(sleepRec.sleeps[0] <= 5000, "Debe respetar máximo de retraso");
  assert.ok(sleepRec.sleeps[0] >= 250, "Debe usar backoff seguro si Retry-After inválido/excesivo");
}

{
  const sleepRec = createSleepRecorder();
  const mock = createMockFetch([
    mockResponse({ status: 429, headers: { "retry-after": "not-a-number" }, body: {} }),
    mockResponse({ status: 200, body: { ok: true } })
  ]);
  const response = await resilientFetch("https://api.github.com/test", {}, { fetch: mock.fetch, sleep: sleepRec.sleep, config: { backoffMs: [250,1000] } });
  assert.equal(sleepRec.sleeps[0], 250);
}

console.log("Resiliencia de API válida.");
