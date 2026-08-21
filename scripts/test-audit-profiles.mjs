import assert from "node:assert/strict";
import { profiles } from "./audit-repository.mjs";
import { buildQualityHistorySnapshot } from "./persist-quality-history.mjs";
import { validateQualityHistory } from "./validate-quality-history.mjs";

console.log("Iniciando pruebas de perfiles de auditoría...");

// 1. Verificación de presencia de los cuatro perfiles
const expectedProfileIds = ["gestor-autonomo", "nexo", "nucleo", "nucleo-preview"];
assert.deepEqual(Object.keys(profiles).sort(), expectedProfileIds.sort(), "Los perfiles de auditoría deben contener exactamente los 4 repositorios gestionados");

// 2. Verificación de notApplicableAreas canónicos con su explicación
const expectedNotApplicable = {
  "gestor-autonomo": [],
  nexo: ["Tipos", "Cobertura", "E2E", "Smoke test"],
  nucleo: ["Tipos", "Cobertura", "E2E"],
  "nucleo-preview": ["Instalación", "Tipos", "Build", "Cobertura", "E2E"]
};

for (const profileId of expectedProfileIds) {
  const profile = profiles[profileId];
  assert.ok(profile, `El perfil ${profileId} debe existir`);
  assert.ok(Array.isArray(profile.notApplicableAreas), `El perfil ${profileId} debe declarar notApplicableAreas como array`);
  assert.deepEqual(
    profile.notApplicableAreas.map((item) => item.area),
    expectedNotApplicable[profileId],
    `El perfil ${profileId} debe tener exactamente las áreas no aplicables esperadas`
  );
}

// 3. Verificación de propagación a snapshot histórico y validación de esquema
const dashboardSha = "0123456789abcdef0123456789abcdef01234567";
const standardSha = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";

const mockData = {
  schemaVersion: 1,
  source: {
    commit: dashboardSha,
    standardRelease: "v1.1.0",
    standardSha
  },
  repositories: expectedProfileIds.map((id) => {
    const p = profiles[id];
    const sha = "0123456789abcdef0123456789abcdef01234567";
    return {
      repository: {
        id,
        name: id,
        fullName: `AlexFrigenti/${id}`,
        visibility: "public",
        defaultBranch: "main",
        headSha: sha
      },
      profile: {
        id,
        label: p.label,
        kind: p.kind,
        notApplicableAreas: p.notApplicableAreas
      },
      overall: "pass",
      governance: {
        ruleset: {
          status: "pass"
        }
      },
      workflow: {
        status: "pass"
      },
      qualityRun: {
        status: "pass"
      },
      checks: [{ id: "main-protection", status: "pass" }],
      qualityEvidence: {
        status: "current",
        currentCommitSha: sha,
        validatedCommitSha: sha,
        summary: {
          conclusion: "passed",
          commit: {
            sha,
            branch: "main"
          },
          run: {
            completedAt: "2026-08-18T15:00:00.000Z"
          },
          gates: [
            {
              id: "build",
              label: "Build",
              status: "passed",
              applicability: "required",
              conclusion: "success",
              details: "Gate ejecutado correctamente."
            }
          ]
        }
      }
    };
  })
};

const snapshot = buildQualityHistorySnapshot(mockData, {
  now: new Date("2026-08-18T16:00:00.000Z"),
  dashboardCommitSha: dashboardSha
});

assert.ok(snapshot, "El snapshot generado no debe ser nulo");
assert.equal(snapshot.repositories.length, 4, "El snapshot debe contener 4 repositorios");
for (const repo of snapshot.repositories) {
  assert.deepEqual(
    repo.notApplicableAreas,
    profiles[repo.id].notApplicableAreas,
    `El snapshot debe propagar fielmente las áreas no aplicables con su explicación para ${repo.id}`
  );
}

const isValid = validateQualityHistory(snapshot);
assert.equal(isValid, true, "El snapshot histórico con los perfiles reales debe ser válido");

// 4. Pruebas defensivas y de robustez
// 4.1. Verificación de la forma enriquecida: área canónica y explicación breve no vacía
for (const profileId of expectedProfileIds) {
  for (const [idx, entry] of profiles[profileId].notApplicableAreas.entries()) {
    assert.equal(typeof entry, "object", `La entrada [${idx}] de ${profileId} debe ser un objeto`);
    assert.deepEqual(Object.keys(entry).sort(), ["area", "reason"], `La entrada [${idx}] de ${profileId} debe tener exactamente area y reason`);
    assert.equal(typeof entry.area, "string", `El área [${idx}] de ${profileId} debe ser un string`);
    assert.ok(entry.area.trim().length > 0, `El área [${idx}] de ${profileId} no puede estar vacía`);
    assert.ok(entry.area.length <= 120, `El área [${idx}] de ${profileId} no puede superar 120 caracteres`);
    assert.equal(typeof entry.reason, "string", `La explicación [${idx}] de ${profileId} debe ser un string`);
    assert.ok(entry.reason.trim().length > 0, `La explicación [${idx}] de ${profileId} no puede estar vacía`);
    assert.ok(entry.reason.length <= 240, `La explicación [${idx}] de ${profileId} no puede superar 240 caracteres`);
  }
}

// 4.2. Verificación de que gestor-autonomo es estrictamente array vacío (perfil de referencia)
assert.equal(profiles["gestor-autonomo"].notApplicableAreas.length, 0, "gestor-autonomo no debe tener exclusiones de perfil");

// 4.3. Verificación de que no hay contaminación entre perfiles
assert.notDeepEqual(profiles.nexo.notApplicableAreas, profiles.nucleo.notApplicableAreas);
assert.notDeepEqual(profiles.nucleo.notApplicableAreas, profiles["nucleo-preview"].notApplicableAreas);

// 5. Compatibilidad con datos históricos: la forma legacy de strings sigue siendo válida
const legacySnapshot = structuredClone(snapshot);
legacySnapshot.repositories.forEach((repo) => {
  repo.notApplicableAreas = repo.notApplicableAreas.map((item) => item.area);
});
assert.doesNotThrow(() => validateQualityHistory(legacySnapshot), "Un snapshot histórico con áreas como strings debe seguir validando");

console.log("Perfiles de auditoría y propagación a histórico válidos.");
