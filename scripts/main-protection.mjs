const SOURCE_STATUSES = new Set(["available", "absent", "error"]);

function result(status, reason, mechanism = null, extra = {}) {
  return {
    status,
    mechanism,
    name: extra.name || null,
    reason,
    rules: extra.rules || []
  };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value, key) {
  return isObject(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function enabledValue(value, nullValue = undefined) {
  if (value === null) return nullValue;
  if (typeof value === "boolean") return value;
  if (isObject(value) && typeof value.enabled === "boolean") return value.enabled;
  return undefined;
}

function escapeRegExp(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function fnmatchRegExp(pattern) {
  if (typeof pattern !== "string" || pattern.length === 0) return null;
  if (/[?+*@]\(/.test(pattern)) return null;

  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "\\") return null;
    if (character === "*") {
      if (pattern[index + 1] === "*") {
        source += ".*";
        index += 1;
      } else {
        source += "[^/]*";
      }
      continue;
    }
    if (character === "?") {
      source += "[^/]";
      continue;
    }
    if (character === "[") {
      const end = pattern.indexOf("]", index + 1);
      if (end < 0) return null;
      let content = pattern.slice(index + 1, end);
      if (content.startsWith("^")) return null;
      if (content.startsWith("!")) content = "^" + content.slice(1);
      if (content.length === 0 || content.includes("\\")) return null;
      source += "[" + content.replace(/]/g, "\\]") + "]";
      index = end;
      continue;
    }
    source += escapeRegExp(character);
  }
  return new RegExp(source + "$");
}

function matchesRefPattern(pattern, ref) {
  if (pattern === "~ALL") return { known: true, matches: true };
  const expression = fnmatchRegExp(pattern);
  return expression
    ? { known: true, matches: expression.test(ref) }
    : { known: false, matches: false };
}

function rulesetApplicability(ruleset, defaultBranch) {
  if (!isObject(ruleset) || ruleset.target !== "branch") return { known: true, applies: false };

  const refName = ruleset.conditions?.ref_name;
  if (!isObject(refName) || !Array.isArray(refName.include) || !Array.isArray(refName.exclude)) {
    return { known: false, applies: false };
  }

  const targetRef = "refs/heads/" + defaultBranch;
  let includesDefault = false;
  for (const pattern of refName.include) {
    const match = pattern === "~DEFAULT_BRANCH"
      ? { known: true, matches: true }
      : matchesRefPattern(pattern, targetRef);
    if (!match.known) return { known: false, applies: false };
    includesDefault ||= match.matches;
  }

  let excludesDefault = false;
  for (const pattern of refName.exclude) {
    const match = pattern === "~DEFAULT_BRANCH"
      ? { known: true, matches: true }
      : matchesRefPattern(pattern, targetRef);
    if (!match.known) return { known: false, applies: false };
    excludesDefault ||= match.matches;
  }
  return { known: true, applies: includesDefault && !excludesDefault };
}

function requiredContextsFromRuleset(rule) {
  const parameters = rule?.parameters;
  if (!isObject(parameters) || !Array.isArray(parameters.required_status_checks)) {
    return { known: false, contexts: new Set() };
  }

  const contexts = new Set();
  for (const check of parameters.required_status_checks) {
    if (!isObject(check) || typeof check.context !== "string" || check.context.trim() === "") {
      return { known: false, contexts: new Set() };
    }
    contexts.add(check.context);
  }
  return { known: true, contexts };
}

function requiredContextsFromBranchProtection(value) {
  if (!hasOwn(value, "required_status_checks")) return { known: false, contexts: new Set() };
  const checksProtection = value.required_status_checks;
  if (checksProtection === null) return { known: true, contexts: new Set() };
  if (!isObject(checksProtection)) return { known: false, contexts: new Set() };

  const contexts = new Set();
  if (hasOwn(checksProtection, "contexts")) {
    if (!Array.isArray(checksProtection.contexts) || checksProtection.contexts.some((context) => typeof context !== "string")) {
      return { known: false, contexts: new Set() };
    }
    for (const context of checksProtection.contexts) {
      if (context.trim() !== "") contexts.add(context);
    }
  }
  if (hasOwn(checksProtection, "checks")) {
    if (!Array.isArray(checksProtection.checks)) return { known: false, contexts: new Set() };
    for (const check of checksProtection.checks) {
      if (!isObject(check) || typeof check.context !== "string" || check.context.trim() === "") {
        return { known: false, contexts: new Set() };
      }
      contexts.add(check.context);
    }
  }
  if (!hasOwn(checksProtection, "contexts") && !hasOwn(checksProtection, "checks")) {
    return { known: false, contexts: new Set() };
  }
  return { known: true, contexts };
}

function bypassState(value) {
  if (!hasOwn(value, "bypass_actors")) return "unknown";
  if (value.bypass_actors === null) return "unknown";
  if (!Array.isArray(value.bypass_actors)) return "unknown";
  return value.bypass_actors.length === 0 ? "none" : "relevant";
}

function bypassAllowancesState(value) {
  if (!isObject(value)) return "unknown";
  for (const key of ["users", "teams", "apps"]) {
    if (!Array.isArray(value[key])) return "unknown";
  }
  return value.users.length + value.teams.length + value.apps.length === 0 ? "none" : "relevant";
}

function intersect(left, right) {
  return new Set([...left].filter((value) => right.has(value)));
}

function evaluateApplicableRulesets({ details, defaultBranch, requiredContext }) {
  const applicable = [];
  for (const detail of details) {
    const applicability = rulesetApplicability(detail, defaultBranch);
    if (!applicability.known) {
      return { outcome: result("unknown", "No se pudo demostrar la aplicabilidad de un ruleset a main.", "ruleset") };
    }
    if (applicability.applies) applicable.push(detail);
  }

  if (applicable.length === 0) return { outcome: null };

  const invalidEnforcement = applicable.find((ruleset) => !["active", "disabled", "evaluate"].includes(ruleset.enforcement));
  if (invalidEnforcement) {
    return { outcome: result("unknown", "Un ruleset aplicable no contiene un nivel de enforcement reconocible.", "ruleset") };
  }

  const active = applicable.filter((ruleset) => ruleset.enforcement === "active");
  if (active.length === 0) {
    return { outcome: result("fail", "Existe un ruleset aplicable, pero ninguno está activo y bloqueando merges.", "ruleset") };
  }

  const names = active.map((ruleset) => ruleset.name || String(ruleset.id || "ruleset"));
  const mergedRules = active.flatMap((ruleset) => Array.isArray(ruleset.rules) ? ruleset.rules : []);
  if (active.some((ruleset) => !Array.isArray(ruleset.rules))) {
    return { outcome: result("unknown", "La respuesta de un ruleset activo no contiene sus reglas completas.", "ruleset", { name: names.join(", ") }) };
  }

  if (active.some((ruleset) => bypassState(ruleset) === "unknown")) {
    return { outcome: result("unknown", "No se pudo demostrar la ausencia de bypasses en un ruleset activo.", "ruleset", { name: names.join(", ") }) };
  }
  if (active.some((ruleset) => bypassState(ruleset) === "relevant")) {
    return { outcome: result("fail", "Un actor puede saltarse las reglas de un ruleset activo aplicable.", "ruleset", { name: names.join(", ") }) };
  }

  const ruleTypes = new Set(mergedRules.map((rule) => rule?.type));
  const pullRequestRules = mergedRules.filter((rule) => rule?.type === "pull_request");
  if (pullRequestRules.length === 0) {
    return { outcome: result("fail", "Los rulesets aplicables no obligan a utilizar Pull Request.", "ruleset", { name: names.join(", ") }) };
  }
  if (!ruleTypes.has("deletion") || !ruleTypes.has("non_fast_forward")) {
    return { outcome: result("fail", "Falta el bloqueo de borrado o de force push en los rulesets aplicables.", "ruleset", { name: names.join(", ") }) };
  }

  if (ruleTypes.has("required_linear_history")) {
    return { outcome: result("fail", "Un ruleset aplicable exige historia lineal e impide el merge commit.", "ruleset", { name: names.join(", ") }) };
  }

  const mergeQueueRules = mergedRules.filter((rule) => rule?.type === "merge_queue");
  for (const rule of mergeQueueRules) {
    const mergeMethod = rule.parameters?.merge_method;
    if (["SQUASH", "REBASE", "squash", "rebase"].includes(mergeMethod)) {
      return { outcome: result("fail", "Un merge queue aplicable no crea merge commits.", "ruleset", { name: names.join(", ") }) };
    }
    if (mergeMethod !== "MERGE" && mergeMethod !== "merge") {
      return { outcome: result("unknown", "No se pudo demostrar el método de merge del merge queue aplicable.", "ruleset", { name: names.join(", ") }) };
    }
  }

  let allowedMergeMethods = null;
  for (const rule of pullRequestRules) {
    if (!isObject(rule.parameters) || !Array.isArray(rule.parameters.allowed_merge_methods)) {
      return { outcome: result("unknown", "No se pudo demostrar el método de merge permitido por un ruleset aplicable.", "ruleset", { name: names.join(", ") }) };
    }
    const methods = new Set(rule.parameters.allowed_merge_methods);
    allowedMergeMethods = allowedMergeMethods === null ? methods : intersect(allowedMergeMethods, methods);
  }
  if (allowedMergeMethods.size !== 1 || !allowedMergeMethods.has("merge")) {
    return { outcome: result("fail", "Los rulesets aplicables permiten un método distinto de merge commit.", "ruleset", { name: names.join(", ") }) };
  }

  const statusRules = mergedRules.filter((rule) => rule?.type === "required_status_checks");
  if (statusRules.length === 0) {
    return { outcome: result("fail", "Los rulesets aplicables no exigen required status checks.", "ruleset", { name: names.join(", ") }) };
  }
  const requiredContexts = new Set();
  for (const rule of statusRules) {
    const normalized = requiredContextsFromRuleset(rule);
    if (!normalized.known) {
      return { outcome: result("unknown", "La regla required_status_checks no contiene información suficiente.", "ruleset", { name: names.join(", ") }) };
    }
    for (const context of normalized.contexts) requiredContexts.add(context);
  }
  if (!requiredContexts.has(requiredContext)) {
    return { outcome: result("fail", "No se exige el quality gate agregado declarado por el perfil.", "ruleset", { name: names.join(", ") }) };
  }

  return {
    outcome: result(
      "pass",
      "Ruleset activo aplicable: Pull Request, quality gate agregado, merge commit, bloqueo de borrado y force push, sin bypasses.",
      "ruleset",
      { name: names.join(", "), rules: [...ruleTypes].filter(Boolean) }
    )
  };
}

function evaluateBranchProtection({ value, repository, requiredContext }) {
  if (!isObject(value)) return result("unknown", "La respuesta de branch protection no contiene una configuración completa.", "branch-protection");

  const reviews = value.required_pull_request_reviews;
  if (reviews === null) return result("fail", "La branch protection clásica no obliga a utilizar Pull Request.", "branch-protection");
  if (!isObject(reviews)) return result("unknown", "No se pudo demostrar la configuración de Pull Request de branch protection.", "branch-protection");

  const allowances = bypassAllowancesState(reviews.bypass_pull_request_allowances);
  if (allowances === "unknown") return result("unknown", "No se pudo demostrar la ausencia de bypasses de Pull Request.", "branch-protection");
  if (allowances === "relevant") return result("fail", "La branch protection clásica contiene allowances que pueden saltarse el requisito de Pull Request.", "branch-protection");

  const admins = enabledValue(value.enforce_admins, false);
  if (admins === undefined) return result("unknown", "No se pudo demostrar si los administradores están sujetos a la protección.", "branch-protection");
  if (!admins) return result("fail", "Los administradores pueden saltarse la branch protection.", "branch-protection");

  const contexts = requiredContextsFromBranchProtection(value);
  if (!contexts.known) return result("unknown", "No se pudo leer completamente required status checks de branch protection.", "branch-protection");
  if (!contexts.contexts.has(requiredContext)) return result("fail", "La branch protection clásica no exige el quality gate agregado declarado por el perfil.", "branch-protection");

  const deletions = enabledValue(value.allow_deletions);
  if (deletions === undefined) return result("unknown", "No se pudo demostrar el bloqueo de borrado de main.", "branch-protection");
  if (deletions) return result("fail", "La branch protection clásica permite borrar main.", "branch-protection");

  const forcePushes = enabledValue(value.allow_force_pushes, false);
  if (forcePushes === undefined) return result("unknown", "No se pudo demostrar el bloqueo de force push de main.", "branch-protection");
  if (forcePushes) return result("fail", "La branch protection clásica permite force push sobre main.", "branch-protection");

  const linearHistory = enabledValue(value.required_linear_history);
  if (linearHistory === undefined) return result("unknown", "No se pudo demostrar que la branch protection permita merge commits.", "branch-protection");
  if (linearHistory) return result("fail", "La historia lineal obligatoria impide el merge commit exigido.", "branch-protection");

  const mergeSettings = ["allow_merge_commit", "allow_squash_merge", "allow_rebase_merge"];
  if (mergeSettings.some((key) => typeof repository?.[key] !== "boolean")) {
    return result("unknown", "GitHub no ha proporcionado la configuración de métodos de merge del repositorio.", "branch-protection");
  }
  if (repository.allow_merge_commit !== true || repository.allow_squash_merge !== false || repository.allow_rebase_merge !== false) {
    return result("fail", "La configuración del repositorio permite un método distinto de merge commit.", "branch-protection");
  }

  return result(
    "pass",
    "Branch protection clásica: Pull Request, quality gate agregado, administradores sujetos, merge commit, bloqueo de borrado y force push, sin bypasses.",
    "branch-protection",
    { rules: ["pull_request", "required_status_checks", "deletion", "non_fast_forward"] }
  );
}

export function evaluateMainProtection({ profile, repository, defaultBranch = "main", rulesets, branchProtection }) {
  const requiredContext = profile?.requiredQualityCheck?.context;
  if (typeof requiredContext !== "string" || requiredContext.trim() === "") {
    return result("unknown", "El perfil no declara el contexto del quality gate agregado.");
  }
  if (typeof defaultBranch !== "string" || defaultBranch.trim() === "") {
    return result("unknown", "No se pudo determinar la rama por defecto que debe protegerse.");
  }
  if (defaultBranch !== "main") {
    return result("fail", `La rama por defecto es ${defaultBranch}, no main.`);
  }

  if (!rulesets || !SOURCE_STATUSES.has(rulesets.status)) {
    return result("unknown", "No se pudo determinar el estado de la consulta de rulesets.");
  }
  if (rulesets.status === "error") {
    return result("unknown", "La consulta de rulesets terminó con error; no se puede ocultar esa incertidumbre.");
  }
  if (rulesets.status === "available" && !Array.isArray(rulesets.details)) {
    return result("unknown", "La respuesta de rulesets no contiene sus detalles.");
  }
  if (rulesets.status === "available" && rulesets.incomplete === true) {
    return result("unknown", "No se pudieron recuperar todos los detalles de los rulesets aplicables.");
  }

  if (rulesets.status === "available") {
    const rulesetOutcome = evaluateApplicableRulesets({
      details: rulesets.details,
      defaultBranch,
      requiredContext
    }).outcome;
    if (rulesetOutcome) return rulesetOutcome;
  }

  if (!branchProtection || !SOURCE_STATUSES.has(branchProtection.status)) {
    return result("unknown", "No se pudo determinar el estado de la branch protection clásica.");
  }
  if (branchProtection.status === "error") {
    return result("unknown", "No se pudo consultar la branch protection clásica.", "branch-protection");
  }
  if (branchProtection.status === "absent") {
    return result("fail", "No existe un ruleset activo ni una branch protection que proteja main.");
  }
  return evaluateBranchProtection({
    value: branchProtection.value,
    repository,
    requiredContext
  });
}
