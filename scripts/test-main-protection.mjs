import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { auditRepository } from "./audit-repository.mjs";
import { evaluateMainProtection } from "./main-protection.mjs";

const NODE_CONTEXT = "Reusable Node.js quality / Quality gates";
const STATIC_CONTEXT = "Reusable static quality / Static quality gates";

const nodeProfile = { requiredQualityCheck: { context: NODE_CONTEXT } };
const staticProfile = { requiredQualityCheck: { context: STATIC_CONTEXT } };
const repository = {
  full_name: "AlexFrigenti/Nucleo",
  default_branch: "main",
  allow_merge_commit: true,
  allow_squash_merge: false,
  allow_rebase_merge: false
};
const stableSha = "0123456789abcdef0123456789abcdef01234567";

const validRuleset = {
  id: 1,
  name: "Protect main",
  target: "branch",
  enforcement: "active",
  conditions: {
    ref_name: {
      include: ["~DEFAULT_BRANCH"],
      exclude: []
    }
  },
  rules: [
    { type: "deletion" },
    { type: "non_fast_forward" },
    {
      type: "pull_request",
      parameters: { allowed_merge_methods: ["merge"] }
    },
    {
      type: "required_status_checks",
      parameters: {
        required_status_checks: [{ context: NODE_CONTEXT, integration_id: 15368 }]
      }
    }
  ],
  bypass_actors: []
};

const validBranchProtection = {
  required_status_checks: {
    contexts: [],
    checks: [{ context: NODE_CONTEXT, app_id: 15368 }]
  },
  enforce_admins: { enabled: true },
  required_pull_request_reviews: {
    required_approving_review_count: 0,
    bypass_pull_request_allowances: { users: [], teams: [], apps: [] }
  },
  allow_force_pushes: { enabled: false },
  allow_deletions: { enabled: false },
  required_linear_history: { enabled: false }
};

function rulesetEvaluation(mutator = () => {}, { profile = nodeProfile, details = null, status = "available", defaultBranch = "main" } = {}) {
  const fixture = structuredClone(validRuleset);
  mutator(fixture);
  return evaluateMainProtection({
    profile,
    repository,
    defaultBranch,
    rulesets: { status, details: details || [fixture] },
    branchProtection: { status: "absent", value: null }
  });
}

function branchEvaluation(mutator = () => {}, { profile = nodeProfile, repositoryOverrides = {} } = {}) {
  const fixture = structuredClone(validBranchProtection);
  mutator(fixture);
  return evaluateMainProtection({
    profile,
    repository: { ...repository, ...repositoryOverrides },
    defaultBranch: "main",
    rulesets: { status: "available", details: [] },
    branchProtection: { status: "available", value: fixture }
  });
}

