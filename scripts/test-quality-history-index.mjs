import { buildHistoryIndex } from "./collect-quality-history.mjs";
import { snapshotId } from "./persist-quality-history.mjs";
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

const recurrence = snapshot("2026-08-20T12:00:00.000Z", "d".repeat(40));
assert(recurrence.id === newest.id, "Una reejecución del mismo estado debería compartir identidad.");
assert(recurrence.generatedAt > newest.generatedAt, "La reejecución debería ser posterior al asset histórico.");

const indexNow = new Date("2026-08-21T00:00:00.000Z");
const withStaleDuplicate = buildHistoryIndex([recurrence, oldest, newest], { now: indexNow });
assert(withStaleDuplicate.snapshots.length === 2, "Un asset histórico repetido no debe crear una entrada adicional.");
assert(
  withStaleDuplicate.snapshots[0].generatedAt === recurrence.generatedAt,
  "El índice debe conservar la observación más reciente cuando el estado actual ya estaba persistido."
);

const reversedRecurrence = buildHistoryIndex([oldest, newest, recurrence], { now: indexNow });
assert(
  JSON.stringify(reversedRecurrence) === JSON.stringify(withStaleDuplicate),
  "La deduplicación no debe depender del orden de entrada."
);

validateQualityHistoryIndex(withStaleDuplicate);

expectFailure(() => validateQualityHistoryIndex({
  ...index,
  snapshots: [{ ...newest, generatedAt: null }]
}), "El índice debería rechazar null.");

expectFailure(() => validateQualityHistoryIndex({
  ...index,
  snapshots: [{ ...newest, repositories: [{ ...newest.repositories[0], repository: "https://example.invalid" }] }]
}), "El índice debería rechazar URLs.");

console.log("Índice histórico válido.");
