import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const PROCESS_STATUSES = new Set(["pass", "warning", "fail", "unknown", "pending", "missing", "not_applicable"]);
const QUALITY_STATUSES = new Set(["current", "pending", "unavailable"]);
const APPLICABILITIES = new Set(["required", "optional", "not-applicable"]);
const GATE_STATUSES = new Set(["passed", "failed", "skipped", "not-applicable", "unknown"]);
const CONCLUSIONS = new Set(["passed", "failed", "unknown"]);
const TOKEN_PATTERN = /(gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|Bearer\s+[A-Za-z0-9._-]+)/i;

function fail(message) {
  throw new Error(message);
}

function object(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(path + " debe ser un objeto");
}

function keys(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(path + "." + key + " no está permitido");
  }
}

function text(value, path, maxLength = 1000) {
  if (typeof value !== "string" || value.trim() === "") fail(path + " debe ser texto no vacío");
  if (value.length > maxLength) fail(path + " supera el límite de longitud");
}

function sha(value, path, length = 40) {
  if (typeof value !== "string" || !new RegExp("^[0-9a-f]{" + length + "}$").test(value)) fail(path + " debe ser un SHA válido");
}

function date(value, path) {
  text(value, path);
  if (Number.isNaN(Date.parse(value))) fail(path + " debe ser una fecha ISO válida");
}

function noNull(value, path = "snapshot") {
  if (value === null) fail(path + " no puede ser null");
  if (Array.isArray(value)) {
    value.forEach((child, index) => noNull(child, path + "[" + index + "]"));
    return;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) noNull(child, path + "." + key);
  }
}

function metric(value, path, context = { count: 0, depth: 0 }) {
  context.count += 1;
  if (context.count > 100) fail("Demasiados valores métricos en " + path);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) fail(path + " debe ser un número no negativo");
    return;
  }
  object(value, path);
  if (++context.depth > 6) fail(path + " está demasiado anidada");
  const entries = Object.entries(value);
  if (entries.length === 0) fail(path + " no puede estar vacío");
  for (const [key, child] of entries) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(key)) fail(path + "." + key + " no es válido");
    metric(child, path + "." + key, context);
  }
  context.depth -= 1;
}

function validateGate(gate, path) {
  object(gate, path);
  keys(gate, new Set(["id", "label", "applicability", "status", "details"]), path);
  text(gate.id, path + ".id", 80);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(gate.id)) fail(path + ".id no es válido");
  text(gate.label, path + ".label", 160);
  if (!APPLICABILITIES.has(gate.applicability)) fail(path + ".applicability no es válida");
  if (!GATE_STATUSES.has(gate.status)) fail(path + ".status no es válido");
  if (gate.applicability === "not-applicable" && gate.status !== "not-applicable") {
    fail(path + " debe usar status not-applicable cuando no aplica");
  }
  if (gate.applicability !== "not-applicable" && gate.status === "not-applicable") {
    fail(path + " no puede usar status not-applicable si aplica");
  }
  text(gate.details, path + ".details", 400);
}

function validateProcess(process, path) {
  object(process, path);
  keys(process, new Set(["overall", "mainProtection", "workflow", "checks"]), path);
  for (const key of ["overall", "mainProtection", "workflow"]) {
    if (!PROCESS_STATUSES.has(process[key])) fail(path + "." + key + " no es válido");
  }
  if (!Array.isArray(process.checks)) fail(path + ".checks debe ser un array");
  process.checks.forEach((check, index) => {
    const checkPath = path + ".checks[" + index + "]";
    object(check, checkPath);
    keys(check, new Set(["id", "status"]), checkPath);
    text(check.id, checkPath + ".id", 80);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(check.id)) fail(checkPath + ".id no es válido");
    if (!PROCESS_STATUSES.has(check.status)) fail(checkPath + ".status no es válido");
  });
}

