import {
  CONTRACT_REGEXP,
  QUARANTINE_DETAIL_LIMIT,
  TOKEN_PATTERN,
  isRfc3339DateTime
} from "./quality-contract.mjs";

export const QUARANTINE_REASONS = new Set([
  "invalid-name",
  "download-failed",
  "invalid-json",
  "invalid-snapshot",
  "asset-id-mismatch"
]);

const QUARANTINE_ROOT_KEYS = new Set(["schemaVersion", "generatedAt", "entries"]);
const QUARANTINE_ENTRY_KEYS = new Set(["releaseTag", "releaseId", "assetId", "assetName", "reason", "detail"]);
const QUARANTINE_ASSET_NAME_REGEXP = /^quality-snapshot-[^\s]{1,140}$/;

function fail(message) {
  throw new Error(message);
}

export function sanitizeQuarantineDetail(value) {
  return String(value ?? "")
    .replace(TOKEN_PATTERN, "[redacted]")
    .replace(/https?:\/\/\S+/gi, "[redacted]")
    .slice(0, QUARANTINE_DETAIL_LIMIT);
}

function normalizeQuarantineId(value, name) {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < 1) fail(name + " de cuarentena no válido");
  return value;
}

export function createQuarantineEntry({ releaseTag, releaseId, assetId, assetName, reason, detail }) {
  if (typeof releaseTag !== "string" || !CONTRACT_REGEXP.historyReleaseTag.test(releaseTag)) {
    fail("releaseTag de cuarentena no válido");
  }
  const normalized = {
    releaseId: normalizeQuarantineId(releaseId, "releaseId"),
    assetId: normalizeQuarantineId(assetId, "assetId")
  };
  if (typeof assetName !== "string" || !QUARANTINE_ASSET_NAME_REGEXP.test(assetName)) {
    fail("assetName de cuarentena no válido");
  }
  if (!QUARANTINE_REASONS.has(reason)) fail("razón de cuarentena no válida: " + String(reason));
  const sanitized = sanitizeQuarantineDetail(detail);
  return {
    releaseTag,
    releaseId: normalized.releaseId,
    assetId: normalized.assetId,
    assetName,
    reason,
    detail: sanitized
  };
}

function validateEntry(entry, path) {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    fail(path + " debe ser un objeto");
  }
  for (const key of Object.keys(entry)) {
    if (!QUARANTINE_ENTRY_KEYS.has(key)) fail(path + "." + key + " no está permitido");
  }
  for (const key of QUARANTINE_ENTRY_KEYS) {
    if (!(key in entry)) fail(path + "." + key + " es obligatorio");
  }
  for (const idKey of ["releaseId", "assetId"]) {
    const value = entry[idKey];
    if (!(value === null || (Number.isInteger(value) && value >= 1))) {
      fail(path + "." + idKey + " de cuarentena no válido");
    }
  }
  if (
    typeof entry.detail !== "string"
    || entry.detail.length < 1
    || entry.detail.length > QUARANTINE_DETAIL_LIMIT
  ) {
    fail(path + ": detail de cuarentena supera el límite o es inválido");
  }
  for (const [key, value] of Object.entries(entry)) {
    if (typeof value !== "string") continue;
    if (TOKEN_PATTERN.test(value)) fail(path + "." + key + " contiene un patrón que parece un token");
    if (/https?:\/\//i.test(value)) fail(path + "." + key + " no puede contener URLs");
  }
  const rebuilt = createQuarantineEntry({
    releaseTag: entry.releaseTag,
    releaseId: entry.releaseId,
    assetId: entry.assetId,
    assetName: entry.assetName,
    reason: entry.reason,
    detail: entry.detail
  });
  for (const [key, value] of Object.entries(rebuilt)) {
    if (entry[key] !== value) fail(path + "." + key + " no coincide con su contenido saneado");
  }
}

export function createQuarantineManifest({ generatedAt, entries }) {
  const manifest = {
    schemaVersion: 1,
    generatedAt,
    entries
  };
  validateQuarantineManifest(manifest);
  return manifest;
}

export function validateQuarantineManifest(manifest) {
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
    fail("La manifest de cuarentena debe ser un objeto");
  }
  for (const key of Object.keys(manifest)) {
    if (!QUARANTINE_ROOT_KEYS.has(key)) fail(key + " no está permitido en la manifest de cuarentena");
  }
  if (manifest.schemaVersion !== 1) fail("schemaVersion de cuarentena debe ser 1");
  if (!isRfc3339DateTime(manifest.generatedAt)) fail("generatedAt de cuarentena debe ser una fecha RFC3339 válida");
  if (!Array.isArray(manifest.entries) || manifest.entries.length < 1) {
    fail("entries debe contener al menos una entrada de cuarentena");
  }
  manifest.entries.forEach((entry, index) => validateEntry(entry, "entries[" + index + "]"));
  if (TOKEN_PATTERN.test(JSON.stringify(manifest))) fail("La manifest contiene un patrón que parece un token");
  if (/https?:\/\//i.test(JSON.stringify(manifest))) fail("La manifest no puede contener URLs");
  return true;
}