function makeAuditRequest({ ruleset, rulesetsStatus = "available", branchProtection = null }) {
  const workflowText = [
    "name: Quality",
    "jobs:",
    "  quality:",
    `    uses: AlexFrigenti/project-quality/.github/workflows/node-quality.yml@${stableSha}`,
    "    with:",
    "      standard-version: v1.1.0",
    `      standard-sha: ${stableSha}`,
    "      install-command: npm ci",
    "      preflight-command: npm run preflight",
    "      build-command: npm run build",
    "      test-command: npm test",
    "      smoke-command: npm run smoke"
  ].join("\n");

  return async (path) => {
    if (path === "/repos/AlexFrigenti/Nucleo") {
      return {
        ok: true,
        status: 200,
        data: {
          default_branch: "main",
          visibility: "public",
          archived: false,
          ...(branchProtection ? {
            allow_merge_commit: true,
            allow_squash_merge: false,
            allow_rebase_merge: false
          } : {})
        }
      };
    }
    if (path === "/repos/AlexFrigenti/Nucleo/git/ref/heads/main") {
      return { ok: true, status: 200, data: { object: { sha: stableSha } } };
    }
    if (path === "/repos/AlexFrigenti/Nucleo/rulesets?includes_parents=true&targets=branch&per_page=100&page=1") {
      if (rulesetsStatus === "available") return { ok: true, status: 200, data: [{ id: 1 }] };
      if (rulesetsStatus === "empty") return { ok: true, status: 200, data: [] };
      if (rulesetsStatus === "paginated") return { ok: true, status: 200, data: Array.from({ length: 100 }, (_, index) => ({ id: index + 1 })) };
      if (rulesetsStatus === "not-found") return { ok: false, status: 404, data: { message: "rulesets unavailable in fixture" } };
      return { ok: false, status: 500, data: { message: "fixture error" } };
    }
    if (path === "/repos/AlexFrigenti/Nucleo/rulesets?includes_parents=true&targets=branch&per_page=100&page=2") {
      return rulesetsStatus === "paginated"
        ? { ok: true, status: 200, data: [] }
        : { ok: false, status: 404, data: { message: "unexpected pagination request" } };
    }
    const detailMatch = path.match(/^\/repos\/AlexFrigenti\/Nucleo\/rulesets\/(\d+)$/);
    if (detailMatch) {
      return { ok: true, status: 200, data: { ...structuredClone(ruleset), id: Number(detailMatch[1]) } };
    }
    if (path === "/repos/AlexFrigenti/Nucleo/branches/main/protection") {
      return branchProtection
        ? { ok: true, status: 200, data: branchProtection }
        : { ok: false, status: 404, data: { message: "no classic protection in fixture" } };
    }
    if (path === "/repos/AlexFrigenti/Nucleo/contents/.github/workflows/quality.yml?ref=main") {
      return { ok: true, status: 200, data: { content: Buffer.from(workflowText).toString("base64") } };
    }
    if (path === "/repos/AlexFrigenti/Nucleo/actions/workflows/quality.yml/runs?branch=main&per_page=50") {
      return { ok: true, status: 200, data: { workflow_runs: [] } };
    }
    throw new Error("Ruta de fixture no esperada: " + path);
  };
}

