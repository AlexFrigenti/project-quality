import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { validateDashboard } from "./validate-dashboard.mjs";
import { assembleDashboard } from "./assemble-dashboard.mjs";

const execFileAsync = promisify(execFile);
const validateScriptPath = resolve("scripts/validate-dashboard.mjs");

console.log("Iniciando pruebas de validación y ensamblado del dashboard...");

const expectedIds = ["gestor-autonomo", "nexo", "nucleo", "nucleo-preview"];
const sampleSha = "0123456789abcdef0123456789abcdef01234567";

function buildValidRepository(id, { visibility = "public", qualityStatus = "current", governanceMechanism = "ruleset" } = {}) {
  const isPrivate = visibility === "private";
  return {
    repository: {
      id,
      name: id,
      fullName: `AlexFrigenti/${id}`,
      visibility,
      access: "available",
      defaultBranch: "main",
      url: isPrivate ? null : `https://github.com/AlexFrigenti/${id}`,
      headSha: sampleSha
    },
    overall: "pass",
    checks: [
      { id: "default-branch", label: "Rama estable", status: "pass", detail: "La rama por defecto es main." }
    ],
    governance: { ruleset: { status: "pass", mechanism: governanceMechanism } },
    workflow: { status: "pass" },
    qualityRun: { status: "pass" },
    qualityEvidence: qualityStatus === "current" ? {
      status: "current",
      currentCommitSha: sampleSha,
      validatedCommitSha: sampleSha,
      summary: {
        conclusion: "passed",
        commit: { sha: sampleSha, branch: "main" },
        run: isPrivate ? { completedAt: "2026-08-18T15:00:00.000Z" } : {
          completedAt: "2026-08-18T15:00:00.000Z",
          url: `https://github.com/AlexFrigenti/${id}/actions/runs/1`
        },
        gates: [
          {
            id: "build",
            label: "Build",
            applicability: "required",
            status: "passed",
            evidence: isPrivate ? [{ kind: "workflow-run", label: "Build step" }] : [
              { kind: "workflow-run", label: "Build step", url: `https://github.com/AlexFrigenti/${id}/actions/runs/1` }
            ]
          }
        ]
      }
    } : {
      status: "pending",
      message: "Evidencia pendiente para el commit actual",
      currentCommitSha: sampleSha,
      validatedCommitSha: null,
      artifact: null,
      summary: null
    }
  };
}

function buildValidDashboard() {
  const repositories = [
    buildValidRepository("gestor-autonomo", { visibility: "private" }),
    buildValidRepository("nexo", { visibility: "private" }),
    buildValidRepository("nucleo", { visibility: "public" }),
    buildValidRepository("nucleo-preview", { visibility: "public" })
  ];

  return {
    schemaVersion: 1,
    generatedAt: "2026-08-18T16:00:00.000Z",
    source: {
      repository: "AlexFrigenti/project-quality",
      commit: sampleSha,
      standardRelease: "v1.1.0",
      standardSha: sampleSha
    },
    summary: {
      total: 4,
      pass: 4,
      warning: 0,
      fail: 0,
      protectedMain: 4,
      pinnedWorkflows: 4,
      qualityGreen: 4,
      qualityCurrent: 4,
      qualityPending: 0,
      accessRequired: 0
    },
    repositories
  };
}

// -------------------------------------------------------------
// 1. Pruebas de validateDashboard (Validación en memoria)
// -------------------------------------------------------------

// 1.1. Payload válido
{
  const valid = buildValidDashboard();
  assert.equal(validateDashboard(valid), true, "Un dashboard válido debe retornar true");
}

// 1.2. Falta de repositorio esperado (solo 3 repos)
{
  const invalid = buildValidDashboard();
  invalid.repositories.pop();
  assert.throws(() => validateDashboard(invalid), /cuatro repositorios/);
}

// 1.3. ID duplicado
{
  const invalid = buildValidDashboard();
  invalid.repositories[3] = buildValidRepository("gestor-autonomo");
  assert.throws(() => validateDashboard(invalid), /no coinciden con el conjunto esperado/);
}

