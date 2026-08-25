import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import zlib from "node:zlib";
import {
  buildQualitySummary,
  collectQualityEvidence,
  pendingQualityEvidence,
  readArtifactJson,
  sanitizeQualityMetrics
} from "./collect-quality-evidence.mjs";
import { findZipEntry } from "./zip-entry-reader.mjs";

const sample = {
  schemaVersion: 1,
  project: {
    id: "example",
    name: "Example",
    repository: "AlexFrigenti/example",
    kind: "static"
  },
  commit: {
    sha: "0123456789abcdef0123456789abcdef01234567",
    ref: "refs/heads/main",
    branch: "main",
    event: "push"
  },
  run: {
    workflow: "Quality checks",
    id: 123,
    attempt: 1,
    startedAt: "2026-08-13T10:00:00.000Z",
    completedAt: "2026-08-13T10:01:00.000Z",
    url: "https://github.com/AlexFrigenti/example/actions/runs/123"
  },
  standard: {
    version: "v1.1.0",
    sha: "abcdefabcdefabcdefabcdefabcdefabcdefabcd"
  },
  conclusion: "passed",
  gates: [
    {
      id: "validation",
      label: "Validación estática",
      applicability: "required",
      status: "passed",
      details: "Gate ejecutado correctamente.",
      evidence: [
        {
          kind: "workflow-run",
          label: "Ejecución del workflow de calidad",
          url: "https://github.com/AlexFrigenti/example/actions/runs/123"
        }
      ]
    },
    {
      id: "coverage",
      label: "Cobertura",
      applicability: "not-applicable",
      status: "not-applicable",
      details: "No aplica para este perfil.",
      evidence: [
        {
          kind: "workflow-run",
          label: "Ejecución del workflow de calidad",
          url: "https://github.com/AlexFrigenti/example/actions/runs/123"
        }
      ]
    }
  ],
  metrics: {
    tests: { total: 12, passed: 12 },
    coverage: { lines: 86.4 }
  },
  evidence: [
    {
      kind: "workflow-run",
      label: "Ejecución del workflow de calidad",
      url: "https://github.com/AlexFrigenti/example/actions/runs/123"
    }
  ]
};

const sanitized = sanitizeQualityMetrics(sample);
assert.equal(sanitized.schemaVersion, 1);
assert.equal(sanitized.commit.sha, sample.commit.sha);
assert.deepEqual(sanitized.metrics, sample.metrics);
assert.throws(() => sanitizeQualityMetrics({ ...sample, unexpected: "invalido" }), /report\.unexpected no está permitido/);

const publicSummary = buildQualitySummary(sample, { exposeLinks: true });
assert.equal(publicSummary.run.url, sample.run.url);
assert.equal(publicSummary.gates[0].evidence[0].url, sample.evidence[0].url);

const privateSummary = buildQualitySummary(sample);
assert.equal("url" in privateSummary.run, false);
assert.equal("url" in privateSummary.gates[0].evidence[0], false);
assert.equal("evidence" in privateSummary, false);
assert.deepEqual(privateSummary.metrics, sample.metrics);

const pending = pendingQualityEvidence(sample.commit.sha);
assert.equal(pending.status, "pending");
assert.equal(pending.message, "Evidencia pendiente para el commit actual");
assert.equal(pending.currentCommitSha, sample.commit.sha);
assert.equal(pending.validatedCommitSha, null);
assert.equal(pending.summary, null);

const REPOSITORY = "AlexFrigenti/example";
const CURRENT_SHA = sample.commit.sha;

function reportFor({ id = 123, attempt = 1, conclusion = "passed", sha = CURRENT_SHA } = {}) {
  const report = structuredClone(sample);
  report.run = { ...report.run, id, attempt };
  report.conclusion = conclusion;
  report.commit = { ...report.commit, sha };
  return report;
}

function runFor({ id, conclusion = "success", attempt = 1, sha = CURRENT_SHA, status = "completed", createdAt }) {
  return {
    id,
    status,
    head_sha: sha,
    conclusion,
    run_attempt: attempt,
    created_at: createdAt || "2026-08-13T10:0" + (id % 10) + ":00.000Z"
  };
}

