import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { collectQualityEvidence } from "./collect-quality-evidence.mjs";
import { evaluateMainProtection } from "./main-protection.mjs";

const API_ROOT = "https://api.github.com";

export const profiles = {
  "gestor-autonomo": {
    label: "Gestor Autónomo",
    kind: "node",
    description: "Aplicación Node.js de referencia con cobertura y E2E.",
    workflowPath: ".github/workflows/quality.yml",
    reusableWorkflow: ".github/workflows/node-quality.yml",
    requiredQualityCheck: { context: "Reusable Node.js quality / Quality gates" },
    requiredInputs: [
      "install-command",
      "preflight-command",
      "lint-command",
      "typecheck-command",
      "build-command",
      "test-command",
      "coverage-command",
      "e2e-install-command",
      "e2e-command",
      "smoke-command"
    ],
    notApplicableAreas: []
  },
  nexo: {
    label: "Nexo",
    kind: "node",
    description: "Proyecto Node.js de contenido con validaciones deterministas.",
    workflowPath: ".github/workflows/quality.yml",
    reusableWorkflow: ".github/workflows/node-quality.yml",
    requiredQualityCheck: { context: "Reusable Node.js quality / Quality gates" },
    requiredInputs: ["install-command", "lint-command", "build-command", "test-command"],
    notApplicableAreas: ["Tipos", "Cobertura", "E2E", "Smoke test"]
  },
  nucleo: {
    label: "Núcleo",
    kind: "node",
    description: "Aplicación de juego con build, tests y smoke test de artefactos.",
    workflowPath: ".github/workflows/quality.yml",
    reusableWorkflow: ".github/workflows/node-quality.yml",
    requiredQualityCheck: { context: "Reusable Node.js quality / Quality gates" },
    requiredInputs: ["install-command", "preflight-command", "build-command", "test-command", "smoke-command"],
    notApplicableAreas: ["Tipos", "Cobertura", "E2E"]
  },
  "nucleo-preview": {
    label: "Núcleo Preview",
    kind: "static",
    description: "Preview estático validado sin imponer backend ni arquitectura adicional.",
    workflowPath: ".github/workflows/quality.yml",
    reusableWorkflow: ".github/workflows/static-quality.yml",
    requiredQualityCheck: { context: "Reusable static quality / Static quality gates" },
    requiredInputs: ["validation-command"],
    notApplicableAreas: ["Instalación", "Tipos", "Build", "Cobertura", "E2E"]
  }
};

