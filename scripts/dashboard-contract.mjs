const ALLOWED_STATUSES = new Set(["pass", "warning", "fail", "unknown", "pending", "missing", "not_applicable"]);
const QUALITY_EVIDENCE_STATUSES = new Set(["current", "pending", "unavailable"]);
const QUALITY_GATE_STATUSES = new Set(["passed", "failed", "skipped", "not-applicable", "unknown"]);
const QUALITY_APPLICABILITIES = new Set(["required", "optional", "not-applicable"]);
const QUALITY_EVIDENCE_KINDS = new Set(["workflow-run", "workflow-step", "artifact", "repository"]);
const EXPECTED_REPOSITORY_IDS = new Set(["gestor-autonomo", "nexo", "nucleo", "nucleo-preview"]);
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/i;
const TOKEN_PATTERN = /(gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|Bearer\s+[A-Za-z0-9._-]+)/i;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function object(value, path) {
  assert(isObject(value), path + " debe ser un objeto");
}

function text(value, path, maxLength = 1000) {
  assert(typeof value === "string" && value.trim() !== "", path + " debe ser texto no vacío");
  assert(value.length <= maxLength, path + " supera el límite de longitud");
}

function nullableText(value, path, maxLength = 1000) {
  if (value !== null && value !== undefined) text(value, path, maxLength);
}

function sha(value, path) {
  assert(typeof value === "string" && SHA_PATTERN.test(value), path + " debe ser un SHA hexadecimal de 40 caracteres");
}

function nullableSha(value, path) {
  if (value !== null && value !== undefined) sha(value, path);
}

function date(value, path) {
  text(value, path);
  assert(!Number.isNaN(Date.parse(value)), path + " debe ser una fecha ISO válida");
}

function nullableDate(value, path) {
  if (value !== null && value !== undefined) date(value, path);
}

function url(value, path) {
  text(value, path, 2000);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(path + " debe ser una URL válida");
  }
  assert(["http:", "https:"].includes(parsed.protocol), path + " debe usar HTTP o HTTPS");
}

function nullableUrl(value, path) {
  if (value !== null && value !== undefined) url(value, path);
}

function array(value, path) {
  assert(Array.isArray(value), path + " debe ser un array");
}

function requiredArray(value, path) {
  array(value, path);
  assert(value.length > 0, path + " no puede estar vacío");
}

function uniqueIds(values, path) {
  const ids = new Set();
  values.forEach((value, index) => {
    text(value, path + "[" + index + "]", 80);
    assert(ID_PATTERN.test(value), path + "[" + index + "] no es un identificador válido");
    assert(!ids.has(value), "Identificador duplicado en " + path + ": " + value);
    ids.add(value);
  });
  return ids;
}

function metricValue(value, path, context = { count: 0, depth: 0 }) {
  context.count += 1;
  assert(context.count <= 100, "Demasiados valores métricos en " + path);

  if (typeof value === "number") {
    assert(Number.isFinite(value) && value >= 0, path + " debe ser un número no negativo");
    return;
  }

  object(value, path);
  context.depth += 1;
  assert(context.depth <= 6, path + " está demasiado anidada");
  const entries = Object.entries(value);
  assert(entries.length > 0, path + " no puede estar vacío");
  for (const [key, child] of entries) {
    assert(/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(key), path + "." + key + " no es un nombre de métrica válido");
    metricValue(child, path + "." + key, context);
  }
  context.depth -= 1;
}

function validateMetrics(value, path) {
  object(value, path);
  const context = { count: 0, depth: 0 };
  for (const [key, child] of Object.entries(value)) {
    assert(/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(key), path + "." + key + " no es un nombre de métrica válido");
    metricValue(child, path + "." + key, context);
  }
}

function validateEvidenceItem(value, path, { exposeUrl }) {
  object(value, path);
  text(value.kind, path + ".kind", 80);
  assert(QUALITY_EVIDENCE_KINDS.has(value.kind), path + ".kind no es válido");
  text(value.label, path + ".label", 160);
  if (exposeUrl) {
    assert(Object.prototype.hasOwnProperty.call(value, "url"), path + ".url es obligatorio en un informe público");
    url(value.url, path + ".url");
  } else if (Object.prototype.hasOwnProperty.call(value, "url")) {
    if (value.url !== null) throw new Error("Una evidencia privada contiene una URL.");
  }
}

