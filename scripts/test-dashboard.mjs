import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildDashboardSummary, computeFreshness, FRESHNESS_MAX_AGE_HOURS, validateDashboard } from "./dashboard-contract.mjs";
import { validateDashboard as validateDashboardCliExport } from "./validate-dashboard.mjs";
import { assembleDashboard } from "./assemble-dashboard.mjs";

const execFileAsync = promisify(execFile);
const validateScriptPath = resolve("scripts/validate-dashboard.mjs");

console.log("Iniciando pruebas de validación y ensamblado del dashboard...");

const expectedIds = ["gestor-autonomo", "nexo", "nucleo", "nucleo-preview"];
const sampleSha = "0123456789abcdef0123456789abcdef01234567";

function buildValidRepository(id, { visibility = "public", qualityStatus = "current", governanceMechanism = "ruleset" } = {}) {
  const isPrivate = visibility === "private";
  const repositoryUrl = isPrivate ? null : `https://github.com/AlexFrigenti/${id}`;
  const workflowPath = ".github/workflows/quality.yml";
  const workflowUrl = repositoryUrl ? `${repositoryUrl}/blob/main/${workflowPath}` : null;
  const rulesetUrl = repositoryUrl ? `${repositoryUrl}/rules` : null;
  const runUrl = repositoryUrl ? `${repositoryUrl}/actions/runs/1` : null;
  const startedAt = "2026-08-18T14:59:00.000Z";
  const completedAt = "2026-08-18T15:00:00.000Z";
  const qualityEvidence = qualityStatus === "current" ? {
    status: "current",
    message: "Evidencia correspondiente exactamente al HEAD actual de la rama estable.",
    currentCommitSha: sampleSha,
    validatedCommitSha: sampleSha,
    artifact: {
      id: 1,
      name: "quality-metrics",
      createdAt: completedAt,
      expiresAt: "2026-11-16T15:00:00.000Z"
    },
    summary: {
      conclusion: "passed",
      commit: {
        sha: sampleSha,
        ref: "refs/heads/main",
        branch: "main",
        event: "push"
      },
      run: {
        workflow: "Quality checks",
        id: 1,
        attempt: 1,
        startedAt,
        completedAt,
        ...(runUrl ? { url: runUrl } : {})
      },
      standard: { version: "v1.1.0", sha: sampleSha },
      gates: [
        {
          id: "build",
          label: "Build",
          applicability: "required",
          status: "passed",
          details: "Gate ejecutado correctamente.",
          evidence: [
            {
              kind: "workflow-run",
              label: "Build step",
              ...(runUrl ? { url: runUrl } : {})
            }
          ]
        }
      ],
      metrics: {},
      ...(runUrl ? {
        evidence: [{ kind: "workflow-run", label: "Quality report", url: runUrl }]
      } : {})
    }
  } : {
    status: qualityStatus,
    message: "Evidencia pendiente para el commit actual",
    currentCommitSha: sampleSha,
    validatedCommitSha: null,
    artifact: null,
    summary: null
  };
  return {
    repository: {
      id,
      name: id,
      fullName: `AlexFrigenti/${id}`,
      visibility,
      access: "available",
      defaultBranch: "main",
      url: repositoryUrl,
      headSha: sampleSha
    },
    profile: {
      id,
      label: id,
      kind: id === "nucleo-preview" ? "static" : "node",
      description: `Perfil de prueba para ${id}.`,
      notApplicableAreas: []
    },
    overall: qualityStatus === "current" ? "pass" : "warning",
    checks: [
      { id: "default-branch", label: "Rama estable", status: "pass", detail: "La rama por defecto es main.", evidenceUrl: null },
      ...(qualityStatus === "current" ? [] : [{
        id: "latest-quality-run",
        label: "Última validación",
        status: qualityStatus === "pending" ? "pending" : "unknown",
        detail: "Evidencia no utilizable para el commit actual.",
        evidenceUrl: null
      }])
    ],
    issues: [],
    governance: {
      ruleset: {
        status: "pass",
        name: "Main protection",
        url: rulesetUrl,
        mechanism: governanceMechanism,
        reason: "Protección de prueba válida.",
        rules: ["pull_request", "required_status_checks"]
      }
    },
    workflow: {
      path: workflowPath,
      reusableWorkflow: ".github/workflows/node-quality.yml",
      pinnedTo: sampleSha,
      status: "pass",
      url: workflowUrl,
      missingInputs: []
    },
    qualityRun: qualityStatus === "current" ? {
      status: "pass",
      conclusion: "passed",
      createdAt: completedAt,
      url: runUrl,
      headSha: sampleSha
    } : {
      status: qualityStatus === "pending" ? "pending" : "unknown",
      conclusion: null,
      createdAt: null,
      url: null,
      headSha: null
    },
    qualityEvidence
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
    freshness: { maxAgeHours: 192 },
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

// 1.1.a Frescura: el bloque freshness es obligatorio
{
  const noFreshness = buildValidDashboard();
  delete noFreshness.freshness;
  assert.throws(() => validateDashboard(noFreshness), /freshness/, "freshness debe ser obligatorio");
}

// 1.1.b maxAgeHours inválido: ausente, cero, negativo, decimal, no numérico, null, 191, 193
for (const [label, mutate] of [
  ["ausente", (f) => ({ maxAgeHours: undefined })],
  ["cero", (f) => ({ maxAgeHours: 0 })],
  ["negativo", (f) => ({ maxAgeHours: -24 })],
  ["decimal", (f) => ({ maxAgeHours: 192.5 })],
  ["no numérico", (f) => ({ maxAgeHours: "192" })],
  ["null", (f) => ({ maxAgeHours: null })],
  ["191", (f) => ({ maxAgeHours: 191 })],
  ["193", (f) => ({ maxAgeHours: 193 })]
]) {
  const broken = buildValidDashboard();
  broken.freshness = { ...mutate() };
  assert.throws(() => validateDashboard(broken), /maxAgeHours/, `maxAgeHours ${label} debe rechazarse`);
}

// 1.1.c Exactamente 192 se acepta
{
  const exact = buildValidDashboard();
  assert.doesNotThrow(() => validateDashboard(exact), "maxAgeHours 192 debe aceptarse");
}

// 1.1.d computeFreshness: límites y rutas
{
  const now = new Date("2026-08-20T12:00:00.000Z");
  const hoursAgo = (h, ms = 0) => new Date(now.getTime() - h * 3600000 - ms).toISOString();
  assert.equal(computeFreshness(hoursAgo(0), now, 192), "fresh", "edad 0 es fresh");
  assert.equal(computeFreshness(hoursAgo(192), now, 192), "fresh", "exactamente 192 horas es fresh");
  assert.equal(computeFreshness(hoursAgo(192, 1), now, 192), "stale", "192 horas + 1 ms es stale");
  assert.equal(computeFreshness(hoursAgo(300), now, 192), "stale", "mucho más viejo es stale");
  assert.equal(computeFreshness(new Date(now.getTime() + 3600000).toISOString(), now, 192), "unknown", "fecha futura es unknown");
  assert.equal(computeFreshness("no-es-una-fecha", now, 192), "unknown", "fecha inválida es unknown");
  assert.equal(computeFreshness(undefined, now, 192), "unknown", "fecha ausente es unknown");
  assert.equal(computeFreshness(hoursAgo(1), now, 0), "unknown", "política cero es unknown");
  assert.equal(computeFreshness(hoursAgo(1), now, -5), "unknown", "política negativa es unknown");
  assert.equal(computeFreshness(hoursAgo(1), now, 1.5), "unknown", "política decimal es unknown");
  assert.equal(computeFreshness(hoursAgo(1), now, "192"), "unknown", "política no numérica es unknown");
  assert.equal(FRESHNESS_MAX_AGE_HOURS, 192, "La política del ensamblador es 192 horas");
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
  assert.throws(() => validateDashboard(invalid), /duplicado|no coinciden con el conjunto esperado/);
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

// 1.13. Todos los agregados declarados deben coincidir con los informes
{
  const invalid = buildValidDashboard();
  invalid.summary.protectedMain = 0;
  assert.throws(() => validateDashboard(invalid), /protectedMain/);
}

// 1.14. La recomposición pura debe cubrir todos los contadores actuales
{
  const valid = buildValidDashboard();
  assert.deepEqual(buildDashboardSummary(valid.repositories), valid.summary);
  assert.equal(validateDashboardCliExport, validateDashboard);
  for (const key of Object.keys(valid.summary)) {
    const invalid = buildValidDashboard();
    invalid.summary[key] += 1;
    assert.throws(() => validateDashboard(invalid), new RegExp("La métrica " + key + " no coincide"));
  }
}

// 1.14b. Los agregados desconocidos no pueden atravesar el contrato sin recomposición
{
  const invalid = buildValidDashboard();
  invalid.summary.unverifiedCount = 0;
  assert.throws(() => validateDashboard(invalid), /summary|Métrica|agregado/i);
}

// 1.14c. Las URLs privadas pueden omitirse por completo, no solo ser null
{
  const valid = buildValidDashboard();
  const privateReport = valid.repositories[0];
  delete privateReport.repository.url;
  delete privateReport.workflow.url;
  delete privateReport.governance.ruleset.url;
  delete privateReport.qualityRun.url;
  delete privateReport.checks[0].evidenceUrl;
  assert.equal(validateDashboard(valid), true);
}

// 1.15. Un informe privado no puede filtrar URLs en campos de proceso
for (const [label, mutate] of [
  ["repository.url", (report) => { report.repository.url = "https://github.com/private-leak"; }],
  ["workflow.url", (report) => { report.workflow.url = "https://github.com/private-leak"; }],
  ["governance.ruleset.url", (report) => { report.governance.ruleset.url = "https://github.com/private-leak"; }],
  ["qualityRun.url", (report) => { report.qualityRun.url = "https://github.com/private-leak"; }],
  ["checks[].evidenceUrl", (report) => { report.checks[0].evidenceUrl = "https://github.com/private-leak"; }]
]) {
  const invalid = buildValidDashboard();
  mutate(invalid.repositories[0]);
  assert.throws(
    () => validateDashboard(invalid),
    /privad|URL|evidencia/i,
    `Debe rechazar una URL privada en ${label}`
  );
}

// 1.16. Un informe privado tampoco puede filtrar una URL en un campo anidado no conocido
for (const nestedUrl of ["https://github.com/private-nested-leak", "ftp://private-nested-leak.invalid/resource"]) {
  const invalid = buildValidDashboard();
  invalid.repositories[0].metadata = { trace: { href: nestedUrl } };
  assert.throws(() => validateDashboard(invalid), /URL|privad/i);
}

// 1.17. La evidencia current debe conservar la coherencia de la ejecución
{
  const invalid = buildValidDashboard();
  invalid.repositories[0].qualityRun.status = "fail";
  assert.throws(() => validateDashboard(invalid), /qualityRun/);
}

// 1.17b. Una ejecución current fallida no puede ser verde aunque falte su check proyectado
{
  const invalid = buildValidDashboard();
  const report = invalid.repositories[0];
  report.qualityEvidence.summary.conclusion = "failed";
  report.qualityEvidence.summary.gates[0].status = "failed";
  report.qualityRun.status = "fail";
  report.qualityRun.conclusion = "failed";
  report.overall = "pass";
  invalid.summary = buildDashboardSummary(invalid.repositories);
  assert.throws(() => validateDashboard(invalid), /overall|qualityRun|latest-quality-run/i);
}

// 1.18. La evidencia no utilizable no puede llevar resumen ni convertirse en verde
for (const status of ["pending", "unavailable"]) {
  const invalid = buildValidDashboard();
  invalid.repositories[0] = buildValidRepository("gestor-autonomo", { visibility: "private", qualityStatus: status });
  invalid.summary = buildDashboardSummary(invalid.repositories);
  invalid.repositories[0].qualityEvidence.summary = {};
  assert.throws(() => validateDashboard(invalid), /summary|evidencia/i);

  const withGreenRun = buildValidDashboard();
  withGreenRun.repositories[0] = buildValidRepository("gestor-autonomo", { visibility: "private", qualityStatus: status });
  withGreenRun.repositories[0].qualityRun.status = "pass";
  withGreenRun.summary = buildDashboardSummary(withGreenRun.repositories);
  assert.throws(() => validateDashboard(withGreenRun), /qualityRun/);
}

// 1.19. pending y unavailable se distinguen y no comparten contador
{
  const valid = buildValidDashboard();
  valid.repositories[0] = buildValidRepository("gestor-autonomo", { visibility: "private", qualityStatus: "pending" });
  valid.repositories[1] = buildValidRepository("nexo", { visibility: "private", qualityStatus: "unavailable" });
  valid.summary = buildDashboardSummary(valid.repositories);
  assert.equal(valid.summary.qualityCurrent, 2);
  assert.equal(valid.summary.qualityPending, 1);
  assert.equal(validateDashboard(valid), true);
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
    assert.deepEqual(data.freshness, { maxAgeHours: 192 }, "El ensamblador debe emitir la política de frescura de 192 horas");
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

  // 2.2. El ensamblador no debe ignorar informes duplicados
  {
    await rm(outputDir, { recursive: true, force: true });
    const duplicate = JSON.parse(await readFile(join(reportsDir, "report-gestor-autonomo.json"), "utf8"));
    await writeFile(join(reportsDir, "report-gestor-autonomo-copy.json"), JSON.stringify(duplicate, null, 2) + "\n");

    await assert.rejects(
      () => assembleDashboard({
        reportsDir,
        outputDir,
        env: { GITHUB_SHA: sampleSha, STANDARD_RELEASE: "v1.1.0", STANDARD_SHA: sampleSha }
      }),
      /duplicados/,
      "assembleDashboard debe rechazar informes duplicados"
    );
    await assert.rejects(() => access(join(outputDir, "data.json")), /ENOENT/);
  }

  // 2.3. Caso evidencia current incompleta
  {
    await rm(reportsDir, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });

    const { mkdir } = await import("node:fs/promises");
    await mkdir(reportsDir, { recursive: true });

    for (const id of expectedIds) {
      const report = buildValidRepository(id, {
        visibility: ["gestor-autonomo", "nexo"].includes(id) ? "private" : "public"
      });
      if (id === "gestor-autonomo") report.qualityEvidence = { status: "current" };
      await writeFile(join(reportsDir, `report-${id}.json`), JSON.stringify(report, null, 2) + "\n");
    }

    await assert.rejects(
      () => assembleDashboard({
        reportsDir,
        outputDir,
        env: { GITHUB_SHA: sampleSha, STANDARD_RELEASE: "v1.1.0", STANDARD_SHA: sampleSha }
      }),
      /summary|evidencia/i,
      "assembleDashboard debe rechazar evidencia current incompleta"
    );
    await assert.rejects(
      () => access(join(outputDir, "data.json")),
      /ENOENT/,
      "Un ensamblado inválido no debe dejar data.json escrito"
    );
  }

  // 2.4. Caso reporte ausente: solo 3 reportes
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

// -------------------------------------------------------------
// Frescura visible en la interfaz (contrato estático del HTML)
// -------------------------------------------------------------
{
  const html = await readFile("dashboard/index.html", "utf8");
  assert.ok(html.includes("data.freshness"), "La interfaz debe leer data.freshness");
  assert.ok(html.includes("maxAgeHours"), "La interfaz debe usar la política maxAgeHours publicada");
  assert.ok(html.includes("freshnessStatus"), "La interfaz debe calcular el estado con freshnessStatus()");
  for (const label of ["Fresca", "Antigua", "No verificable"]) {
    assert.ok(html.includes(label), `La interfaz debe mostrar la ruta de estado "${label}"`);
  }
  assert.match(
    html,
    /stale[\s\S]{0,200}badge\.warning|freshness-stale/,
    "stale debe mostrarse como advertencia (amber), nunca verde"
  );
  assert.match(
    html,
    /unknown[\s\S]{0,200}(badge\.warning|badge\.unknown)|freshness-unknown/,
    "unknown debe mostrarse como advertencia o no-verde"
  );
}

// -------------------------------------------------------------
// La frescura no altera el snapshotId ni reescribe el histórico
// -------------------------------------------------------------
{
  const { buildQualityHistorySnapshot } = await import("./persist-quality-history.mjs");
  const dashboardSha = "0123456789abcdef0123456789abcdef01234567";
  const withFreshness = structuredClone(buildValidDashboard());
  const withoutFreshness = structuredClone(withFreshness);
  delete withoutFreshness.freshness;
  withFreshness.generatedAt = "2026-08-18T16:00:00.000Z";
  withoutFreshness.generatedAt = "2026-08-18T16:00:00.000Z";
  const snapA = buildQualityHistorySnapshot(withFreshness, {
    now: new Date("2026-08-18T17:00:00.000Z"),
    dashboardCommitSha: dashboardSha
  });
  const snapB = buildQualityHistorySnapshot(withoutFreshness, {
    now: new Date("2026-08-19T17:00:00.000Z"),
    dashboardCommitSha: dashboardSha
  });
  assert.ok(snapA && snapB);
  assert.equal(snapA.identityVersion, 2, "El pin de compatibilidad corresponde a snapshots v2");
  assert.equal(snapB.identityVersion, 2, "El pin de compatibilidad corresponde a snapshots v2");
  assert.equal(snapA.id, snapB.id, "freshness/generatedAt no participan en snapshotId");
  assert.notEqual(snapA.generatedAt, snapB.generatedAt);
}

console.log("Pruebas de validación y ensamblado del dashboard válidas.");
