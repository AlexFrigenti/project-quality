import { access, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const APPLICABILITIES = new Set(["required", "optional", "not-applicable"]);
const OUTCOMES = new Set(["success", "failure", "cancelled", "skipped", ""]);
const GATE_LABELS = {
  install: "Instalación",
  preflight: "Preflight",
  lint: "Lint o formato",
  typecheck: "Tipos",
  build: "Build",
  tests: "Tests",
  coverage: "Cobertura",
  "e2e-install": "Instalación E2E",
  e2e: "E2E",
  smoke: "Smoke test",
  validation: "Validación estática",
  metrics: "Métricas adicionales"
};

function requireText(env, key) {
  const value = env[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(key + " es obligatorio para generar quality-metrics.json");
  }
  return value.trim();
}

function requireSha(env, key) {
  const value = requireText(env, key);
  if (!/^[0-9a-f]{40}$/.test(value)) {
    throw new Error(key + " debe ser un SHA de 40 caracteres hexadecimales");
  }
  return value;
}

function positiveInteger(value, key) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(key + " debe ser un entero positivo");
  }
  return parsed;
}

function normalizeApplicability(value) {
  if (!APPLICABILITIES.has(value)) {
    throw new Error("Applicability inválida para un gate: " + value);
  }
  return value;
}

function normalizeOutcome(value, applicability) {
  if (applicability === "not-applicable") return "not-applicable";
  if (!OUTCOMES.has(value)) return "unknown";
  if (value === "success") return "passed";
  if (value === "failure" || value === "cancelled") return "failed";
  if (value === "skipped") return "skipped";
  return "unknown";
}

function detailFor(status, applicability) {
  if (applicability === "not-applicable") return "No aplica para este perfil.";
  if (status === "passed") return "Gate ejecutado correctamente.";
  if (status === "failed") return "Gate ejecutado y ha fallado.";
  if (status === "skipped") return "Gate aplicable, pero no se ejecutó.";
  return "No se pudo determinar el estado del gate.";
}

function envSuffix(id) {
  return id.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

function buildEvidence(url) {
  return [
    {
      kind: "workflow-run",
      label: "Ejecución del workflow de calidad",
      url
    }
  ];
}

function buildGates(env, evidence) {
  const ids = requireText(env, "QUALITY_GATE_IDS").split(/\s+/).filter(Boolean);
  if (ids.length === 0) throw new Error("QUALITY_GATE_IDS debe contener al menos un gate");

  return ids.map((id) => {
    const suffix = envSuffix(id);
    const applicability = normalizeApplicability(env["QUALITY_GATE_APPLICABILITY_" + suffix]);
    const outcome = env["QUALITY_GATE_STATUS_" + suffix] || "";
    const status = normalizeOutcome(outcome, applicability);
    return {
      id,
      label: GATE_LABELS[id] || id,
      applicability,
      status,
      details: detailFor(status, applicability),
      evidence
    };
  });
}

function sanitizeMetricValue(value, path) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error("Métrica numérica inválida en " + path);
    }
    return value;
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Las métricas solo pueden contener números u objetos numéricos: " + path);
  }

  const entries = Object.entries(value);
  if (entries.length === 0) throw new Error("Objeto de métricas vacío en " + path);

  const sanitized = {};
  for (const [key, child] of entries) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(key)) {
      throw new Error("Nombre de métrica inválido en " + path);
    }
    sanitized[key] = sanitizeMetricValue(child, path + "." + key);
  }
  return sanitized;
}

