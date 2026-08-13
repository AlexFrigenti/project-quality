import { mkdir, readdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";

const reportsDir = process.env.REPORTS_DIR || "audit-reports";
const outputDir = process.env.OUTPUT_DIR || "site";
const expectedIds = ["gestor-autonomo", "nexo", "nucleo", "nucleo-preview"];

await mkdir(outputDir, { recursive: true });
const names = (await readdir(reportsDir)).filter((name) => name.endsWith(".json"));
const reports = [];
for (const name of names) {
  const value = JSON.parse(await readFile(join(reportsDir, name), "utf8"));
  if (value?.repository?.id) reports.push(value);
}

const byId = new Map(reports.map((report) => [report.repository.id, report]));
const missing = expectedIds.filter((id) => !byId.has(id));
if (missing.length > 0) throw new Error(`Faltan informes de auditoría: ${missing.join(", ")}`);

const orderedReports = expectedIds.map((id) => byId.get(id));
const count = (predicate) => orderedReports.filter(predicate).length;
const data = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: {
    repository: "AlexFrigenti/project-quality",
    commit: process.env.GITHUB_SHA || null,
    standardRelease: process.env.STANDARD_RELEASE || "v1.1.0",
    standardSha: process.env.STANDARD_SHA || null
  },
  summary: {
    total: orderedReports.length,
    pass: count((report) => report.overall === "pass"),
    warning: count((report) => report.overall === "warning"),
    fail: count((report) => report.overall === "fail"),
    protectedMain: count((report) => report.governance?.ruleset?.status === "pass"),
    pinnedWorkflows: count((report) => report.workflow?.status === "pass"),
    qualityGreen: count((report) => report.qualityRun?.status === "pass"),
    qualityCurrent: count((report) => report.qualityEvidence?.status === "current"),
    qualityPending: count((report) => report.qualityEvidence?.status === "pending"),
    accessRequired: count((report) => report.repository?.access === "required")
  },
  repositories: orderedReports
};

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