function artifactFor(id) {
  return {
    id,
    name: "quality-metrics",
    expired: false,
    created_at: "2026-08-13T10:05:00.000Z",
    expires_at: "2026-09-12T10:05:00.000Z"
  };
}

function stubFetch({ runs = [], runsOk = true, artifactsByRun = {}, artifactsOkByRun = {} } = {}) {
  return async (path) => {
    if (path.includes("/actions/workflows/") && path.includes("/runs?")) {
      return { ok: runsOk, status: runsOk ? 200 : 500, data: runsOk ? { workflow_runs: runs } : {} };
    }
    const match = path.match(/\/actions\/runs\/(\d+)\/artifacts/);
    if (match) {
      const runId = Number(match[1]);
      if (artifactsOkByRun[runId] === false) return { ok: false, status: 500, data: {} };
      return { ok: true, status: 200, data: { artifacts: artifactsByRun[runId] || [] } };
    }
    return { ok: false, status: 404, data: {} };
  };
}

function stubReadArtifact(byArtifactId = {}) {
  return async (artifact) => {
    const entry = byArtifactId[artifact.id];
    if (entry instanceof Error) throw entry;
    return entry;
  };
}

function collectWith({ runs, artifactsByRun, readByArtifactId, runsOk, artifactsOkByRun } = {}) {
  return collectQualityEvidence({
    repository: REPOSITORY,
    defaultBranch: "main",
    currentCommitSha: CURRENT_SHA,
    workflowFile: "quality.yml",
    exposeLinks: false,
    deps: {
      fetch: stubFetch({ runs, runsOk, artifactsByRun, artifactsOkByRun }),
      readArtifact: stubReadArtifact(readByArtifactId)
    }
  });
}

{
  const result = await collectWith({
    runs: [runFor({ id: 123, conclusion: "success", attempt: 1 })],
    artifactsByRun: { 123: [artifactFor(900)] },
    readByArtifactId: { 900: reportFor({ id: 123, attempt: 1, conclusion: "passed" }) }
  });
  assert.equal(result.status, "current");
  assert.equal(result.validatedCommitSha, CURRENT_SHA);
  assert.equal(result.summary.conclusion, "passed");
  assert.equal(result.summary.run.id, 123);
  assert.equal(result.artifact.id, 900);
}

{
  const result = await collectWith({
    runs: [runFor({ id: 124, conclusion: "failure", attempt: 1 })],
    artifactsByRun: { 124: [artifactFor(901)] },
    readByArtifactId: { 901: reportFor({ id: 124, conclusion: "failed" }) }
  });
  assert.equal(result.status, "current");
  assert.equal(result.summary.conclusion, "failed");
}