function validateEvidenceList(value, path, options) {
  requiredArray(value, path);
  value.forEach((item, index) => validateEvidenceItem(item, path + "[" + index + "]", options));
}

function validateQualityGate(value, path, options) {
  object(value, path);
  text(value.id, path + ".id", 80);
  assert(ID_PATTERN.test(value.id), path + ".id no es válido");
  text(value.label, path + ".label", 160);
  assert(QUALITY_APPLICABILITIES.has(value.applicability), path + ".applicability no es válida");
  assert(QUALITY_GATE_STATUSES.has(value.status), path + ".status no es válido");
  if (value.applicability === "not-applicable") {
    assert(value.status === "not-applicable", path + " debe usar status not-applicable cuando no aplica");
  } else {
    assert(value.status !== "not-applicable", path + " no puede usar status not-applicable si aplica");
  }
  text(value.details, path + ".details", 400);
  validateEvidenceList(value.evidence, path + ".evidence", options);
}

function validateQualitySummary(summary, path, context) {
  object(summary, path);
  assert(["passed", "failed", "unknown"].includes(summary.conclusion), path + ".conclusion no es válida");

  object(summary.commit, path + ".commit");
  sha(summary.commit.sha, path + ".commit.sha");
  text(summary.commit.ref, path + ".commit.ref", 500);
  text(summary.commit.branch, path + ".commit.branch", 200);
  text(summary.commit.event, path + ".commit.event", 120);

  object(summary.run, path + ".run");
  text(summary.run.workflow, path + ".run.workflow", 160);
  assert(Number.isInteger(summary.run.id) && summary.run.id >= 1, path + ".run.id no es válido");
  assert(Number.isInteger(summary.run.attempt) && summary.run.attempt >= 1, path + ".run.attempt no es válido");
  date(summary.run.startedAt, path + ".run.startedAt");
  date(summary.run.completedAt, path + ".run.completedAt");

  const isPrivate = context.repository.visibility === "private";
  if (isPrivate) {
    if (Object.prototype.hasOwnProperty.call(summary.run, "url") && summary.run.url !== null) {
      throw new Error("Una ejecución privada contiene una URL.");
    }
  } else {
    assert(Object.prototype.hasOwnProperty.call(summary.run, "url"), path + ".run.url es obligatorio en un informe público");
    url(summary.run.url, path + ".run.url");
  }

  object(summary.standard, path + ".standard");
  text(summary.standard.version, path + ".standard.version", 120);
  sha(summary.standard.sha, path + ".standard.sha");
  assert(summary.standard.sha === context.sourceStandardSha, path + ".standard.sha no coincide con source.standardSha");
  assert(summary.standard.version === context.sourceStandardRelease, path + ".standard.version no coincide con source.standardRelease");

  requiredArray(summary.gates, path + ".gates");
  summary.gates.forEach((gate, index) => validateQualityGate(gate, path + ".gates[" + index + "]", { exposeUrl: !isPrivate }));
  validateMetrics(summary.metrics, path + ".metrics");

  if (isPrivate) {
    if (Object.prototype.hasOwnProperty.call(summary, "evidence")) {
      throw new Error("Un informe privado contiene referencias de evidencia.");
    }
  } else {
    validateEvidenceList(summary.evidence, path + ".evidence", { exposeUrl: true });
  }

  if (context.repository.defaultBranch !== null) {
    assert(summary.commit.branch === context.repository.defaultBranch, path + ".commit.branch no coincide con la rama estable");
  }
  assert(summary.commit.sha === context.evidence.validatedCommitSha, path + ".commit.sha no coincide con validatedCommitSha");

  const requiredGates = summary.gates.filter((gate) => gate.applicability === "required");
  const expectedConclusion = requiredGates.some((gate) => gate.status === "failed")
    ? "failed"
    : requiredGates.some((gate) => ["unknown", "skipped"].includes(gate.status))
      ? "unknown"
      : "passed";
  assert(summary.conclusion === expectedConclusion, path + ".conclusion no coincide con los gates requeridos");

  return {
    conclusion: summary.conclusion,
    completedAt: summary.run.completedAt,
    runUrl: isPrivate ? null : summary.run.url
  };
}

function validateArtifact(value, path) {
  object(value, path);
  assert(Number.isInteger(value.id) && value.id >= 1, path + ".id no es válido");
  text(value.name, path + ".name", 160);
  nullableDate(value.createdAt, path + ".createdAt");
  nullableDate(value.expiresAt, path + ".expiresAt");
}

