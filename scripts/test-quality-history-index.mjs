import { readFile } from "node:fs/promises";
import { buildHistoryIndex } from "./collect-quality-history.mjs";
import { snapshotId } from "./persist-quality-history.mjs";
import { canonicalJson } from "./quality-contract.mjs";
import { validateQualityHistoryIndex } from "./validate-quality-history-index.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectFailure(callback, message) {
  try {
    callback();
  } catch {
    return;
  }
  throw new Error(message);
}

function snapshot(generatedAt, currentHeadSha) {
  const value = {
    schemaVersion: 1,
    identityVersion: 2,
    id: "pending",
    generatedAt,
    dashboardCommitSha: "b".repeat(40),
    standard: { release: "v1.1.0", sha: "c".repeat(40) },
    repositories: [{
      id: "nexo",
      repository: "AlexFrigenti/Nexo",
      kind: "node",
      visibility: "private",
      notApplicableAreas: ["types", "coverage", "e2e", "smoke"],
      process: {
        overall: "pass",
        mainProtection: "pass",
        workflow: "pass",
        checks: []
      },
      quality: {
        status: "pending",
        currentHeadSha,
        message: "Evidencia pendiente para el commit actual.",
        gates: [],
        metrics: {}
      }
    }]
  };
  value.id = snapshotId(value);
  return value;
}

const newest = snapshot("2026-08-13T12:00:00.000Z", "d".repeat(40));
const oldest = snapshot("2026-08-12T12:00:00.000Z", "e".repeat(40));
const index = buildHistoryIndex([oldest, newest, newest]);

assert(index.snapshots.length === 2, "La deduplicación del índice ha fallado.");
assert(index.snapshots[0].id === newest.id, "El índice no está ordenado de más reciente a más antiguo.");
validateQualityHistoryIndex(index);

const legacyVariant = structuredClone(newest);
delete legacyVariant.identityVersion;
legacyVariant.generatedAt = "2026-08-11T12:00:00.000Z";
legacyVariant.id = snapshotId(legacyVariant);
const mixedIndex = buildHistoryIndex([legacyVariant, newest]);
assert(mixedIndex.snapshots.length === 2, "El índice mixto debe conservar legacy y v2.");
assert(mixedIndex.snapshots[0].id !== mixedIndex.snapshots[1].id, "Las identidades legacy y v2 deben ser distintas.");
assert(!("identityVersion" in mixedIndex.snapshots.find((item) => item.id === legacyVariant.id)), "El snapshot legacy no debe reescribirse.");
validateQualityHistoryIndex(mixedIndex);

const duplicateNewest = structuredClone(newest);
duplicateNewest.generatedAt = "2026-08-13T12:00:00.000Z";
const duplicateOlder = structuredClone(newest);
duplicateOlder.generatedAt = "2026-08-13T09:00:00.000Z";

{
  const forward = buildHistoryIndex([duplicateNewest, duplicateOlder]);
  const backward = buildHistoryIndex([duplicateOlder, duplicateNewest]);
  assert(forward.snapshots.length === 1, "Los duplicados deben colapsar en un representante.");
  assert(backward.snapshots.length === 1, "Los duplicados deben colapsar en un representante.");
  assert(forward.snapshots[0].generatedAt === duplicateNewest.generatedAt, "Debe ganar el generatedAt mayor.");
  assert(backward.snapshots[0].generatedAt === duplicateNewest.generatedAt, "La selección no puede depender del orden de entrada.");
}

{
  const tieA = structuredClone(newest);
  tieA.repositories[0].quality.message = "aaa";
  const tieB = structuredClone(newest);
  tieB.repositories[0].quality.message = "bbb";
  assert(tieA.id === tieB.id, "El mensaje está fuera de la identidad: mismos ids.");
  const expectedCanonical = canonicalJson(tieA) <= canonicalJson(tieB) ? tieA : tieB;

  const forward = buildHistoryIndex([tieA, tieB]);
  const backward = buildHistoryIndex([tieB, tieA]);
  assert(forward.snapshots.length === 1 && backward.snapshots.length === 1);
  assert(
    forward.snapshots[0].repositories[0].quality.message === expectedCanonical.repositories[0].quality.message,
    "En empate debe ganar el JSON canónico menor."
  );
  assert(
    backward.snapshots[0].repositories[0].quality.message === expectedCanonical.repositories[0].quality.message,
    "El desempate canónico no puede depender del orden."
  );
}

{
  const before = structuredClone([newest, oldest]);
  const index = buildHistoryIndex([newest, oldest]);
  assert(canonicalJson([newest, oldest]) === canonicalJson(before), "buildHistoryIndex no debe mutar sus entradas.");
  validateQualityHistoryIndex(index);
}

expectFailure(() => validateQualityHistoryIndex({
  ...index,
  snapshots: [{ ...newest, generatedAt: null }]
}), "El índice debería rechazar null.");

expectFailure(() => validateQualityHistoryIndex({
  ...index,
  snapshots: [{ ...newest, repositories: [{ ...newest.repositories[0], repository: "https://example.invalid" }] }]
}), "El índice debería rechazar URLs.");

expectFailure(() => validateQualityHistoryIndex({ ...index, extraField: true }), "El índice debería rechazar campos raíz desconocidos.");
expectFailure(() => validateQualityHistoryIndex({ ...index, generatedAt: "2026-08-13" }), "El índice debería exigir fechas RFC3339.");

const schema = JSON.parse(await readFile("schemas/quality-history-index.schema.json", "utf8"));
assert(schema.additionalProperties === false, "El schema del índice debe cerrar el objeto raíz.");
assert(
  schema.properties.generatedAt.pattern === "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$",
  "El schema del índice debe declarar fechas RFC3339."
);

console.log("Índice histórico válido.");
