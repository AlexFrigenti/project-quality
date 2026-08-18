import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const allowedStatuses = new Set(["pass", "warning", "fail", "unknown", "pending", "missing", "not_applicable"]);
const qualityEvidenceStatuses = new Set(["current", "pending", "unavailable"]);
const qualityGateStatuses = new Set(["passed", "failed", "skipped", "not-applicable", "unknown"]);
const qualityApplicabilities = new Set(["required", "optional", "not-applicable"]);
const expectedIds = new Set(["gestor-autonomo", "nexo", "nucleo", "nucleo-preview"]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateQualityEvidence(report) {
  const evidence = report.qualityEvidence;
  assert(evidence && qualityEvidenceStatuses.has(evidence.status), "Evidencia inválida en " + report.repository.id);

  if (evidence.status !== "current") return;

  assert(evidence.summary && typeof evidence.summary === "object", "Falta el resumen de evidencia en " + report.repository.id);
  assert(evidence.currentCommitSha === report.repository.headSha, "El HEAD auditado no coincide con la evidencia en " + report.repository.id);
  assert(evidence.validatedCommitSha === evidence.currentCommitSha, "La evidencia no corresponde al HEAD actual en " + report.repository.id);
  assert(evidence.summary.commit?.sha === evidence.validatedCommitSha, "El SHA del resumen no coincide en " + report.repository.id);
  assert(["passed", "failed", "unknown"].includes(evidence.summary.conclusion), "Conclusión de evidencia inválida en " + report.repository.id);

  for (const gate of evidence.summary.gates || []) {
    assert(gate.id && /^[a-z0-9][a-z0-9-]*$/.test(gate.id), "Gate inválido en " + report.repository.id);
    assert(typeof gate.label === "string" && gate.label.length > 0, "Etiqueta de gate inválida en " + report.repository.id);
    assert(qualityApplicabilities.has(gate.applicability), "Applicability inválida en " + report.repository.id + "/" + gate.id);
    assert(qualityGateStatuses.has(gate.status), "Status de gate inválido en " + report.repository.id + "/" + gate.id);
    if (gate.applicability === "not-applicable") {
      assert(gate.status === "not-applicable", "Un gate no aplicable debe mantener status not-applicable.");
    }
    if (report.repository.visibility === "private") {
      assert(!gate.evidence?.some((item) => "url" in item), "Una evidencia privada contiene una URL.");
    }
  }

  if (report.repository.visibility === "private") {
    assert(!("url" in (evidence.summary.run || {})), "Una ejecución privada contiene una URL.");
    assert(!("evidence" in evidence.summary), "Un informe privado contiene referencias de evidencia.");
  }
}

export function validateDashboard(value) {
  assert(value && typeof value === "object", "El dashboard debe ser un objeto");
  assert(value.schemaVersion === 1, "schemaVersion debe ser 1");
  assert(Array.isArray(value.repositories) && value.repositories.length === expectedIds.size, "El dashboard debe contener exactamente cuatro repositorios");

  const ids = new Set(value.repositories.map((report) => report?.repository?.id));
  assert(ids.size === expectedIds.size && [...expectedIds].every((id) => ids.has(id)), "Los repositorios auditados no coinciden con el conjunto esperado");

  for (const report of value.repositories) {
    assert(allowedStatuses.has(report.overall), "Estado general inválido en " + report.repository.id);
    for (const check of report.checks || []) {
      assert(allowedStatuses.has(check.status), "Estado inválido en " + report.repository.id + "/" + check.id);
    }
    validateQualityEvidence(report);
  }

  const summaryKeys = [
    "total",
    "pass",
    "warning",
    "fail",
    "protectedMain",
    "pinnedWorkflows",
    "qualityGreen",
    "qualityCurrent",
    "qualityPending",
    "accessRequired"
  ];
  for (const key of summaryKeys) {
    assert(Number.isInteger(value.summary?.[key]) && value.summary[key] >= 0, "Métrica inválida: " + key);
  }
  assert(value.summary.total === value.repositories.length, "La métrica total no coincide");
  for (const status of ["pass", "warning", "fail"]) {
    const actual = value.repositories.filter((report) => report.overall === status).length;
    assert(value.summary[status] === actual, "La métrica " + status + " no coincide");
  }
  assert(
    value.summary.qualityCurrent === value.repositories.filter((report) => report.qualityEvidence.status === "current").length,
    "La métrica qualityCurrent no coincide"
  );
  assert(
    value.summary.qualityPending === value.repositories.filter((report) => report.qualityEvidence.status === "pending").length,
    "La métrica qualityPending no coincide"
  );

  const serialized = JSON.stringify(value);
  if (/(gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|Bearer\s+[A-Za-z0-9._-]+)/i.test(serialized)) {
    throw new Error("El dashboard contiene un patrón que parece un token");
  }

  return true;
}

async function main() {
  const file = process.argv[2] || "site/data.json";
  const value = JSON.parse(await readFile(file, "utf8"));
  validateDashboard(value);
  console.log("Dashboard válido: " + value.repositories.length + " repositorios.");
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
