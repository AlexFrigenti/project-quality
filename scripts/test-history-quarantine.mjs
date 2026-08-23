import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  QUARANTINE_REASONS,
  createQuarantineEntry,
  sanitizeQuarantineDetail,
  validateQuarantineManifest
} from "./history-quarantine.mjs";

const baseEntry = {
  releaseTag: "quality-history-2026-08",
  releaseId: 123,
  assetId: 456,
  assetName: "quality-snapshot-bad.json",
  reason: "invalid-json",
  detail: "JSON inválido"
};

function manifestWith(entries, extra) {
  const manifest = {
    schemaVersion: 1,
    generatedAt: "2026-08-20T06:17:00.000Z",
    entries
  };
  return { ...manifest, ...extra };
}

function rawEntry(extra) {
  return { ...structuredClone(baseEntry), ...extra };
}

{
  const manifest = manifestWith([createQuarantineEntry(baseEntry)]);
  assert.doesNotThrow(() => validateQuarantineManifest(manifest));
}

{
  const urlEntry = createQuarantineEntry({ ...baseEntry, detail: "fallo en https://api.github.com/private" });
  assert.equal(/https?:\/\//.test(urlEntry.detail), false);
  const tokenEntry = createQuarantineEntry({ ...baseEntry, detail: "leak ghp_ABCDEF1234567890abcdef" });
  assert.equal(/ghp_/.test(tokenEntry.detail), false);
  const longEntry = createQuarantineEntry({ ...baseEntry, detail: "y".repeat(500) });
  assert.equal(longEntry.detail.length <= 200, true);
  assert.equal(longEntry.detail.length >= 1, true);
}

for (const [expectedPattern, mutate] of [
  [/razón de cuarentena no válida/, () => ({ reason: "unknown-reason" })],
  [/releaseTag de cuarentena no válido/, () => ({ releaseTag: "quality-history-202608" })],
  [/assetName de cuarentena no válido/, () => ({ assetName: "unit-test-diagnostics" })],
  [/releaseId de cuarentena no válido/, () => ({ releaseId: 12.5 })],
  [/assetId de cuarentena no válido/, () => ({ assetId: -1 })]
]) {
  assert.throws(() => createQuarantineEntry({ ...baseEntry, ...mutate() }), expectedPattern);
}

for (const [expectedPattern, mutate] of [
  [/no puede contener URLs/, () => ({ detail: "fallo en https://api.github.com/private" })],
  [/patrón que parece un token/, () => ({ detail: "leak ghp_ABCDEF1234567890abcdef" })],
  [/supera el límite/, () => ({ detail: "x".repeat(201) })],
  [/razón de cuarentena no válida/, () => ({ reason: "unknown-reason" })],
  [/releaseTag de cuarentena no válido/, () => ({ releaseTag: "quality-history-202608" })],
  [/assetName de cuarentena no válido/, () => ({ assetName: "unit-test-diagnostics" })],
  [/releaseId de cuarentena no válido/, () => ({ releaseId: 12.5 })],
  [/assetId de cuarentena no válido/, () => ({ assetId: -1 })]
]) {
  const manifest = manifestWith([rawEntry(mutate())]);
  assert.throws(() => validateQuarantineManifest(manifest), expectedPattern);
}

assert.throws(
  () => validateQuarantineManifest(manifestWith([], {})),
  /entries debe contener al menos una entrada/
);

assert.throws(
  () => validateQuarantineManifest(manifestWith([createQuarantineEntry(baseEntry)], { extra: true })),
  /no está permitido/
);

assert.deepEqual(
  [...QUARANTINE_REASONS].sort(),
  ["asset-id-mismatch", "download-failed", "invalid-json", "invalid-name", "invalid-snapshot"]
);

{
  const sanitized = sanitizeQuarantineDetail("error en https://example.invalid/token y ghp_ABCDEF1234567890abcdef");
  assert.equal(/https?:\/\//.test(sanitized), false);
  assert.equal(/ghp_/.test(sanitized), false);
}

const schema = JSON.parse(await readFile("schemas/quality-history-quarantine.schema.json", "utf8"));
assert.equal(schema.additionalProperties, false);
assert.equal(schema.properties.schemaVersion.const, 1);
assert.deepEqual(schema.properties.entries.minItems, 1);
assert.deepEqual(
  [...schema.$defs.entry.properties.reason.enum].sort(),
  ["asset-id-mismatch", "download-failed", "invalid-json", "invalid-name", "invalid-snapshot"]
);
assert.equal(schema.$defs.entry.additionalProperties, false);
assert.ok(schema.$defs.entry.properties.assetName.pattern.startsWith("^quality-snapshot-"));
assert.ok(schema.$defs.entry.properties.releaseTag.pattern.startsWith("^quality-history-"));

console.log("Contrato de cuarentena histórica válido.");