export async function auditRepository({ env = process.env, deps = {} } = {}) {
  const repository = env.AUDIT_REPOSITORY;
  const profileId = env.AUDIT_PROFILE;
  const visibility = env.AUDIT_VISIBILITY || "public";
  const stableSha = env.QUALITY_STANDARD_SHA || "";
  const outputFile = env.OUTPUT_FILE || "quality-report.json";
  const token = env.AUDIT_TOKEN || env.GITHUB_TOKEN || "";

  const profile = profiles[profileId];
  if (!repository || !profileId || !profile) {
    throw new Error("AUDIT_REPOSITORY y AUDIT_PROFILE deben identificar un perfil conocido");
  }

  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "project-quality-quality-dashboard"
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  function apiPath(path) {
    return `${API_ROOT}${path}`;
  }

  function encodePath(path) {
    return path.split("/").map((part) => encodeURIComponent(part)).join("/");
  }

  const fetchImpl = deps.fetch || globalThis.fetch;

  async function request(path) {
    if (deps.request) {
      try {
        return await deps.request(path);
      } catch (error) {
        return {
          ok: false,
          status: 0,
          data: { message: error instanceof Error ? error.message : String(error) }
        };
      }
    }
    try {
      const response = await fetchImpl(apiPath(path), { headers });
      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      return { ok: response.ok, status: response.status, data };
    } catch (error) {
      return { ok: false, status: 0, data: { message: error instanceof Error ? error.message : String(error) } };
    }
  }

  function decodeContent(value) {
    if (!value) return "";
    return Buffer.from(value.replace(/\s/g, ""), "base64").toString("utf8");
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function hasConfiguredInput(workflowText, input) {
    const pattern = new RegExp(`^\\s*${escapeRegExp(input)}\\s*:\\s*(.+)$`, "m");
    const match = workflowText.match(pattern);
    if (!match) return false;
    const value = match[1].trim();
    return value !== "" && value !== "''" && value !== '""';
  }

  function normalizeRunStatus(run) {
    if (!run) return { status: "missing", label: "Sin ejecuciones" };
    if (run.status !== "completed") return { status: "pending", label: run.status || "En curso" };
    if (run.conclusion === "success") return { status: "pass", label: "Correcta" };
    if (["failure", "cancelled", "timed_out", "action_required", "startup_failure"].includes(run.conclusion)) {
      return { status: "fail", label: run.conclusion };
    }
    return { status: "unknown", label: run.conclusion || "Sin conclusión" };
  }

  function addCheck(report, id, label, status, detail, evidenceUrl = null) {
    report.checks.push({ id, label, status, detail, evidenceUrl });
  }

  function addIssue(report, message) {
    if (!report.issues.includes(message)) report.issues.push(message);
  }

  function overallStatus(report) {
    if (report.repository.access === "required") return "warning";
    if (report.checks.some((check) => check.status === "fail")) return "fail";
    if (report.checks.some((check) => ["warning", "unknown", "pending", "missing"].includes(check.status))) return "warning";
    return "pass";
  }

  const displayName = repository.split("/").at(-1);
  let publicUrl = visibility === "private" ? null : `https://github.com/${repository}`;
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    repository: {
      id: profileId,
      name: displayName,
      fullName: repository,
      visibility,
      access: "available",
      defaultBranch: null,
      url: publicUrl,
      headSha: null
    },
    profile: {
      id: profileId,
      label: profile.label,
      kind: profile.kind,
      description: profile.description,
      notApplicableAreas: profile.notApplicableAreas || []
    },
    governance: { ruleset: null },
    workflow: {
      path: profile.workflowPath,
      reusableWorkflow: profile.reusableWorkflow,
      pinnedTo: stableSha || null,
      status: "unknown",
      url: publicUrl ? `${publicUrl}/blob/main/${profile.workflowPath}` : null,
      missingInputs: []
    },
    qualityRun: {
      status: "unknown",
      conclusion: null,
      createdAt: null,
      url: null,
      headSha: null
    },
    qualityEvidence: {
      status: "unavailable",
      message: "Evidencia no disponible.",
      currentCommitSha: null,
      validatedCommitSha: null,
      artifact: null,
      summary: null
    },
    checks: [],
    issues: [],
    overall: "unknown"
  };

  const repoResponse = await request(`/repos/${repository}`);
  if (!repoResponse.ok) {
    report.repository.access = "required";
    report.overall = "warning";
    const message = repoResponse.status === 404
      ? "No hay credenciales de lectura disponibles para auditar este repositorio."
      : `GitHub no pudo leer el repositorio (HTTP ${repoResponse.status || "red"}).`;
    addIssue(report, message);
    addCheck(report, "access", "Acceso al repositorio", "warning", message);
    await writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`);
    return report;
  }

  const repo = repoResponse.data;
  const defaultBranch = typeof repo.default_branch === "string" && repo.default_branch.trim() !== ""
    ? repo.default_branch
    : null;
  report.repository.defaultBranch = defaultBranch;
  const branchRefResponse = defaultBranch
    ? await request(`/repos/${repository}/git/ref/heads/${encodePath(defaultBranch)}`)
    : { ok: false, status: 0, data: null };
  const currentCommitSha = branchRefResponse.ok ? branchRefResponse.data?.object?.sha || null : null;
  report.repository.headSha = currentCommitSha;
  report.repository.visibility = repo.visibility || visibility;
  if (report.repository.visibility === "private") {
    publicUrl = null;
    report.repository.url = null;
    report.workflow.url = null;
  }
  addCheck(
    report,
    "default-branch",
    "Rama estable",
    repo.default_branch === "main" ? "pass" : "fail",
    repo.default_branch === "main" ? "La rama por defecto es main." : `La rama por defecto es ${repo.default_branch || "desconocida"}.`,
    publicUrl ? `${publicUrl}/branches` : null
  );
  if (repo.archived) addIssue(report, "El repositorio está archivado.");

  const rulesetsPath = (page) => `/repos/${repository}/rulesets?includes_parents=true&targets=branch&per_page=100&page=${page}`;
  const rulesetsResponse = await request(rulesetsPath(1));
  const rulesets = {
    status: rulesetsResponse.ok ? "available" : "error",
    details: [],
    incomplete: false
  };
  if (rulesetsResponse.ok && Array.isArray(rulesetsResponse.data)) {
    let page = 1;
    let candidates = rulesetsResponse.data;
    while (true) {
      for (const candidate of candidates) {
        if (candidate.id === undefined || candidate.id === null) {
          rulesets.incomplete = true;
          continue;
        }
        const detailResponse = await request(`/repos/${repository}/rulesets/${candidate.id}`);
        if (!detailResponse.ok) {
          rulesets.incomplete = true;
          continue;
        }
        if (!detailResponse.data || typeof detailResponse.data !== "object" || detailResponse.data.target !== "branch") {
          rulesets.incomplete = true;
          continue;
        }
        rulesets.details.push(detailResponse.data);
      }

      if (candidates.length < 100) break;
      page += 1;
      if (page > 100) {
        rulesets.incomplete = true;
        break;
      }
      const nextResponse = await request(rulesetsPath(page));
      if (!nextResponse.ok || !Array.isArray(nextResponse.data)) {
        rulesets.incomplete = true;
        break;
      }
      candidates = nextResponse.data;
    }
  } else if (rulesetsResponse.ok) {
    rulesets.status = "error";
  }

  const branchProtectionPath = defaultBranch
    ? `/repos/${repository}/branches/${encodePath(defaultBranch)}/protection`
    : null;
  const branchProtectionResponse = branchProtectionPath
    ? await request(branchProtectionPath)
    : { ok: false, status: 0, data: null };
  const branchProtection = {
    status: branchProtectionPath
      ? branchProtectionResponse.ok ? "available" : branchProtectionResponse.status === 404 ? "absent" : "error"
      : "error",
    value: branchProtectionResponse.ok ? branchProtectionResponse.data : null
  };

  if (branchProtection.status === "available" && branchProtection.value && typeof branchProtection.value === "object") {
    const value = branchProtection.value;
    const has = (key) => Object.prototype.hasOwnProperty.call(value, key);
    let enriched = value;

    if (!has("enforce_admins")) {
      const adminsResponse = await request(`${branchProtectionPath}/enforce_admins`);
      if (adminsResponse.ok) enriched = { ...enriched, enforce_admins: adminsResponse.data };
    }
    if (!has("required_status_checks")) {
      const checksResponse = await request(`${branchProtectionPath}/required_status_checks`);
      if (checksResponse.ok) enriched = { ...enriched, required_status_checks: checksResponse.data };
    }

    const reviews = enriched.required_pull_request_reviews;
    if (reviews && typeof reviews === "object" && !Array.isArray(reviews)
      && !Object.prototype.hasOwnProperty.call(reviews, "bypass_pull_request_allowances")) {
      const reviewsResponse = await request(`${branchProtectionPath}/required_pull_request_reviews`);
      if (reviewsResponse.ok && reviewsResponse.data && typeof reviewsResponse.data === "object") {
        enriched = {
          ...enriched,
          required_pull_request_reviews: {
            ...reviews,
            bypass_pull_request_allowances: reviewsResponse.data.bypass_pull_request_allowances
          }
        };
      }
    }
    branchProtection.value = enriched;
  }

  const protection = evaluateMainProtection({
    profile,
    repository: repo,
    defaultBranch,
    rulesets,
    branchProtection
  });
  const rulesetUrl = protection.mechanism === "ruleset" && publicUrl
    ? `${publicUrl}/rules`
    : protection.mechanism === "branch-protection" && publicUrl
      ? `${publicUrl}/settings/branches`
      : null;
  report.governance.ruleset = {
    status: protection.status,
    name: protection.name,
    url: rulesetUrl,
    mechanism: protection.mechanism,
    reason: protection.reason,
    rules: protection.rules
  };
  addCheck(report, "main-protection", "Protección de main", protection.status, protection.reason, rulesetUrl);
  if (protection.status !== "pass") addIssue(report, protection.reason);

  const workflowResponse = defaultBranch
    ? await request(`/repos/${repository}/contents/${encodePath(profile.workflowPath)}?ref=${encodeURIComponent(defaultBranch)}`)
    : { ok: false, status: 0, data: null };
  if (!workflowResponse.ok || !workflowResponse.data?.content) {
    const detail = "No se encontró el workflow de calidad esperado.";
    report.workflow.status = "missing";
    addCheck(report, "quality-workflow", "Workflow de calidad", "missing", detail, report.workflow.url);
    addIssue(report, detail);
  } else {
    const workflowText = decodeContent(workflowResponse.data.content);
    const workflowPattern = new RegExp(`AlexFrigenti/project-quality/${escapeRegExp(profile.reusableWorkflow)}@([0-9a-f]{40})`);
    const match = workflowText.match(workflowPattern);
    const pinned = Boolean(match && stableSha && match[1] === stableSha);
    const missingInputs = profile.requiredInputs.filter((input) => !hasConfiguredInput(workflowText, input));
    report.workflow.missingInputs = missingInputs;
    report.workflow.pinnedTo = match?.[1] || null;
    report.workflow.status = pinned && missingInputs.length === 0 ? "pass" : "fail";
    const detail = pinned
      ? (missingInputs.length === 0 ? `Consume el workflow reutilizable fijado en ${stableSha.slice(0, 12)}….` : `Falta configurar: ${missingInputs.join(", ")}.`)
      : "El workflow no consume la versión estable fijada del estándar.";
    addCheck(report, "quality-workflow", "Workflow de calidad", report.workflow.status, detail, report.workflow.url);
    if (report.workflow.status === "fail") addIssue(report, detail);
  }

  const workflowFile = profile.workflowPath.split("/").at(-1);
  const qualityEvidence = await collectQualityEvidence({
    repository,
    defaultBranch,
    currentCommitSha,
    workflowFile,
    exposeLinks: report.repository.visibility !== "private",
    deps: {
      fetch: request,
      ...(deps.readArtifact ? { readArtifact: deps.readArtifact } : {})
    }
  });
  report.qualityEvidence = qualityEvidence;

  if (qualityEvidence.status === "current" && qualityEvidence.summary) {
    const conclusion = qualityEvidence.summary.conclusion;
    const status = conclusion === "passed" ? "pass" : conclusion === "failed" ? "fail" : "unknown";
    const run = qualityEvidence.summary.run;
    const detail = "Evidencia correspondiente al commit " + qualityEvidence.validatedCommitSha.slice(0, 12) + "…. Conclusión: " + conclusion + ".";
    report.qualityRun = {
      status,
      conclusion,
      createdAt: run.completedAt,
      url: publicUrl ? run.url : null,
      headSha: qualityEvidence.validatedCommitSha
    };
    addCheck(report, "latest-quality-run", "Última validación", status, detail, publicUrl ? run.url : null);
    if (status === "fail") addIssue(report, "La evidencia de calidad del commit actual contiene gates fallidos.");
    if (status === "unknown") addIssue(report, "La evidencia de calidad del commit actual no tiene una conclusión determinista.");
  } else {
    const status = qualityEvidence.status === "pending" ? "pending" : "unknown";
    report.qualityRun = {
      status,
      conclusion: null,
      createdAt: null,
      url: null,
      headSha: null
    };
    addCheck(report, "latest-quality-run", "Última validación", status, qualityEvidence.message);
    if (qualityEvidence.status === "unavailable") addIssue(report, qualityEvidence.message);
  }

  report.overall = overallStatus(report);
  await writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (entrypoint === import.meta.url) {
  try {
    await auditRepository();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