// 1.4. ID desconocido
{
  const invalid = buildValidDashboard();
  invalid.repositories[3] = buildValidRepository("repo-desconocido");
  assert.throws(() => validateDashboard(invalid), /no coinciden con el conjunto esperado/);
}

// 1.5. Estado overall inválido
{
  const invalid = buildValidDashboard();
  invalid.repositories[0].overall = "invalid-status";
  assert.throws(() => validateDashboard(invalid), /Estado general inválido/);
}

// 1.5. Incoherencia en summary total
{
  const invalid = buildValidDashboard();
  invalid.summary.total = 99;
  assert.throws(() => validateDashboard(invalid), /La métrica total no coincide/);
}

// 1.6. Incoherencia en summary de estados (pass)
{
  const invalid = buildValidDashboard();
  invalid.summary.pass = 0;
  assert.throws(() => validateDashboard(invalid), /La métrica pass no coincide/);
}

// 1.7. Incoherencia en summary qualityCurrent
{
  const invalid = buildValidDashboard();
  invalid.summary.qualityCurrent = 0;
  assert.throws(() => validateDashboard(invalid), /La métrica qualityCurrent no coincide/);
}

// 1.8. Repositorio privado que filtra URL en summary.run
{
  const invalid = buildValidDashboard();
  invalid.repositories[0].qualityEvidence.summary.run.url = "https://github.com/secret/run";
  assert.throws(() => validateDashboard(invalid), /Una ejecución privada contiene una URL/);
}

// 1.9. Repositorio privado que filtra URL en gate.evidence
{
  const invalid = buildValidDashboard();
  invalid.repositories[0].qualityEvidence.summary.gates[0].evidence = [
    { kind: "workflow-run", label: "Step", url: "https://github.com/secret/step" }
  ];
  assert.throws(() => validateDashboard(invalid), /Una evidencia privada contiene una URL/);
}

// 1.10. Repositorio privado que contiene clave evidence en summary
{
  const invalid = buildValidDashboard();
  invalid.repositories[0].qualityEvidence.summary.evidence = [
    { kind: "workflow-run", label: "Report" }
  ];
  assert.throws(() => validateDashboard(invalid), /Un informe privado contiene referencias de evidencia/);
}

// 1.11. Detección de token GitHub
{
  const invalid = buildValidDashboard();
  invalid.repositories[2].repository.name = "ghp_1234567890abcdef1234567890abcdef";
  assert.throws(() => validateDashboard(invalid), /patrón que parece un token/);
}

// 1.12. Detección de Bearer token
{
  const invalid = buildValidDashboard();
  invalid.repositories[2].repository.name = "Bearer abcdef1234567890";
  assert.throws(() => validateDashboard(invalid), /patrón que parece un token/);
}

// -------------------------------------------------------------
// 2. Pruebas de assembleDashboard (Filesystem temporal)
// -------------------------------------------------------------

const tempDir = await mkdtemp(join(tmpdir(), "test-assemble-dashboard-"));