function validateQualityEvidence(report, path, source) {
  const evidence = report.qualityEvidence;
  object(evidence, path);
  assert(QUALITY_EVIDENCE_STATUSES.has(evidence.status), path + ".status no es válido");
  assert(typeof evidence.message === "string" && evidence.message.trim() !== "", "Falta el mensaje de evidencia en " + path);
  assert(evidence.message.length <= 240, path + ".message supera el límite de longitud");
  nullableSha(evidence.currentCommitSha, path + ".currentCommitSha");

  if (evidence.status === "current") {
    sha(evidence.currentCommitSha, path + ".currentCommitSha");
    sha(evidence.validatedCommitSha, path + ".validatedCommitSha");
    assert(evidence.validatedCommitSha === evidence.currentCommitSha, path + ".validatedCommitSha no coincide con currentCommitSha");
    assert(report.repository.headSha === evidence.currentCommitSha, path + ".currentCommitSha no coincide con repository.headSha");
    validateArtifact(evidence.artifact, path + ".artifact");
    assert(isObject(evidence.summary), path + ".summary es obligatorio para evidencia current");
    return validateQualitySummary(evidence.summary, path + ".summary", {
      repository: report.repository,
      qualityEvidence: evidence,
      evidence,
      sourceStandardSha: source.standardSha,
      sourceStandardRelease: source.standardRelease
    });
  }

  assert(evidence.validatedCommitSha === null, path + ".validatedCommitSha debe ser null si la evidencia no es current");
  assert(evidence.artifact === null, path + ".artifact debe ser null si la evidencia no es current");
  assert(evidence.summary === null, path + ".summary debe ser null si la evidencia no es current");
  return null;
}

function validateRepository(report, path) {
  object(report.repository, path + ".repository");
  const repository = report.repository;
  text(repository.id, path + ".repository.id", 80);
  assert(ID_PATTERN.test(repository.id), path + ".repository.id no es válido");
  text(repository.name, path + ".repository.name", 160);
  text(repository.fullName, path + ".repository.fullName", 240);
  assert(/^[^/]+\/[^/]+$/.test(repository.fullName), path + ".repository.fullName no es válido");
  assert(["public", "private"].includes(repository.visibility), path + ".repository.visibility no es válida");
  assert(["available", "required"].includes(repository.access), path + ".repository.access no es válido");
  if (repository.defaultBranch === null) {
    assert(repository.access === "required", path + ".repository.defaultBranch no puede ser null con acceso disponible");
  } else {
    text(repository.defaultBranch, path + ".repository.defaultBranch", 200);
  }
  nullableSha(repository.headSha, path + ".repository.headSha");
  if (repository.visibility === "private") {
    if (Object.prototype.hasOwnProperty.call(repository, "url")) assert(repository.url === null, "Un repositorio privado no puede contener una URL.");
  } else {
    assert(Object.prototype.hasOwnProperty.call(repository, "url"), path + ".repository.url es obligatorio en un informe público");
    url(repository.url, path + ".repository.url");
  }
}

function validateProfile(report, path) {
  object(report.profile, path + ".profile");
  const profile = report.profile;
  text(profile.id, path + ".profile.id", 80);
  assert(profile.id === report.repository.id, path + ".profile.id no coincide con repository.id");
  text(profile.label, path + ".profile.label", 160);
  assert(["node", "static"].includes(profile.kind), path + ".profile.kind no es válido");
  text(profile.description, path + ".profile.description", 400);
  array(profile.notApplicableAreas, path + ".profile.notApplicableAreas");
  profile.notApplicableAreas.forEach((area, index) => text(area, path + ".profile.notApplicableAreas[" + index + "]", 120));
}

function validateGovernance(report, path) {
  const ruleset = report.governance?.ruleset;
  if (report.repository.access === "required") {
    assert(ruleset === null, path + ".ruleset debe ser null cuando se requiere acceso");
    return;
  }
  object(ruleset, path + ".ruleset");
  assert(ALLOWED_STATUSES.has(ruleset.status), path + ".ruleset.status no es válido");
  if (ruleset.mechanism !== null) assert(["ruleset", "branch-protection"].includes(ruleset.mechanism), path + ".ruleset.mechanism no es válido");
  nullableText(ruleset.name, path + ".ruleset.name", 240);
  text(ruleset.reason, path + ".ruleset.reason", 500);
  array(ruleset.rules, path + ".ruleset.rules");
  ruleset.rules.forEach((rule, index) => text(rule, path + ".ruleset.rules[" + index + "]", 120));
  nullableUrl(ruleset.url, path + ".ruleset.url");
  if (ruleset.status === "pass") {
    assert(["ruleset", "branch-protection"].includes(ruleset.mechanism), path + ".ruleset.mechanism es obligatorio cuando status es pass");
  }
}

