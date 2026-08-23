export const CONTRACT_PATTERNS = Object.freeze({
  identifier: "^[a-z0-9][a-z0-9-]*$",
  metricName: "^[a-zA-Z][a-zA-Z0-9_-]*$",
  repository: "^[^/]+/[^/]+$",
  sha40: "^[0-9a-f]{40}$",
  sha64: "^[0-9a-f]{64}$",
  rfc3339DateTime: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$",
  httpUrl: "^https?://",
  historyReleaseTag: "^quality-history-\\d{4}-\\d{2}$",
  historyAssetName: "^quality-snapshot-([0-9a-f]{64})\\.json$"
});

export const CONTRACT_REGEXP = Object.freeze({
  identifier: new RegExp(CONTRACT_PATTERNS.identifier),
  metricName: new RegExp(CONTRACT_PATTERNS.metricName),
  repository: new RegExp(CONTRACT_PATTERNS.repository),
  sha40: new RegExp(CONTRACT_PATTERNS.sha40),
  sha64: new RegExp(CONTRACT_PATTERNS.sha64),
  rfc3339DateTime: new RegExp(CONTRACT_PATTERNS.rfc3339DateTime),
  historyReleaseTag: new RegExp(CONTRACT_PATTERNS.historyReleaseTag),
  historyAssetName: new RegExp(CONTRACT_PATTERNS.historyAssetName)
});

export const TOKEN_PATTERN = /(gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|Bearer\s+[A-Za-z0-9._-]+)/i;

export const CONTRACT_LIMITS = Object.freeze({
  projectName: 120,
  evidenceLabel: 160,
  gateLabel: 160,
  gateDetails: 400,
  historyGateId: 80,
  historyCheckId: 80,
  historyRepositoryId: 80,
  historyRepositoryName: 200,
  standardRelease: 40,
  qualityMessage: 200,
  notApplicableArea: 120,
  metricMaxNodes: 100,
  metricMaxDepth: 6
});

export const APPLICABILITIES = new Set(["required", "optional", "not-applicable"]);
export const METRICS_GATE_STATUSES = new Set(["passed", "failed", "skipped", "not-applicable", "unknown"]);
export const CONCLUSIONS = new Set(["passed", "failed", "unknown"]);
export const EVIDENCE_KINDS = new Set(["workflow-run", "workflow-step", "artifact", "repository"]);
export const PROCESS_STATUSES = new Set(["pass", "warning", "fail", "unknown", "pending", "missing", "not_applicable"]);
export const QUALITY_STATUSES = new Set(["current", "pending", "unavailable"]);

export const HISTORY_IDENTITY_VERSIONS = Object.freeze(new Set([1, 2]));
export const HISTORY_CURRENT_IDENTITY_VERSION = 2;
export const QUARANTINE_DETAIL_LIMIT = 200;

export const QUALITY_METRICS_KEYS = Object.freeze({
  root: new Set(["schemaVersion", "project", "commit", "run", "standard", "conclusion", "gates", "metrics", "evidence"]),
  project: new Set(["id", "name", "repository", "kind"]),
  commit: new Set(["sha", "ref", "branch", "event"]),
  run: new Set(["workflow", "id", "attempt", "startedAt", "completedAt", "url"]),
  standard: new Set(["version", "sha"]),
  gate: new Set(["id", "label", "applicability", "status", "details", "evidence"]),
  evidence: new Set(["kind", "label", "url"])
});

export const QUALITY_HISTORY_KEYS = Object.freeze({
  root: new Set(["schemaVersion", "identityVersion", "id", "generatedAt", "dashboardCommitSha", "standard", "repositories"]),
  standard: new Set(["release", "sha"]),
  process: new Set(["overall", "mainProtection", "workflow", "checks"]),
  check: new Set(["id", "status"]),
  gate: new Set(["id", "label", "applicability", "status", "details"]),
  quality: new Set(["status", "currentHeadSha", "commitSha", "validatedAt", "conclusion", "message", "gates", "metrics"]),
  repository: new Set(["id", "repository", "kind", "visibility", "notApplicableAreas", "process", "quality"])
});

export const QUALITY_HISTORY_INDEX_KEYS = new Set(["schemaVersion", "generatedAt", "snapshots"]);

export function stringLength(value) {
  return [...value].length;
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (value !== null && typeof value === "object") {
    return "{" + Object.keys(value)
      .sort()
      .map((key) => JSON.stringify(key) + ":" + canonicalJson(value[key]))
      .join(",") + "}";
  }
  return JSON.stringify(value);
}

export function isRfc3339DateTime(value) {
  return typeof value === "string" && CONTRACT_REGEXP.rfc3339DateTime.test(value) && !Number.isNaN(Date.parse(value));
}
