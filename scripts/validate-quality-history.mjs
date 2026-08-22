import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  APPLICABILITIES,
  CONCLUSIONS,
  CONTRACT_LIMITS,
  CONTRACT_REGEXP,
  HISTORY_IDENTITY_VERSIONS,
  METRICS_GATE_STATUSES,
  PROCESS_STATUSES,
  QUALITY_HISTORY_KEYS,
  QUALITY_STATUSES,
  TOKEN_PATTERN,
  isRfc3339DateTime,
  stringLength
} from "./quality-contract.mjs";

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
  if (stringLength(value) > maxLength) fail(path + " supera el límite de longitud");
}

function sha(value, path, length = 40) {
  const pattern = length === 64 ? CONTRACT_REGEXP.sha64 : CONTRACT_REGEXP.sha40;
  if (typeof value !== "string" || !pattern.test(value)) fail(path + " debe ser un SHA válido");
}

function date(value, path) {
  text(value, path);
  if (!isRfc3339DateTime(value)) fail(path + " debe ser una fecha RFC3339 válida");
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
  if (context.count > CONTRACT_LIMITS.metricMaxNodes) fail("Demasiados valores métricos en " + path);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) fail(path + " debe ser un número no negativo");
    return;
  }
  object(value, path);
  if (++context.depth > CONTRACT_LIMITS.metricMaxDepth) fail(path + " está demasiado anidada");
  const entries = Object.entries(value);
  if (entries.length === 0) fail(path + " no puede estar vacío");
  for (const [key, child] of entries) {
    if (!CONTRACT_REGEXP.metricName.test(key)) fail(path + "." + key + " no es válido");
    metric(child, path + "." + key, context);
  }
  context.depth -= 1;
}

function validateGate(gate, path) {
  object(gate, path);
  keys(gate, QUALITY_HISTORY_KEYS.gate, path);
  text(gate.id, path + ".id", CONTRACT_LIMITS.historyGateId);
  if (!CONTRACT_REGEXP.identifier.test(gate.id)) fail(path + ".id no es válido");
  text(gate.label, path + ".label", CONTRACT_LIMITS.gateLabel);
  if (!APPLICABILITIES.has(gate.applicability)) fail(path + ".applicability no es válida");
  if (!METRICS_GATE_STATUSES.has(gate.status)) fail(path + ".status no es válido");
  if (gate.applicability === "not-applicable" && gate.status !== "not-applicable") {
    fail(path + " debe usar status not-applicable cuando no aplica");
  }
  if (gate.applicability !== "not-applicable" && gate.status === "not-applicable") {
    fail(path + " no puede usar status not-applicable si aplica");
  }
  text(gate.details, path + ".details", CONTRACT_LIMITS.gateDetails);
}

function validateProcess(process, path) {
  object(process, path);
  keys(process, QUALITY_HISTORY_KEYS.process, path);
  for (const key of ["overall", "mainProtection", "workflow"]) {
    if (!PROCESS_STATUSES.has(process[key])) fail(path + "." + key + " no es válido");
  }
  if (!Array.isArray(process.checks)) fail(path + ".checks debe ser un array");
  process.checks.forEach((check, index) => {
    const checkPath = path + ".checks[" + index + "]";
    object(check, checkPath);
    keys(check, QUALITY_HISTORY_KEYS.check, checkPath);
    text(check.id, checkPath + ".id", CONTRACT_LIMITS.historyCheckId);
    if (!CONTRACT_REGEXP.identifier.test(check.id)) fail(checkPath + ".id no es válido");
    if (!PROCESS_STATUSES.has(check.status)) fail(checkPath + ".status no es válido");
  });
}

function validateQuality(quality, path) {
  object(quality, path);
  keys(quality, QUALITY_HISTORY_KEYS.quality, path);
  if (!QUALITY_STATUSES.has(quality.status)) fail(path + ".status no es válido");
  if (!Array.isArray(quality.gates)) fail(path + ".gates debe ser un array");
  quality.gates.forEach((gate, index) => validateGate(gate, path + ".gates[" + index + "]"));
  object(quality.metrics, path + ".metrics");
  const context = { count: 0, depth: 0 };
  for (const [key, value] of Object.entries(quality.metrics)) {
    if (!CONTRACT_REGEXP.metricName.test(key)) fail(path + ".metrics." + key + " no es válido");
    metric(value, path + ".metrics." + key, context);
  }

  if (quality.status === "current") {
    sha(quality.commitSha, path + ".commitSha");
    date(quality.validatedAt, path + ".validatedAt");
    if (!CONCLUSIONS.has(quality.conclusion)) fail(path + ".conclusion no es válida");
    if (quality.gates.length === 0) fail(path + ".gates actual debe contener al menos un gate");
    if ("message" in quality || "currentHeadSha" in quality) fail(path + " actual contiene campos pendientes");
  } else {
    text(quality.message, path + ".message", CONTRACT_LIMITS.qualityMessage);
    if (quality.gates.length !== 0) fail(path + ".gates no puede contener gates en estado " + quality.status);
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
  keys(snapshot, QUALITY_HISTORY_KEYS.root, "snapshot");
  noNull(snapshot);
  if (snapshot.schemaVersion !== 1) fail("schemaVersion debe ser 1");
  if (!HISTORY_IDENTITY_VERSIONS.has(snapshot.identityVersion ?? 1)) fail("identityVersion debe ser 1 o 2");
  sha(snapshot.id, "id", 64);
  date(snapshot.generatedAt, "generatedAt");
  sha(snapshot.dashboardCommitSha, "dashboardCommitSha");
  object(snapshot.standard, "standard");
  keys(snapshot.standard, QUALITY_HISTORY_KEYS.standard, "standard");
  text(snapshot.standard.release, "standard.release", CONTRACT_LIMITS.standardRelease);
  sha(snapshot.standard.sha, "standard.sha");
  if (!Array.isArray(snapshot.repositories) || snapshot.repositories.length === 0) fail("repositories debe contener proyectos");

  const ids = new Set();
  snapshot.repositories.forEach((repository, index) => {
    const path = "repositories[" + index + "]";
    object(repository, path);
    keys(repository, QUALITY_HISTORY_KEYS.repository, path);
    text(repository.id, path + ".id", CONTRACT_LIMITS.historyRepositoryId);
    if (!CONTRACT_REGEXP.identifier.test(repository.id)) fail(path + ".id no es válido");
    if (ids.has(repository.id)) fail("Proyecto duplicado: " + repository.id);
    ids.add(repository.id);
    text(repository.repository, path + ".repository", CONTRACT_LIMITS.historyRepositoryName);
    if (!CONTRACT_REGEXP.repository.test(repository.repository)) fail(path + ".repository no es válido");
    if (!new Set(["node", "static"]).has(repository.kind)) fail(path + ".kind no es válido");
    if (!new Set(["public", "private"]).has(repository.visibility)) fail(path + ".visibility no es válida");
    if (!Array.isArray(repository.notApplicableAreas)) fail(path + ".notApplicableAreas debe ser un array");
    repository.notApplicableAreas.forEach((item, itemIndex) => text(item, path + ".notApplicableAreas[" + itemIndex + "]", CONTRACT_LIMITS.notApplicableArea));
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
