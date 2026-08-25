import { mkdir, readdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildDashboardSummary, validateDashboard } from "./dashboard-contract.mjs";

const FRESHNESS_MAX_AGE_HOURS = 192;

const expectedIds = ["gestor-autonomo", "nexo", "nucleo", "nucleo-preview"];

export async function assembleDashboard({
  reportsDir = process.env.REPORTS_DIR || "audit-reports",
  outputDir = process.env.OUTPUT_DIR || "site",
  env = process.env,
  now = new Date()
} = {}) {
  await mkdir(outputDir, { recursive: true });
  const names = (await readdir(reportsDir)).filter((name) => name.endsWith(".json"));
  const reports = [];
  for (const name of names) {
    const value = JSON.parse(await readFile(join(reportsDir, name), "utf8"));
    if (!value?.repository?.id) throw new Error(`Informe de auditoría inválido: ${name}`);
    reports.push(value);
  }

  const byId = new Map();
  for (const report of reports) {
    const id = report.repository.id;
    if (byId.has(id)) throw new Error(`Hay informes de auditoría duplicados para: ${id}`);
    byId.set(id, report);
  }
  const unexpected = [...byId.keys()].filter((id) => !expectedIds.includes(id));
  if (unexpected.length > 0) throw new Error(`Hay informes de auditoría desconocidos: ${unexpected.join(", ")}`);
  const missing = expectedIds.filter((id) => !byId.has(id));
  if (missing.length > 0) throw new Error(`Faltan informes de auditoría: ${missing.join(", ")}`);

  const orderedReports = expectedIds.map((id) => byId.get(id));
  const data = {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    source: {
      repository: "AlexFrigenti/project-quality",
      commit: env.GITHUB_SHA || null,
      standardRelease: env.STANDARD_RELEASE || "v1.1.0",
      standardSha: env.STANDARD_SHA || null
    },
    freshness: { maxAgeHours: FRESHNESS_MAX_AGE_HOURS },
    summary: buildDashboardSummary(orderedReports),
    repositories: orderedReports
  };

  validateDashboard(data);

  await writeFile(join(outputDir, "data.json"), `${JSON.stringify(data, null, 2)}\n`);

  const dashboardPages = ["index.html", "history.html"];
  for (const page of dashboardPages) {
    const sourcePath = join("dashboard", page);
    const outputPath = join(outputDir, page);
    await copyFile(sourcePath, outputPath);
    const content = await readFile(outputPath, "utf8");
    if (content.length === 0) {
      throw new Error(`La página del dashboard está vacía: ${page}`);
    }
  }

  await writeFile(join(outputDir, ".nojekyll"), "\n");
  return data;
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (entrypoint === import.meta.url) {
  try {
    await assembleDashboard();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