try {
  const reportsDir = join(tempDir, "audit-reports");
  const outputDir = join(tempDir, "site");

  // 2.1. Caso correcto: ensamblado con los 4 reportes
  {
    await rm(reportsDir, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });

    const { mkdir } = await import("node:fs/promises");
    await mkdir(reportsDir, { recursive: true });

    for (const id of expectedIds) {
      const report = buildValidRepository(id, {
        visibility: ["gestor-autonomo", "nexo"].includes(id) ? "private" : "public",
        governanceMechanism: id === "nucleo-preview" ? "branch-protection" : "ruleset"
      });
      await writeFile(join(reportsDir, `report-${id}.json`), JSON.stringify(report, null, 2) + "\n");
    }

    const data = await assembleDashboard({
      reportsDir,
      outputDir,
      env: {
        GITHUB_SHA: sampleSha,
        STANDARD_RELEASE: "v1.1.0",
        STANDARD_SHA: sampleSha
      },
      now: new Date("2026-08-18T16:00:00.000Z")
    });

    assert.equal(data.schemaVersion, 1);
    assert.equal(data.repositories.length, 4);
    assert.deepEqual(
      data.repositories.map((r) => r.repository.id),
      expectedIds,
      "Los repositorios deben estar ordenados en el orden canónico de expectedIds"
    );
    assert.equal(data.summary.total, 4);
    assert.equal(data.summary.pass, 4);
    assert.equal(data.summary.protectedMain, 4);
    assert.equal(data.summary.qualityCurrent, 4);
    assert.equal(
      data.repositories.find((report) => report.repository.id === "nucleo-preview").governance.ruleset.mechanism,
      "branch-protection",
      "El ensamblado debe conservar el mecanismo de protección sin cambiar el contrato de status"
    );

    // Verificación de archivos generados en outputDir
    const dataContent = JSON.parse(await readFile(join(outputDir, "data.json"), "utf8"));
    assert.deepEqual(dataContent, data);
    assert.equal(validateDashboard(dataContent), true, "El data.json ensamblado debe superar validateDashboard");

    await access(join(outputDir, "index.html"), constants.R_OK);
    await access(join(outputDir, "history.html"), constants.R_OK);
    await access(join(outputDir, ".nojekyll"), constants.R_OK);

    const indexHtml = await readFile(join(outputDir, "index.html"), "utf8");
    assert.ok(indexHtml.length > 0, "index.html no debe estar vacío");
    const historyHtml = await readFile(join(outputDir, "history.html"), "utf8");
    assert.ok(historyHtml.length > 0, "history.html no debe estar vacío");
  }

  // 2.2. Caso reporte ausente: solo 3 reportes
  {
    await rm(reportsDir, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });

    const { mkdir } = await import("node:fs/promises");
    await mkdir(reportsDir, { recursive: true });

    // Escribir solo 3 reportes (falta nucleo-preview)
    for (const id of ["gestor-autonomo", "nexo", "nucleo"]) {
      const report = buildValidRepository(id);
      await writeFile(join(reportsDir, `report-${id}.json`), JSON.stringify(report, null, 2) + "\n");
    }

    await assert.rejects(
      () => assembleDashboard({ reportsDir, outputDir }),
      /Faltan informes de auditoría: nucleo-preview/,
      "assembleDashboard debe fallar e identificar el reporte faltante"
    );
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

// -------------------------------------------------------------
// 3. Pruebas de regresión CLI para validate-dashboard.mjs
// -------------------------------------------------------------

const cliTempDir = await mkdtemp(join(tmpdir(), "test-cli-validate-"));
try {
  const { mkdir } = await import("node:fs/promises");
  const siteDir = join(cliTempDir, "site");
  await mkdir(siteDir, { recursive: true });

  const valid = buildValidDashboard();
  await writeFile(join(siteDir, "data.json"), JSON.stringify(valid, null, 2) + "\n", "utf8");

  // 3.1. CLI sin argumentos (debe resolver site/data.json por defecto)
  {
    const { stdout } = await execFileAsync("node", [validateScriptPath], { cwd: cliTempDir });
    assert.match(stdout, /Dashboard válido: 4 repositorios\./);
  }

  // 3.2. CLI con ruta explícita
  {
    const customDir = join(cliTempDir, "custom");
    await mkdir(customDir, { recursive: true });
    await writeFile(join(customDir, "custom-data.json"), JSON.stringify(valid, null, 2) + "\n", "utf8");

    const { stdout } = await execFileAsync("node", [validateScriptPath, "custom/custom-data.json"], { cwd: cliTempDir });
    assert.match(stdout, /Dashboard válido: 4 repositorios\./);
  }

  // 3.3. CLI sin argumentos cuando no existe site/data.json
  {
    const emptyTempDir = await mkdtemp(join(tmpdir(), "test-cli-empty-"));
    try {
      await assert.rejects(
        () => execFileAsync("node", [validateScriptPath], { cwd: emptyTempDir }),
        (err) => {
          assert.equal(err.code, 1);
          assert.match(err.stderr || err.stdout || err.message, /site[\\\/]data\.json/);
          return true;
        },
        "Debe fallar con exit code 1 indicando que site/data.json no existe"
      );
    } finally {
      await rm(emptyTempDir, { recursive: true, force: true });
    }
  }
} finally {
  await rm(cliTempDir, { recursive: true, force: true });
}

console.log("Pruebas de validación y ensamblado del dashboard válidas.");