async function auditFixture({ ruleset, rulesetsStatus = "available", branchProtection = null }) {
  const directory = await mkdtemp(join(tmpdir(), "test-main-protection-audit-"));
  try {
    return await auditRepository({
      env: {
        AUDIT_REPOSITORY: "AlexFrigenti/Nucleo",
        AUDIT_PROFILE: "nucleo",
        AUDIT_VISIBILITY: "public",
        QUALITY_STANDARD_SHA: stableSha,
        OUTPUT_FILE: join(directory, "quality-report.json")
      },
      deps: { request: makeAuditRequest({ ruleset, rulesetsStatus, branchProtection }) }
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

console.log("Iniciando pruebas contractuales de main protection...");

// Ruleset válido: la garantía agregada debe resultar demostrable.
{
  const result = rulesetEvaluation();
  assert.equal(result.status, "pass");
  assert.equal(result.mechanism, "ruleset");
}

// Reproducción del falso positivo: PR, borrado y force push no bastan sin el gate.
{
  const result = rulesetEvaluation((ruleset) => {
    ruleset.rules = ruleset.rules.filter((rule) => rule.type !== "required_status_checks");
  });
  assert.notEqual(result.status, "pass");
}

// Un check requerido sin PR obligatorio tampoco protege el flujo aprobado.
{
  const result = rulesetEvaluation((ruleset) => {
    ruleset.rules = ruleset.rules.filter((rule) => rule.type !== "pull_request");
  });
  assert.notEqual(result.status, "pass");
}

// Un ruleset desactivado no bloquea merges.
{
  const result = rulesetEvaluation((ruleset) => {
    ruleset.enforcement = "disabled";
  });
  assert.notEqual(result.status, "pass");
}

// Una condición que no incluye main no puede demostrar protección de main.
{
  const result = rulesetEvaluation((ruleset) => {
    ruleset.conditions.ref_name.include = ["refs/heads/release"];
  });
  assert.notEqual(result.status, "pass");
}

// Una condición wildcard que incluye main sí es aplicable.
{
  const result = rulesetEvaluation((ruleset) => {
    ruleset.conditions.ref_name.include = ["refs/heads/*"];
  });
  assert.equal(result.status, "pass");
}

// Una rama por defecto distinta de main no satisface el contrato de este dashboard.
{
  const result = rulesetEvaluation(() => {}, { defaultBranch: "trunk" });
  assert.equal(result.status, "fail");
}

// Los conjuntos de caracteres de fnmatch también se evalúan contra la referencia completa.
{
  const result = rulesetEvaluation((ruleset) => {
    ruleset.conditions.ref_name.include = ["refs/heads/[mb]ain"];
  });
  assert.equal(result.status, "pass");
}

// Una sintaxis fnmatch no soportada conserva la incertidumbre en vez de ignorar el ruleset.
{
  const result = rulesetEvaluation((ruleset) => {
    ruleset.conditions.ref_name.include = ["refs/heads/\\main"];
  });
  assert.equal(result.status, "unknown");
}

// Un required check distinto del gate agregado no satisface el contrato del perfil.
{
  const result = rulesetEvaluation((ruleset) => {
    ruleset.rules.find((rule) => rule.type === "required_status_checks").parameters.required_status_checks[0].context = "lint";
  });
  assert.notEqual(result.status, "pass");
}

// Cualquier actor configurado para saltarse las reglas es un bypass relevante.
{
  const result = rulesetEvaluation((ruleset) => {
    ruleset.bypass_actors = [{ actor_type: "RepositoryRole", actor_id: null, bypass_mode: "pull_request" }];
  });
  assert.notEqual(result.status, "pass");
}

// Si el API no demuestra la ausencia de bypasses, el resultado no puede ser verde.
{
  const result = rulesetEvaluation((ruleset) => {
    delete ruleset.bypass_actors;
  });
  assert.equal(result.status, "unknown");
}

// Un valor nulo de bypass no prueba que la lista esté vacía.
{
  const result = rulesetEvaluation((ruleset) => {
    ruleset.bypass_actors = null;
  });
  assert.equal(result.status, "unknown");
}

// Un detalle que no se pudo recuperar conserva la incertidumbre.
{
  const result = rulesetEvaluation(() => {}, { details: [validRuleset], status: "error" });
  assert.equal(result.status, "unknown");
}

// Permitir squash además de merge rompe la garantía de merge commit.
{
  const result = rulesetEvaluation((ruleset) => {
    ruleset.rules.find((rule) => rule.type === "pull_request").parameters.allowed_merge_methods = ["merge", "squash"];
  });
  assert.notEqual(result.status, "pass");
}

// Historia lineal obligatoria y merge queue con squash son incompatibles con merge commit.
{
  const linearResult = rulesetEvaluation((ruleset) => {
    ruleset.rules.push({ type: "required_linear_history" });
  });
  assert.notEqual(linearResult.status, "pass");

  const queueResult = rulesetEvaluation((ruleset) => {
    ruleset.rules.push({ type: "merge_queue", parameters: { merge_method: "SQUASH" } });
  });
  assert.notEqual(queueResult.status, "pass");
}

// El contrato de perfil diferencia el workflow estático del Node.
{
  const staticRuleset = structuredClone(validRuleset);
  staticRuleset.rules.find((rule) => rule.type === "required_status_checks").parameters.required_status_checks[0].context = STATIC_CONTEXT;
  const result = rulesetEvaluation(() => {}, { profile: staticProfile, details: [staticRuleset] });
  assert.equal(result.status, "pass");
}

// Las garantías de varios rulesets activos se combinan de forma conservadora.
{
  const protectionRules = structuredClone(validRuleset);
  protectionRules.rules = protectionRules.rules.filter((rule) => rule.type !== "required_status_checks");
  const qualityRules = structuredClone(validRuleset);
  qualityRules.rules = qualityRules.rules.filter((rule) => rule.type === "required_status_checks");
  const result = rulesetEvaluation(() => {}, { details: [protectionRules, qualityRules] });
  assert.equal(result.status, "pass");
}

// Branch protection clásica equivalente: también puede demostrar el contrato completo.
{
  const result = branchEvaluation();
  assert.equal(result.status, "pass");
  assert.equal(result.mechanism, "branch-protection");
}

// La protección clásica sin required checks reproduce el falso positivo en la otra API.
{
  const result = branchEvaluation((protection) => {
    protection.required_status_checks = null;
  });
  assert.notEqual(result.status, "pass");
}

// La protección clásica sin PR obligatorio no es equivalente.
{
  const result = branchEvaluation((protection) => {
    protection.required_pull_request_reviews = null;
  });
  assert.notEqual(result.status, "pass");
}

// La protección clásica que permite borrar main no es equivalente.
{
  const result = branchEvaluation((protection) => {
    protection.allow_deletions = { enabled: true };
  });
  assert.notEqual(result.status, "pass");
}

// La protección clásica que permite force push no es equivalente.
{
  const result = branchEvaluation((protection) => {
    protection.allow_force_pushes = { enabled: true };
  });
  assert.notEqual(result.status, "pass");
}

// Administradores no sujetos a la protección son un bypass real.
{
  const result = branchEvaluation((protection) => {
    protection.enforce_admins = { enabled: false };
  });
  assert.notEqual(result.status, "pass");
}

// Los null documentados significan admins no sujetos y force push bloqueado, respectivamente.
{
  const adminResult = branchEvaluation((protection) => {
    protection.enforce_admins = null;
  });
  assert.notEqual(adminResult.status, "pass");

  const forcePushResult = branchEvaluation((protection) => {
    protection.allow_force_pushes = null;
  });
  assert.equal(forcePushResult.status, "pass");
}

// Allowances no vacíos impiden afirmar que todos los merges respetan el contrato.
{
  const result = branchEvaluation((protection) => {
    protection.required_pull_request_reviews.bypass_pull_request_allowances.users = ["maintainer"];
  });
  assert.notEqual(result.status, "pass");
}

// La branch protection sin metadatos de merge suficientes es desconocida, no verde.
{
  const result = branchEvaluation(() => {}, {
    repositoryOverrides: { allow_merge_commit: null, allow_squash_merge: null, allow_rebase_merge: null }
  });
  assert.equal(result.status, "unknown");
}

// El auditor debe publicar el resultado del evaluador puro en el contrato existente.
{
  const report = await auditFixture({ ruleset: validRuleset });
  assert.equal(report.governance.ruleset.status, "pass");
  assert.equal(report.governance.ruleset.mechanism, "ruleset");
  assert.equal(report.checks.find((check) => check.id === "main-protection").status, "pass");
}

// La paginación de la lista de rulesets no puede ocultar una página posterior.
{
  const report = await auditFixture({ ruleset: validRuleset, rulesetsStatus: "paginated" });
  assert.equal(report.governance.ruleset.status, "pass");
  assert.equal(report.governance.ruleset.mechanism, "ruleset");
}

// La ausencia explícita de rulesets permite usar una branch protection clásica completa.
{
  const report = await auditFixture({ ruleset: validRuleset, rulesetsStatus: "empty", branchProtection: validBranchProtection });
  assert.equal(report.governance.ruleset.status, "pass");
  assert.equal(report.governance.ruleset.mechanism, "branch-protection");
  assert.equal(report.checks.find((check) => check.id === "main-protection").status, "pass");
}

// Un 404 de rulesets no demuestra ausencia y no puede ocultar una consulta incompleta.
{
  const report = await auditFixture({ ruleset: validRuleset, rulesetsStatus: "not-found", branchProtection: validBranchProtection });
  assert.equal(report.governance.ruleset.status, "unknown");
  assert.equal(report.checks.find((check) => check.id === "main-protection").status, "unknown");
}

// La integración no puede volver a marcar como verde el falso positivo original.
{
  const incompleteRuleset = structuredClone(validRuleset);
  incompleteRuleset.rules = incompleteRuleset.rules.filter((rule) => rule.type !== "required_status_checks");
  const report = await auditFixture({ ruleset: incompleteRuleset });
  assert.equal(report.governance.ruleset.status, "fail");
  assert.equal(report.checks.find((check) => check.id === "main-protection").status, "fail");
}

// Un error al consultar rulesets no puede ocultarse con una protección parcial.
{
  const report = await auditFixture({ ruleset: validRuleset, rulesetsStatus: "error" });
  assert.equal(report.governance.ruleset.status, "unknown");
  assert.equal(report.checks.find((check) => check.id === "main-protection").status, "unknown");
}

console.log("Contratos de main protection válidos.");