function validateWorkflow(report, path) {
  const workflow = report.workflow;
  object(workflow, path);
  text(workflow.path, path + ".path", 240);
  text(workflow.reusableWorkflow, path + ".reusableWorkflow", 240);
  nullableSha(workflow.pinnedTo, path + ".pinnedTo");
  assert(ALLOWED_STATUSES.has(workflow.status), path + ".status no es válido");
  nullableUrl(workflow.url, path + ".url");
  array(workflow.missingInputs, path + ".missingInputs");
  workflow.missingInputs.forEach((input, index) => text(input, path + ".missingInputs[" + index + "]", 120));
  if (workflow.status === "pass") {
    sha(workflow.pinnedTo, path + ".pinnedTo");
    assert(workflow.missingInputs.length === 0, path + ".missingInputs debe estar vacío cuando status es pass");
  }
}

function validateQualityRun(report, path) {
  const run = report.qualityRun;
  object(run, path);
  assert(ALLOWED_STATUSES.has(run.status), path + ".status no es válido");
  if (run.conclusion !== null) assert(["passed", "failed", "unknown"].includes(run.conclusion), path + ".conclusion no es válida");
  nullableDate(run.createdAt, path + ".createdAt");
  nullableUrl(run.url, path + ".url");
  nullableSha(run.headSha, path + ".headSha");
  if (run.status === "pass") {
    assert(run.conclusion === "passed", path + ".conclusion debe ser passed cuando status es pass");
    date(run.createdAt, path + ".createdAt");
    sha(run.headSha, path + ".headSha");
  }
}

function validateChecks(report, path) {
  array(report.checks, path);
  const checks = new Map();
  report.checks.forEach((check, index) => {
    const checkPath = path + "[" + index + "]";
    object(check, checkPath);
    text(check.id, checkPath + ".id", 80);
    assert(ID_PATTERN.test(check.id), checkPath + ".id no es válido");
    assert(!checks.has(check.id), "Check duplicado en " + path + ": " + check.id);
    text(check.label, checkPath + ".label", 160);
    assert(ALLOWED_STATUSES.has(check.status), checkPath + ".status no es válido");
    text(check.detail, checkPath + ".detail", 500);
    if (Object.prototype.hasOwnProperty.call(check, "evidenceUrl")) nullableUrl(check.evidenceUrl, checkPath + ".evidenceUrl");
    if (report.repository.visibility === "private" && Object.prototype.hasOwnProperty.call(check, "evidenceUrl")) {
      assert(check.evidenceUrl === null, "Un check privado no puede contener una URL de evidencia.");
    }
    checks.set(check.id, check);
  });
  return checks;
}

function validateIssues(report, path) {
  array(report.issues, path);
  report.issues.forEach((issue, index) => text(issue, path + "[" + index + "]", 500));
}

function expectedOverall(report) {
  if (report.repository.access === "required") return "warning";
  if (report.checks.some((check) => check.status === "fail") || report.qualityRun?.status === "fail") return "fail";
  if (report.checks.some((check) => ["warning", "unknown", "pending", "missing"].includes(check.status))
    || ["warning", "unknown", "pending", "missing"].includes(report.qualityRun?.status)) return "warning";
  return "pass";
}

