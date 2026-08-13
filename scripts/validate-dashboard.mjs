import { readFile } from "node:fs/promises";

const file = process.argv[2] || "dashboard/data.json";
const allowedStatuses = new Set(["pass", "warning", "fail", "unknown", "pending", "missing", "not_applicable"]);
const expectedIds = new Set(["gestor-autonomo", "nexo", "nucleo", "nucleo-preview"]);
const value = JSON.parse(await readFile(file, "utf8"));

if (value.schemaVersion !== 1) throw new Error("schemaVersion debe ser 1");
if (!Array.isArray(value.repositories) || value.repositories.length !== expectedIds.size) {
  throw new Error("El dashboard debe contener exactamente cuatro repositorios");
}

const ids = new Set(value.repositories.map((report) => report?.repository?.id));
if (ids.size !== expectedIds.size || [...expectedIds].some((id) => !ids.has(id))) {
  throw new Error("Los repositorios auditados no coinciden con el conjunto esperado");
}

for (const report of value.repositories) {
  if (!allowedStatuses.has(report.overall)) throw new Error(`Estado general inválido en ${report.repository.id}`);
  for (const check of report.checks || []) {
    if (!allowedStatuses.has(check.status)) throw new Error(`Estado inválido en ${report.repository.id}/${check.id}`);
  }
}

const summaryKeys = ["total", "pass", "warning", "fail", "protectedMain", "pinnedWorkflows", "qualityGreen", "accessRequired"];
for (const key of summaryKeys) {
  if (!Number.isInteger(value.summary?.[key]) || value.summary[key] < 0) throw new Error(`Métrica inválida: ${key}`);
}
if (value.summary.total !== value.repositories.length) throw new Error("La métrica total no coincide");
for (const status of ["pass", "warning", "fail"]) {
  const actual = value.repositories.filter((report) => report.overall === status).length;
  if (value.summary[status] !== actual) throw new Error(`La métrica ${status} no coincide`);
}

const serialized = JSON.stringify(value);
if (/(gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|Bearer\s+[A-Za-z0-9._-]+)/i.test(serialized)) {
  throw new Error("El dashboard contiene un patrón que parece un token");
}

console.log(`Dashboard válido: ${value.repositories.length} repositorios.`);