for (const [conclusion, expectedPattern] of [
  ["failure", /contradice la conclusión real de la ejecución \(failure\)/],
  ["cancelled", /terminó con conclusión cancelled y no constituye evidencia válida/]
]) {
  const result = await collectWith({
    runs: [runFor({ id: 125, conclusion, attempt: 1 })],
    artifactsByRun: { 125: [artifactFor(902)] },
    readByArtifactId: { 902: reportFor({ id: 125, conclusion: "passed" }) }
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.validatedCommitSha, null);
  assert.equal(result.summary, null);
  assert.match(result.message, new RegExp("^Evidencia candidata no utilizable"));
  assert.match(result.message, expectedPattern);
}

{
  const result = await collectWith({
    runs: [runFor({ id: 126, conclusion: "timed_out", attempt: 1 })],
    artifactsByRun: { 126: [artifactFor(903)] },
    readByArtifactId: { 903: reportFor({ id: 126, conclusion: "failed" }) }
  });
  assert.equal(result.status, "unavailable");
  assert.match(result.message, /terminó con conclusión timed_out/);
}

{
  const result = await collectWith({
    runs: [runFor({ id: 127, conclusion: "success", attempt: 2 })],
    artifactsByRun: { 127: [artifactFor(904)] },
    readByArtifactId: { 904: reportFor({ id: 127, attempt: 1, conclusion: "passed" }) }
  });
  assert.equal(result.status, "unavailable");
  assert.match(result.message, /intento 1 pero la ejecución terminó en el intento 2/);
}

{
  const newer = runFor({ id: 200, conclusion: "success", attempt: 1, createdAt: "2026-08-13T11:00:00.000Z" });
  const older = runFor({ id: 100, conclusion: "success", attempt: 1, createdAt: "2026-08-13T10:00:00.000Z" });
  const result = await collectWith({
    runs: [older, newer],
    artifactsByRun: { 200: [artifactFor(905)], 100: [artifactFor(906)] },
    readByArtifactId: {
      905: reportFor({ id: 200, conclusion: "passed" }),
      906: reportFor({ id: 100, conclusion: "passed" })
    }
  });
  assert.equal(result.status, "current");
  assert.equal(result.summary.run.id, 200);
  assert.equal(result.artifact.id, 905);
}

{
  const contradicted = runFor({ id: 300, conclusion: "failure", attempt: 1, createdAt: "2026-08-13T11:00:00.000Z" });
  const olderValid = runFor({ id: 100, conclusion: "success", attempt: 1, createdAt: "2026-08-13T10:00:00.000Z" });
  const result = await collectWith({
    runs: [contradicted, olderValid],
    artifactsByRun: { 300: [artifactFor(907)], 100: [artifactFor(908)] },
    readByArtifactId: {
      907: reportFor({ id: 300, conclusion: "passed" }),
      908: reportFor({ id: 100, conclusion: "passed" })
    }
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.summary, null);
  assert.match(result.message, /contradice la conclusión real de la ejecución \(failure\)/);
}

{
  const cancelled = runFor({ id: 301, conclusion: "cancelled", attempt: 1, createdAt: "2026-08-13T11:00:00.000Z" });
  const olderValid = runFor({ id: 100, conclusion: "success", attempt: 1, createdAt: "2026-08-13T10:00:00.000Z" });
  const result = await collectWith({
    runs: [cancelled, olderValid],
    artifactsByRun: { 301: [artifactFor(914)], 100: [artifactFor(908)] },
    readByArtifactId: {
      914: reportFor({ id: 301, conclusion: "passed" }),
      908: reportFor({ id: 100, conclusion: "passed" })
    }
  });
  assert.equal(result.status, "unavailable");
  assert.match(result.message, /terminó con conclusión cancelled/);
}

{
  const withoutArtifact = runFor({ id: 302, conclusion: "success", attempt: 1, createdAt: "2026-08-13T11:00:00.000Z" });
  const olderValid = runFor({ id: 100, conclusion: "success", attempt: 1, createdAt: "2026-08-13T10:00:00.000Z" });
  const result = await collectWith({
    runs: [withoutArtifact, olderValid],
    artifactsByRun: { 302: [], 100: [artifactFor(908)] },
    readByArtifactId: { 908: reportFor({ id: 100, conclusion: "passed" }) }
  });
  assert.equal(result.status, "unavailable");
  assert.match(result.message, /no tiene un artifact quality-metrics disponible/);
}

for (const [label, broken] of [
  ["descarga", new Error("No se pudo descargar el artifact.")],
  ["zip sin informe", new Error("El artifact no contiene quality-metrics.json.")],
  ["json corrupto", new SyntaxError("Unexpected token < in JSON at position 0")]
]) {
  const result = await collectWith({
    runs: [runFor({ id: 128 })],
    artifactsByRun: { 128: [artifactFor(909)] },
    readByArtifactId: { 909: broken }
  });
  assert.equal(result.status, "unavailable", label);
  assert.equal(result.status !== "pending", true, label);
  assert.match(result.message, /el artifact no pudo leerse \(/);
}

{
  const invalidReport = reportFor({ id: 129 });
  invalidReport.gates[0].status = "bogus";
  const result = await collectWith({
    runs: [runFor({ id: 129 })],
    artifactsByRun: { 129: [artifactFor(910)] },
    readByArtifactId: { 910: invalidReport }
  });
  assert.equal(result.status, "unavailable");
  assert.match(result.message, /el informe viola el contrato \(gates\[0\]\.status no es válido\)/);
}

{
  const result = await collectWith({
    runs: [runFor({ id: 130 })],
    artifactsByRun: { 130: [] }
  });
  assert.equal(result.status, "unavailable");
  assert.match(result.message, /no tiene un artifact quality-metrics disponible/);
}

{
  const result = await collectWith({
    runs: [runFor({ id: 131 })],
    artifactsByRun: { 131: [artifactFor(911)] },
    artifactsOkByRun: { 131: false }
  });
  assert.equal(result.status, "unavailable");
  assert.match(result.message, /paginaci[oó]n/i);
}

{
  const broken = runFor({ id: 303, conclusion: "success", attempt: 1, createdAt: "2026-08-13T11:00:00.000Z" });
  const olderValid = runFor({ id: 100, conclusion: "success", attempt: 1, createdAt: "2026-08-13T10:00:00.000Z" });
  const result = await collectWith({
    runs: [broken, olderValid],
    artifactsByRun: { 303: [artifactFor(912)], 100: [artifactFor(913)] },
    readByArtifactId: {
      912: new Error("No se pudo descargar el artifact."),
      913: reportFor({ id: 100, conclusion: "passed" })
    }
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.summary, null);
  assert.match(result.message, /el artifact no pudo leerse \(No se pudo descargar el artifact\.\)/);
}

{
  const result = await collectWith({
    runs: [
      runFor({ id: 140, status: "in_progress", conclusion: null }),
      runFor({ id: 141, sha: "1111111111111111111111111111111111111111" })
    ],
    artifactsByRun: {}
  });
  assert.equal(result.status, "pending");
  assert.equal(result.message, "Evidencia pendiente para el commit actual");
}

{
  const result = await collectWith({ runs: [], runsOk: false });
  assert.equal(result.status, "unavailable");
  assert.match(result.message, /paginaci[oó]n|No se pudo consultar el historial de Actions/i);
}

// -------------------------------------------------------------
// Paginación completa de workflow runs y artifacts (PQ-OX12)
// -------------------------------------------------------------
function createPaginatedFetch({
  runsPages,
  artifactsPagesByRun,
  runsErrorPage,
  artifactsErrorOnPage,
  invalidRunsPage,
  invalidArtifactsPage
} = {}) {
  const counters = { runs: 0, artifacts: 0 };
  const fetch = async (path) => {
    if (path.includes("/actions/workflows/") && path.includes("/runs?")) {
      counters.runs += 1;
      const pageMatch = path.match(/[?&]page=(\d+)/);
      const page = pageMatch ? Number.parseInt(pageMatch[1], 10) : 1;
      if (runsErrorPage === page) return { ok: false, status: 500, data: {} };
      if (invalidRunsPage === page) return { ok: true, status: 200, data: { workflow_runs: "invalid" } };
      if (runsPages) {
        const pageData = runsPages[page - 1];
        if (pageData === undefined) return { ok: true, status: 200, data: { workflow_runs: [] } };
        if (Array.isArray(pageData)) return { ok: true, status: 200, data: { workflow_runs: pageData } };
        return { ok: true, status: 200, data: pageData };
      }
      return { ok: true, status: 200, data: { workflow_runs: [] } };
    }
    const match = path.match(/\/actions\/runs\/(\d+)\/artifacts/);
    if (match) {
      counters.artifacts += 1;
      const runId = Number(match[1]);
      const pageMatch = path.match(/[?&]page=(\d+)/);
      const page = pageMatch ? Number.parseInt(pageMatch[1], 10) : 1;
      const key = `${runId}:${page}`;
      if (artifactsErrorOnPage && artifactsErrorOnPage[key]) return { ok: false, status: 500, data: {} };
      if (invalidArtifactsPage && invalidArtifactsPage[key]) return { ok: true, status: 200, data: { artifacts: "invalid" } };
      const pages = artifactsPagesByRun?.[runId];
      if (pages) {
        const pageData = pages[page - 1];
        if (pageData === undefined) return { ok: true, status: 200, data: { artifacts: [] } };
        if (Array.isArray(pageData)) return { ok: true, status: 200, data: { artifacts: pageData } };
        return { ok: true, status: 200, data: pageData };
      }
      return { ok: true, status: 200, data: { artifacts: [] } };
    }
    return { ok: false, status: 404, data: {} };
  };
  return { fetch, counters };
}

function collectPaginated({
  runsPages,
  artifactsPagesByRun,
  readByArtifactId,
  runsErrorPage,
  artifactsErrorOnPage,
  invalidRunsPage,
  invalidArtifactsPage,
  callCounters
} = {}) {
  const paginated = createPaginatedFetch({
    runsPages,
    artifactsPagesByRun,
    runsErrorPage,
    artifactsErrorOnPage,
    invalidRunsPage,
    invalidArtifactsPage
  });
  if (callCounters) {
    const originalFetch = paginated.fetch;
    const wrappedFetch = async (path) => {
      const result = await originalFetch(path);
      if (path.includes("/actions/workflows/")) callCounters.runs = paginated.counters.runs;
      else if (path.includes("/artifacts")) callCounters.artifacts = paginated.counters.artifacts;
      return result;
    };
    return {
      promise: collectQualityEvidence({
        repository: REPOSITORY,
        defaultBranch: "main",
        currentCommitSha: CURRENT_SHA,
        workflowFile: "quality.yml",
        exposeLinks: false,
        deps: {
          fetch: wrappedFetch,
          readArtifact: stubReadArtifact(readByArtifactId)
        }
      }),
      counters: paginated.counters
    };
  }
  return {
    promise: collectQualityEvidence({
      repository: REPOSITORY,
      defaultBranch: "main",
      currentCommitSha: CURRENT_SHA,
      workflowFile: "quality.yml",
      exposeLinks: false,
      deps: {
        fetch: paginated.fetch,
        readArtifact: stubReadArtifact(readByArtifactId)
      }
    }),
    counters: paginated.counters
  };
}

function makeOtherRuns(count, startId = 1000) {
  return Array.from({ length: count }, (_, index) => runFor({
    id: startId + index,
    sha: "ffffffffffffffffffffffffffffffffffffffff",
    createdAt: "2026-08-12T10:00:00.000Z"
  }));
}

{
  const validRun = runFor({ id: 500, createdAt: "2026-08-13T11:00:00.000Z" });
  const otherRuns = makeOtherRuns(100, 1000);
  const { promise } = collectPaginated({
    runsPages: [otherRuns, [validRun]],
    artifactsPagesByRun: { 500: [[artifactFor(900)]] },
    readByArtifactId: { 900: reportFor({ id: 500, attempt: 1, conclusion: "passed" }) }
  });
  const result = await promise;
  assert.equal(result.status, "current", "Workflow run válido solo en la página 2 debe ser current");
  assert.equal(result.summary.run.id, 500);
}

{
  const older = runFor({ id: 501, createdAt: "2026-08-13T10:00:00.000Z" });
  const newer = runFor({ id: 502, createdAt: "2026-08-13T12:00:00.000Z" });
  const otherRuns = makeOtherRuns(99, 2000);
  const { promise } = collectPaginated({
    runsPages: [[...otherRuns, older], [newer]],
    artifactsPagesByRun: {
      501: [[artifactFor(901)]],
      502: [[artifactFor(902)]]
    },
    readByArtifactId: {
      901: reportFor({ id: 501, conclusion: "passed" }),
      902: reportFor({ id: 502, conclusion: "passed" })
    }
  });
  const result = await promise;
  assert.equal(result.status, "current", "Runs válidos repartidos en varias páginas debe elegir el más reciente por created_at");
  assert.equal(result.summary.run.id, 502);
  assert.equal(result.artifact.id, 902);
}

{
  const validRun = runFor({ id: 510 });
  const otherArtifacts = Array.from({ length: 100 }, (_, index) => ({
    id: 2000 + index,
    name: "other-artifact",
    expired: false,
    created_at: "2026-08-13T10:05:00.000Z",
    expires_at: "2026-09-12T10:05:00.000Z"
  }));
  const { promise } = collectPaginated({
    runsPages: [[validRun]],
    artifactsPagesByRun: { 510: [otherArtifacts, [artifactFor(910)]] },
    readByArtifactId: { 910: reportFor({ id: 510, conclusion: "passed" }) }
  });
  const result = await promise;
  assert.equal(result.status, "current", "Artifact válido solo en la página 2 debe ser current");
  assert.equal(result.artifact.id, 910);
}

{
  const { promise } = collectPaginated({
    runsPages: [],
    invalidRunsPage: 1
  });
  const result = await promise;
  assert.equal(result.status, "unavailable", "Página de workflow runs con estructura inválida debe producir unavailable");
  assert.match(result.message, /paginaci[oó]n/i, "El error debe identificar que la paginación quedó incompleta");
  assert.equal(result.status !== "pending", true);
}

{
  const validRun = runFor({ id: 520 });
  const { promise } = collectPaginated({
    runsPages: [[validRun]],
    invalidArtifactsPage: { "520:1": true }
  });
  const result = await promise;
  assert.equal(result.status, "unavailable", "Página de artifacts con estructura inválida debe producir unavailable");
  assert.match(result.message, /paginaci[oó]n/i);
}

{
  const validRun = runFor({ id: 530 });
  const { promise: promise2 } = collectPaginated({
    runsPages: [[validRun]],
    artifactsPagesByRun: {
      530: [
        Array.from({ length: 100 }, (_, i) => ({ id: 3000 + i, name: "other", expired: false, created_at: "2026-08-13T10:05:00.000Z", expires_at: "2026-09-12T10:05:00.000Z" })),
        []
      ]
    },
    artifactsErrorOnPage: { "530:2": true }
  });
  const result = await promise2;
  assert.equal(result.status, "unavailable", "Error al consultar una página posterior debe producir unavailable");
  assert.match(result.message, /paginaci[oó]n/i);
}

{
  const fullPages = Array.from({ length: 100 }, (_, pageIndex) => makeOtherRuns(100, 10000 + pageIndex * 100));
  const paginated = createPaginatedFetch({ runsPages: fullPages });
  let runsCalls = 0;
  const countingFetch = async (path) => {
    if (path.includes("/actions/workflows/") && path.includes("/runs?")) runsCalls += 1;
    return paginated.fetch(path);
  };
  const result = await collectQualityEvidence({
    repository: REPOSITORY,
    defaultBranch: "main",
    currentCommitSha: CURRENT_SHA,
    workflowFile: "quality.yml",
    exposeLinks: false,
    deps: {
      fetch: countingFetch,
      readArtifact: stubReadArtifact({})
    }
  });
  assert.equal(result.status, "unavailable", "Límite de 100 páginas sin final incompleta debe producir unavailable");
  assert.match(result.message, /límite|paginaci[oó]n/i);
  assert.ok(runsCalls <= 100, "No debe generar más de 100 llamadas, generadas: " + runsCalls);
  assert.equal(runsCalls, 100, "Debe haber intentado exactamente 100 páginas");
}

{
  const otherRuns = makeOtherRuns(50, 6000);
  const { promise } = collectPaginated({
    runsPages: [otherRuns, []],
    artifactsPagesByRun: {}
  });
  const result = await promise;
  assert.equal(result.status, "pending", "Ausencia real de run debe seguir devolviendo pending cuando toda la paginación termina correctamente");
  assert.equal(result.message, "Evidencia pendiente para el commit actual");
}

{
  const validRun = runFor({ id: 540 });
  const { promise } = collectPaginated({
    runsPages: [[validRun]],
    artifactsPagesByRun: { 540: [[], []] },
    readByArtifactId: {}
  });
  const result = await promise;
  assert.equal(result.status, "unavailable", "Ausencia de artifact debe conservar el comportamiento unavailable");
  assert.match(result.message, /no tiene un artifact quality-metrics disponible/);
}

await assert.rejects(
  readArtifactJson({ id: 1 }, REPOSITORY, { fetch: async () => ({ ok: false, status: 403 }) }),
  /No se pudo descargar el artifact/
);

await assert.rejects(
  readArtifactJson(
    { id: 2 },
    REPOSITORY,
    { fetch: async () => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.alloc(10 * 1024 * 1024 + 1) }) }
  ),
  /supera el límite/
);

// -------------------------------------------------------------
// Lectura portable de ZIP (sin ejecutable unzip externo)
// -------------------------------------------------------------
function crc32Placeholder() {
  return 0;
}

function buildTestZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const method = entry.method ?? 0;
    const flags = entry.flags ?? 0;
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, "utf8");
    const compressed = method === 8 ? zlib.deflateRawSync(raw) : raw;
    const declaredSize = entry.declaredUncompressed ?? raw.length;
    const crc = entry.crcOverride ?? crc32ForTest(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(declaredSize, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(declaredSize, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += 30 + nameBuf.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDirectory, eocd]);
}

function patchFirstCentralOffset(buffer, newValue) {
  const patched = Buffer.from(buffer);
  const position = patched.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  if (position === -1) throw new Error("fixture sin directorio central");
  patched.writeUInt32LE(newValue, position + 42);
  return patched;
}

const jsonPayload = JSON.stringify({ schemaVersion: 1, hello: "world" });

{
  const zip = buildTestZip([{ name: "quality-metrics.json", data: jsonPayload }]);
  const entry = findZipEntry(zip, (name) => name === "quality-metrics.json");
  assert.equal(entry.name, "quality-metrics.json");
  assert.equal(JSON.parse(entry.data.toString("utf8")).hello, "world");
}

{
  const zip = buildTestZip([{ name: "folder/nested/quality-metrics.json", data: jsonPayload, method: 8 }]);
  const entry = findZipEntry(zip, (name) => name.endsWith("/quality-metrics.json"));
  assert.equal(JSON.parse(entry.data.toString("utf8")).hello, "world");
}

{
  const zip = buildTestZip([
    { name: "quality-metrics.json", data: jsonPayload },
    { name: "otro.txt", data: "contenido" }
  ]);
  const matchesCollectorCriteria = (name) => name === "quality-metrics.json" || name.endsWith("/quality-metrics.json");
  assert.equal(findZipEntry(zip, matchesCollectorCriteria).name, "quality-metrics.json");
}

{
  const matchesCollectorCriteria = (name) => name === "quality-metrics.json" || name.endsWith("/quality-metrics.json");
  assert.equal(
    findZipEntry(buildTestZip([{ name: "solo-otro.txt", data: "x" }]), matchesCollectorCriteria),
    null,
    "entrada ausente debe devolver null en el parser"
  );
  await assert.rejects(
    readArtifactJson(
      { archive_download_url: "https://pipeline.invalid/zip" },
      REPOSITORY,
      { fetch: async () => ({ ok: true, status: 200, arrayBuffer: async () => buildTestZip([{ name: "solo-otro.txt", data: "x" }]) }) }
    ),
    /no contiene quality-metrics\.json/,
    "readArtifactJson debe rechazar un artifact sin la entrada esperada"
  );
}

assert.throws(
  () => findZipEntry(Buffer.from("esto no es un zip", "utf8"), () => true),
  /malformado|EOCD/,
  "ZIP corrupto debe rechazarse"
);

assert.throws(
  () => findZipEntry(buildTestZip([{ name: "secreto.json", data: "x", method: 99 }]), () => true),
  /método de compresión no soportado/,
  "método no soportado debe rechazarse"
);

assert.throws(
  () => findZipEntry(buildTestZip([{ name: "secreto.json", data: "x", flags: 1 }]), () => true),
  /cifrada/,
  "entrada cifrada debe rechazarse"
);

assert.throws(
  () => findZipEntry(buildTestZip([{ name: "grande.json", data: "x", declaredUncompressed: 1000001 }]), () => true),
  /1\.000\.000/,
  "entrada descomprimida sobre el límite debe rechazarse"
);

function crc32ForTest(buffer) {
  if (typeof crc32ForTest.table === "undefined") {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let step = 0; step < 8; step += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : value >>> 1;
      table[index] = value;
    }
    crc32ForTest.table = table;
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crc32ForTest.table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

{
  const valid = buildTestZip([{ name: "quality-metrics.json", data: jsonPayload }]);
  assert.doesNotThrow(() => findZipEntry(valid, () => true), "ZIP con CRC32 correcto debe aceptarse");
  const corrupted = Buffer.from(valid);
  const signature = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  const localOffset = corrupted.indexOf(signature);
  const declaredCrc = corrupted.readUInt32LE(localOffset + 14);
  const flipped = Buffer.from(corrupted);
  flipped.writeUInt32LE((declaredCrc ^ 0x1) >>> 0, localOffset + 14);
  const centralPos = flipped.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  flipped.writeUInt32LE((declaredCrc ^ 0x1) >>> 0, centralPos + 16);
  assert.throws(
    () => findZipEntry(flipped, (name) => name === "quality-metrics.json"),
    /CRC32 inválido/,
    "La entrada con CRC32 alterado debe rechazarse"
  );
  await assert.rejects(
    readArtifactJson(
      { archive_download_url: "https://pipeline.invalid/zip" },
      REPOSITORY,
      { fetch: async () => ({ ok: true, status: 200, arrayBuffer: async () => flipped }) }
    ),
    /CRC32 inválido/,
    "readArtifactJson debe propagar el error de CRC32"
  );
}

{
  const valid = buildTestZip([{ name: "quality-metrics.json", data: jsonPayload }]);
  const zip64 = Buffer.from(valid);
  const eocd = findEocdPosition(zip64);
  zip64.writeUInt32LE(0xffffffff, eocd + 12);
  assert.throws(
    () => findZipEntry(zip64, () => true),
    /ZIP64 no están soportados/,
    "ZIP64 con tamaño de directorio central máximo debe rechazarse"
  );
}

{
  const valid = buildTestZip([{ name: "quality-metrics.json", data: jsonPayload }]);
  const zip64 = Buffer.from(valid);
  const eocd = findEocdPosition(zip64);
  zip64.writeUInt16LE(0xFFFF, eocd + 8);
  assert.throws(
    () => findZipEntry(zip64, () => true),
    /ZIP64 no están soportados/,
    "ZIP64 con contador de entradas máximo debe rechazarse"
  );
  const entryZip64 = buildTestZip([{ name: "quality-metrics.json", data: jsonPayload }]);
  entryZip64.writeUInt32LE(0xffffffff, entryZip64.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 42);
  assert.throws(
    () => findZipEntry(entryZip64, () => true),
    /ZIP64 no están soportados/,
    "entrada con offset ZIP64 debe rechazarse"
  );
}

function findEocdPosition(buffer) {
  for (let position = buffer.length - 22; position >= 0; position -= 1) {
    if (buffer.readUInt32LE(position) === 0x06054b50) return position;
  }
  throw new Error("fixture sin EOCD");
}

{
  const valid = buildTestZip([{ name: "quality-metrics.json", data: jsonPayload }]);
  const broken = patchFirstCentralOffset(valid, valid.length + 500);
  assert.throws(() => findZipEntry(broken, () => true), /límites|fuera/, "offsets fuera del buffer deben rechazarse");
}

{
  const zip = buildTestZip([{ name: "quality-metrics.json", data: jsonPayload }]);
  const artifact = { archive_download_url: "https://pipeline.invalid/zip" };
  const deps = {
    fetch: async () => ({ ok: true, status: 200, arrayBuffer: async () => zip })
  };
  const script = [
    'import { readArtifactJson } from "./scripts/collect-quality-evidence.mjs";',
    'const zipB64 = process.argv[1];',
    'const zip = Buffer.from(zipB64, "base64");',
    'const parsed = await readArtifactJson(',
    '  { archive_download_url: "https://pipeline.invalid/zip" },',
    '  "AlexFrigenti/example",',
    '  { fetch: async () => ({ ok: true, status: 200, arrayBuffer: async () => zip }) }',
    ');',
    'if (parsed.hello !== "world") throw new Error("contenido inesperado");',
    'console.log("PORTABLE_OK");'
  ].join("\n");
  const outcome = await new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      ["--input-type=module", "-e", script, zip.toString("base64")],
      {
        cwd: process.cwd(),
        env: { ...process.env, PATH: "", Path: "" },
        encoding: "utf8"
      },
      (error, stdout, stderr) => resolve({ error, stdout, stderr })
    );
    child.on("error", (error) => resolve({ error, stdout: "", stderr: String(error) }));
  });
  assert.equal(outcome.error, null, `La lectura portable no debe depender de unzip. stderr: ${outcome.stderr}`);
  assert.match(outcome.stdout, /PORTABLE_OK/);
}

assert.throws(() => sanitizeQualityMetrics({
  ...sample,
  evidence: [{
    kind: "workflow-run",
    label: "Ejecución",
    url: "https://github.com/example?token=github_pat_fake"
  }]
}), /token/i);

console.log("Collector de evidencia válido.");