function validateCoherence(report, checks, evidenceProjection, path) {
  assert(ALLOWED_STATUSES.has(report.overall), "Estado general inválido en " + report.repository.id);
  const ruleset = report.governance.ruleset;
  const mainProtection = checks.get("main-protection");
  if (mainProtection) {
    assert(ruleset !== null, path + ".checks[main-protection] no puede existir sin governance.ruleset");
    assert(mainProtection.status === ruleset.status, path + ".checks[main-protection].status no coincide con governance.ruleset.status");
  }

  const qualityWorkflow = checks.get("quality-workflow");
  if (qualityWorkflow) {
    assert(qualityWorkflow.status === report.workflow.status, path + ".checks[quality-workflow].status no coincide con workflow.status");
  }

  const latestQualityRun = checks.get("latest-quality-run");
  if (latestQualityRun) {
    const expectedStatus = evidenceProjection ? (evidenceProjection.conclusion === "passed" ? "pass" : evidenceProjection.conclusion === "failed" ? "fail" : "unknown") : report.qualityEvidence.status === "pending" ? "pending" : "unknown";
    assert(latestQualityRun.status === expectedStatus, path + ".checks[latest-quality-run].status no coincide con qualityEvidence");
  }

  if (evidenceProjection) {
    const expectedStatus = evidenceProjection.conclusion === "passed" ? "pass" : evidenceProjection.conclusion === "failed" ? "fail" : "unknown";
    assert(report.qualityRun.status === expectedStatus, path + ".qualityRun.status no coincide con qualityEvidence.summary.conclusion");
    assert(report.qualityRun.conclusion === evidenceProjection.conclusion, path + ".qualityRun.conclusion no coincide con qualityEvidence.summary.conclusion");
    assert(report.qualityRun.createdAt === evidenceProjection.completedAt, path + ".qualityRun.createdAt no coincide con qualityEvidence.summary.run.completedAt");
    assert(report.qualityRun.headSha === report.qualityEvidence.validatedCommitSha, path + ".qualityRun.headSha no coincide con validatedCommitSha");
    if (report.repository.visibility === "private") {
      if (Object.prototype.hasOwnProperty.call(report.qualityRun, "url")) {
        assert(report.qualityRun.url === null, path + ".qualityRun.url debe ser null en un informe privado");
      }
    } else {
      assert(report.qualityRun.url === evidenceProjection.runUrl, path + ".qualityRun.url no coincide con qualityEvidence.summary.run.url");
    }
  } else {
    const expectedStatus = report.qualityEvidence.status === "pending" ? "pending" : "unknown";
    assert(report.qualityRun.status === expectedStatus, path + ".qualityRun.status no coincide con el estado de evidencia");
    assert(report.qualityRun.conclusion === null, path + ".qualityRun.conclusion debe ser null sin evidencia current");
    assert(report.qualityRun.createdAt === null, path + ".qualityRun.createdAt debe ser null sin evidencia current");
    if (Object.prototype.hasOwnProperty.call(report.qualityRun, "url")) {
      assert(report.qualityRun.url === null, path + ".qualityRun.url debe ser null sin evidencia current");
    }
    assert(report.qualityRun.headSha === null, path + ".qualityRun.headSha debe ser null sin evidencia current");
    assert(report.overall !== "pass", path + ".overall no puede ser pass sin evidencia current");
  }

  assert(report.overall === expectedOverall(report), path + ".overall no coincide con los checks y el acceso");
}

function rejectPrivateUrls(value, path = "dashboard", seen = new Set()) {
  if (typeof value === "string") {
    if (URL_PATTERN.test(value)) throw new Error("Un informe privado contiene una URL en " + path + ".");
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) throw new Error(path + " contiene una referencia circular");
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((child, index) => rejectPrivateUrls(child, path + "[" + index + "]", seen));
  } else {
    for (const [key, child] of Object.entries(value)) rejectPrivateUrls(child, path + "." + key, seen);
  }
  seen.delete(value);
}

function rejectTokens(value) {
  const serialized = JSON.stringify(value);
  if (TOKEN_PATTERN.test(serialized)) throw new Error("El dashboard contiene un patrón que parece un token");
}

export const FRESHNESS_MAX_AGE_HOURS = 192;

export function computeFreshness(generatedAt, now = new Date(), maxAgeHours = FRESHNESS_MAX_AGE_HOURS) {
  if (!Number.isInteger(maxAgeHours) || maxAgeHours <= 0) return "unknown";
  if (typeof generatedAt !== "string" || generatedAt.trim() === "") return "unknown";
  const generatedMs = Date.parse(generatedAt);
  if (Number.isNaN(generatedMs)) return "unknown";
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) return "unknown";
  const ageMs = now.getTime() - generatedMs;
  if (ageMs < 0) return "unknown";
  return ageMs <= maxAgeHours * 3600000 ? "fresh" : "stale";
}

function validateFreshness(value) {
  object(value, "freshness");
  const keys = Object.keys(value);
  assert(keys.length === 1 && keys[0] === "maxAgeHours", "freshness solo puede contener maxAgeHours");
  assert(
    Number.isInteger(value.maxAgeHours) && value.maxAgeHours > 0,
    "freshness.maxAgeHours debe ser un entero positivo (horas)"
  );
}