async function loadMetrics(env) {
  const file = env.QUALITY_METRICS_FILE || "";
  if (file === "") return { metrics: {}, error: null };

  try {
    await access(file, constants.F_OK);
  } catch {
    if (env.QUALITY_METRICS_FILE_REQUIRED === "true") {
      return { metrics: {}, error: "No se encontró el archivo de métricas declarado." };
    }
    return { metrics: {}, error: null };
  }

  try {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    const source = parsed && typeof parsed === "object" && parsed.metrics ? parsed.metrics : parsed;
    if (source === null || typeof source !== "object" || Array.isArray(source)) {
      return { metrics: {}, error: "El archivo de métricas no contiene un objeto válido." };
    }

    const metrics = {};
    for (const [key, value] of Object.entries(source)) {
      if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(key)) {
        return { metrics: {}, error: "El archivo de métricas contiene un nombre inválido." };
      }
      metrics[key] = sanitizeMetricValue(value, key);
    }
    return { metrics, error: null };
  } catch (error) {
    return {
      metrics: {},
      error: error instanceof Error ? error.message : "No se pudo leer el archivo de métricas."
    };
  }
}

function conclusionFor(gates) {
  const required = gates.filter((gate) => gate.applicability === "required");
  if (required.some((gate) => gate.status === "failed")) return "failed";
  if (required.some((gate) => ["unknown", "skipped"].includes(gate.status))) return "unknown";
  return "passed";
}

export async function buildQualityMetrics({ env = process.env, now = new Date() } = {}) {
  const repository = requireText(env, "GITHUB_REPOSITORY");
  const commitSha = requireSha(env, "GITHUB_SHA");
  const standardSha = requireSha(env, "QUALITY_STANDARD_SHA");
  const standardVersion = requireText(env, "QUALITY_STANDARD_VERSION");
  const runId = positiveInteger(env.GITHUB_RUN_ID, "GITHUB_RUN_ID");
  const runAttempt = positiveInteger(env.GITHUB_RUN_ATTEMPT || "1", "GITHUB_RUN_ATTEMPT");
  const serverUrl = (env.GITHUB_SERVER_URL || "https://github.com").replace(/\/+$/, "");
  const workflowUrl = serverUrl + "/" + repository + "/actions/runs/" + runId;
  const startedAt = env.QUALITY_RUN_STARTED_AT || now.toISOString();
  const completedAt = now.toISOString();
  const evidence = buildEvidence(workflowUrl);
  const gates = buildGates(env, evidence);
  const loadedMetrics = await loadMetrics(env);

  if (loadedMetrics.error) {
    const metricsGate = gates.find((gate) => gate.id === "metrics");
    if (!metricsGate) {
      throw new Error("No existe un gate metrics para registrar el error de las métricas.");
    }
    metricsGate.status = "failed";
    metricsGate.details = loadedMetrics.error;
  }

  return {
    schemaVersion: 1,
    project: {
      id: (env.QUALITY_PROJECT_ID || basename(repository)).toLowerCase(),
      name: env.QUALITY_PROJECT_NAME || basename(repository),
      repository,
      kind: env.QUALITY_PROJECT_KIND || "node"
    },
    commit: {
      sha: commitSha,
      ref: env.GITHUB_REF || "refs/heads/" + (env.GITHUB_REF_NAME || "unknown"),
      branch: env.GITHUB_REF_NAME || "unknown",
      event: env.GITHUB_EVENT_NAME || "unknown"
    },
    run: {
      workflow: env.GITHUB_WORKFLOW || "quality",
      id: runId,
      attempt: runAttempt,
      startedAt,
      completedAt,
      url: workflowUrl
    },
    standard: {
      version: standardVersion,
      sha: standardSha
    },
    conclusion: conclusionFor(gates),
    gates,
    metrics: loadedMetrics.metrics,
    evidence
  };
}

export async function writeQualityMetrics({ env = process.env, now = new Date() } = {}) {
  const report = await buildQualityMetrics({ env, now });
  const outputFile = env.QUALITY_METRICS_OUTPUT || "quality-metrics.json";
  await writeFile(outputFile, JSON.stringify(report, null, 2) + "\n");
  return report;
}

async function main() {
  const report = await writeQualityMetrics();
  console.log("quality-metrics.json generado: " + report.conclusion);
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (entrypoint === import.meta.url) {
  await main();
}
