import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const APPLICABILITIES = new Set(["required", "optional", "not-applicable"]);
const STATUSES = new Set(["passed", "failed", "skipped", "not-applicable", "unknown"]);
const CONCLUSIONS = new Set(["passed", "failed", "unknown"]);
const TOKEN_PATTERN = /(gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|Bearer\s+[A-Za-z0-9._-]+)/i;

function fail(message) {
  throw new Error(message);
}

function ensureObject(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(path + " debe ser un objeto");
  }
}

function ensureText(value, path) {
  if (typeof value !== "string" || value.trim() === "") fail(path + " debe ser texto no vacío");
}

function ensureSha(value, path) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/.test(value)) {
    fail(path + " debe ser un SHA hexadecimal de 40 caracteres");
  }
}

function ensureDate(value, path) {
  ensureText(value, path);
  if (Number.isNaN(Date.parse(value))) fail(path + " debe ser una fecha ISO válida");
}

function ensureUrl(value, path) {
  ensureText(value, path);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(path + " debe ser una URL válida");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) fail(path + " debe usar HTTP o HTTPS");
}

function ensureEvidence(value, path) {
  ensureObject(value, path);
  ensureText(value.kind, path + ".kind");
  ensureText(value.label, path + ".label");
  ensureUrl(value.url, path + ".url");
}

function ensureEvidenceList(value, path) {
  if (!Array.isArray(value) || value.length === 0) fail(path + " debe contener al menos una referencia");
  value.forEach((item, index) => ensureEvidence(item, path + "[" + index + "]"));
}

function ensureMetricValue(value, path) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) fail(path + " debe ser un número no negativo");
    return;
  }

  ensureObject(value, path);
  const entries = Object.entries(value);
  if (entries.length === 0) fail(path + " no puede estar vacío");
  for (const [key, child] of entries) {
    ensureText(key, path + ".key");
    ensureMetricValue(child, path + "." + key);
  }
}

function rejectNull(value, path = "report") {
  if (value === null) fail(path + " no puede ser null");
  if (Array.isArray(value)) {
    value.forEach((child, index) => rejectNull(child, path + "[" + index + "]"));
    return;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) rejectNull(child, path + "." + key);
  }
}

export function validateQualityMetrics(report) {
  ensureObject(report, "report");
  rejectNull(report);

  if (report.schemaVersion !== 1) fail("schemaVersion debe ser 1");

  ensureObject(report.project, "project");
  ensureText(report.project.id, "project.id");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(report.project.id)) fail("project.id no es válido");
  ensureText(report.project.name, "project.name");
  ensureText(report.project.repository, "project.repository");
  if (!/^[^/]+\/[^/]+$/.test(report.project.repository)) fail("project.repository no es válido");
  if (!["node", "static"].includes(report.project.kind)) fail("project.kind no es válido");

  ensureObject(report.commit, "commit");
  ensureSha(report.commit.sha, "commit.sha");
  ensureText(report.commit.ref, "commit.ref");
  ensureText(report.commit.branch, "commit.branch");
  ensureText(report.commit.event, "commit.event");

  ensureObject(report.run, "run");
  ensureText(report.run.workflow, "run.workflow");
  if (!Number.isInteger(report.run.id) || report.run.id < 1) fail("run.id no es válido");
  if (!Number.isInteger(report.run.attempt) || report.run.attempt < 1) fail("run.attempt no es válido");
  ensureDate(report.run.startedAt, "run.startedAt");
  ensureDate(report.run.completedAt, "run.completedAt");
  ensureUrl(report.run.url, "run.url");

  ensureObject(report.standard, "standard");
  ensureText(report.standard.version, "standard.version");
  ensureSha(report.standard.sha, "standard.sha");

  if (!CONCLUSIONS.has(report.conclusion)) fail("conclusion no es válida");
  if (!Array.isArray(report.gates) || report.gates.length === 0) fail("gates debe contener al menos un gate");
  report.gates.forEach((gate, index) => {
    const path = "gates[" + index + "]";
    ensureObject(gate, path);
    ensureText(gate.id, path + ".id");
    if (!/^[a-z0-9][a-z0-9-]*$/.test(gate.id)) fail(path + ".id no es válido");
    ensureText(gate.label, path + ".label");
    if (!APPLICABILITIES.has(gate.applicability)) fail(path + ".applicability no es válido");
    if (!STATUSES.has(gate.status)) fail(path + ".status no es válido");
    ensureText(gate.details, path + ".details");
    ensureEvidenceList(gate.evidence, path + ".evidence");
  });

  ensureObject(report.metrics, "metrics");
  for (const [key, value] of Object.entries(report.metrics)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(key)) fail("metrics." + key + " no es válido");
    ensureMetricValue(value, "metrics." + key);
  }

  ensureEvidenceList(report.evidence, "evidence");

  if (TOKEN_PATTERN.test(JSON.stringify(report))) {
    fail("El informe contiene un patrón que parece un token");
  }

  return true;
}

async function main() {
  const file = process.argv[2] || "quality-metrics.json";
  const report = JSON.parse(await readFile(file, "utf8"));
  validateQualityMetrics(report);
  console.log("quality-metrics válido.");
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (entrypoint === import.meta.url) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