export function buildDashboardSummary(repositories) {  const count = (predicate) => repositories.filter(predicate).length;
  return {
    total: repositories.length,
    pass: count((report) => report.overall === "pass"),
    warning: count((report) => report.overall === "warning"),
    fail: count((report) => report.overall === "fail"),
    protectedMain: count((report) => report.governance?.ruleset?.status === "pass"),
    pinnedWorkflows: count((report) => report.workflow?.status === "pass"),
    qualityGreen: count((report) => report.qualityRun?.status === "pass"),
    qualityCurrent: count((report) => report.qualityEvidence?.status === "current"),
    qualityPending: count((report) => report.qualityEvidence?.status === "pending"),
    accessRequired: count((report) => report.repository?.access === "required")
  };
}

export function validateDashboard(value) {
  object(value, "dashboard");
  assert(value.schemaVersion === 1, "schemaVersion debe ser 1");
  date(value.generatedAt, "generatedAt");
  assert(Object.prototype.hasOwnProperty.call(value, "freshness"), "freshness es obligatorio en el dashboard");
  validateFreshness(value.freshness);
  object(value.source, "source");
  text(value.source.repository, "source.repository", 240);
  assert(/^[^/]+\/[^/]+$/.test(value.source.repository), "source.repository no es válido");
  assert(value.source.repository === "AlexFrigenti/project-quality", "source.repository no identifica el dashboard");
  sha(value.source.commit, "source.commit");
  text(value.source.standardRelease, "source.standardRelease", 120);
  sha(value.source.standardSha, "source.standardSha");

  requiredArray(value.repositories, "repositories");
  assert(value.repositories.length === EXPECTED_REPOSITORY_IDS.size, "El dashboard debe contener exactamente cuatro repositorios");
  const ids = uniqueIds(value.repositories.map((report) => report?.repository?.id), "repositories[].repository.id");
  assert(ids.size === EXPECTED_REPOSITORY_IDS.size && [...EXPECTED_REPOSITORY_IDS].every((id) => ids.has(id)), "Los repositorios auditados no coinciden con el conjunto esperado");

  const reports = value.repositories.map((report, index) => {
    const path = "repositories[" + index + "]";
    object(report, path);
    validateRepository(report, path);
    validateProfile(report, path);
    validateGovernance(report, path + ".governance");
    validateWorkflow(report, path + ".workflow");
    validateQualityRun(report, path + ".qualityRun");
    const checks = validateChecks(report, path + ".checks");
    validateIssues(report, path + ".issues");
    const evidenceProjection = validateQualityEvidence(report, path + ".qualityEvidence", value.source);
    validateCoherence(report, checks, evidenceProjection, path);

    if (report.repository.visibility === "private") {
      if (Object.prototype.hasOwnProperty.call(report.repository, "url") && report.repository.url !== null) {
        throw new Error("Un repositorio privado no puede contener una URL.");
      }
      if (Object.prototype.hasOwnProperty.call(report.workflow, "url") && report.workflow.url !== null) {
        throw new Error("Un workflow privado no puede contener una URL.");
      }
      if (isObject(report.governance.ruleset)
        && Object.prototype.hasOwnProperty.call(report.governance.ruleset, "url")
        && report.governance.ruleset.url !== null) {
        throw new Error("Un ruleset privado no puede contener una URL.");
      }
      if (Object.prototype.hasOwnProperty.call(report.qualityRun, "url") && report.qualityRun.url !== null) {
        throw new Error("Una ejecución privada contiene una URL.");
      }
      rejectPrivateUrls(report, path);
    }
    return report;
  });

  object(value.summary, "summary");
  const recomputed = buildDashboardSummary(reports);
  const expectedKeys = Object.keys(recomputed);
  const declaredKeys = Object.keys(value.summary);
  assert(
    declaredKeys.length === expectedKeys.length && expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value.summary, key)),
    "summary contiene agregados desconocidos o incompletos"
  );
  for (const key of Object.keys(recomputed)) {
    assert(Number.isInteger(value.summary[key]) && value.summary[key] >= 0, "Métrica inválida: " + key);
    assert(value.summary[key] === recomputed[key], "La métrica " + key + " no coincide");
  }

  rejectTokens(value);
  return true;
}