function validateQuality(quality, path) {
  object(quality, path);
  keys(quality, new Set(["status", "currentHeadSha", "commitSha", "validatedAt", "conclusion", "message", "gates", "metrics"]), path);
  if (!QUALITY_STATUSES.has(quality.status)) fail(path + ".status no es válido");
  if (!Array.isArray(quality.gates)) fail(path + ".gates debe ser un array");
  quality.gates.forEach((gate, index) => validateGate(gate, path + ".gates[" + index + "]"));
  object(quality.metrics, path + ".metrics");
  const context = { count: 0, depth: 0 };
  for (const [key, value] of Object.entries(quality.metrics)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(key)) fail(path + ".metrics." + key + " no es válido");
    metric(value, path + ".metrics." + key, context);
  }

  if (quality.status === "current") {
    sha(quality.commitSha, path + ".commitSha");
    date(quality.validatedAt, path + ".validatedAt");
    if (!CONCLUSIONS.has(quality.conclusion)) fail(path + ".conclusion no es válida");
    if ("message" in quality || "currentHeadSha" in quality) fail(path + " actual contiene campos pendientes");
  } else {
    text(quality.message, path + ".message", 200);
    if ("commitSha" in quality || "validatedAt" in quality || "conclusion" in quality) {
      fail(path + " pendiente no puede contener una validación actual");
    }
    if ("currentHeadSha" in quality) sha(quality.currentHeadSha, path + ".currentHeadSha");
  }
}

function rejectUnsafe(value, path = "snapshot", seen = new Set()) {
  if (value === null) fail(path + " no puede ser null");
  if (typeof value === "string") {
    if (TOKEN_PATTERN.test(value)) fail("El histórico contiene un patrón que parece un token");
    if (/https?:\/\//i.test(value)) fail("El histórico no puede contener URLs");
    return;
  }
  if (typeof value !== "object") return;
  if (seen.has(value)) fail(path + " contiene una referencia circular");
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectUnsafe(item, path + "[" + index + "]", seen));
  } else {
    for (const [key, child] of Object.entries(value)) {
      if (TOKEN_PATTERN.test(key)) fail("El histórico contiene un patrón que parece un token");
      if (key.toLowerCase() === "url" || /https?:\/\//i.test(key)) fail("El histórico no puede contener URLs");
      rejectUnsafe(child, path + "." + key, seen);
    }
  }
  seen.delete(value);
}

export function validateQualityHistory(snapshot) {
  object(snapshot, "snapshot");
  keys(snapshot, new Set(["schemaVersion", "id", "generatedAt", "dashboardCommitSha", "standard", "repositories"]), "snapshot");
  noNull(snapshot);
  if (snapshot.schemaVersion !== 1) fail("schemaVersion debe ser 1");
  sha(snapshot.id, "id", 64);
  date(snapshot.generatedAt, "generatedAt");
  sha(snapshot.dashboardCommitSha, "dashboardCommitSha");
  object(snapshot.standard, "standard");
  keys(snapshot.standard, new Set(["release", "sha"]), "standard");
  text(snapshot.standard.release, "standard.release", 40);
  sha(snapshot.standard.sha, "standard.sha");
  if (!Array.isArray(snapshot.repositories) || snapshot.repositories.length === 0) fail("repositories debe contener proyectos");

  const ids = new Set();
  snapshot.repositories.forEach((repository, index) => {
    const path = "repositories[" + index + "]";
    object(repository, path);
    keys(repository, new Set(["id", "repository", "kind", "visibility", "notApplicableAreas", "process", "quality"]), path);
    text(repository.id, path + ".id", 80);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(repository.id)) fail(path + ".id no es válido");
    if (ids.has(repository.id)) fail("Proyecto duplicado: " + repository.id);
    ids.add(repository.id);
    text(repository.repository, path + ".repository", 200);
    if (!/^[^/]+\/[^/]+$/.test(repository.repository)) fail(path + ".repository no es válido");
    if (!new Set(["node", "static"]).has(repository.kind)) fail(path + ".kind no es válido");
    if (!new Set(["public", "private"]).has(repository.visibility)) fail(path + ".visibility no es válida");
    if (!Array.isArray(repository.notApplicableAreas)) fail(path + ".notApplicableAreas debe ser un array");
    repository.notApplicableAreas.forEach((item, itemIndex) => text(item, path + ".notApplicableAreas[" + itemIndex + "]", 120));
    validateProcess(repository.process, path + ".process");
    validateQuality(repository.quality, path + ".quality");
  });

  rejectUnsafe(snapshot);
  return true;
}

async function main() {
  const file = process.argv[2] || "quality-history.json";
  const snapshot = JSON.parse(await readFile(file, "utf8"));
  validateQualityHistory(snapshot);
  console.log("Snapshot de histórico válido.");
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
