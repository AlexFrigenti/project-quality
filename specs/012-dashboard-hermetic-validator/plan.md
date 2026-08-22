# Dashboard Contract Validator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Endurecer el contrato de `data.json` y hacer que el ensamblado del dashboard valide el resultado antes de publicarlo.

**Architecture:** `scripts/dashboard-contract.mjs` será una unidad pura sin I/O que contendrá la recomposición de `summary` y la validación estructural/coherente de los cuatro informes. `validate-dashboard.mjs` conservará el CLI e importará esa unidad; `assemble-dashboard.mjs` la usará para recomponer y validar antes de escribir. El histórico, los schemas existentes y los HTML no cambian.

**Tech Stack:** Node.js ES modules, `node:assert/strict`, `node:fs/promises`, fixtures deterministas sobre directorios temporales y GitHub Actions existente.

**Spec:** `specs/012-dashboard-hermetic-validator/spec.md`

## Global Constraints

- Usar únicamente la base `origin/main` `c0ca2abd77884c95a9abe39e760636cfb0e4b4ee` y la rama `feat/pq-ox03-dashboard-validator`.
- No trabajar directamente sobre `main` ni publicar rama, PR, merge o deploy en este sprint sin autorización posterior.
- Mantener `schemaVersion: 1` y no reescribir snapshots históricos.
- No añadir dependencias, URLs reales, tokens, secretos ni datos personales.
- Mantener `pending`, `unavailable`, `unknown` y estados no aplicables diferenciados; ninguno puede convertirse silenciosamente en verde.
- Cada modificación de lógica debe tener primero una reproducción determinista o una prueba de regresión.

---

### Task 1: Añadir reproducciones rojas del contrato incompleto

**Files:**
- Modify: `scripts/test-dashboard.mjs`
- Test: `scripts/test-dashboard.mjs`

**Interfaces:**
- Consumes: `buildValidDashboard()`, `buildValidRepository()`, `validateDashboard()` y `assembleDashboard()` existentes.
- Produces: casos rojos que describen el contrato PQ-OX03 sin modificar todavía producción.

- [ ] **Step 1: Write the failing tests**

Añadir después de las pruebas existentes de `validateDashboard` casos que muten una copia válida:

```js
{
  const invalid = buildValidDashboard();
  invalid.summary.protectedMain = 0;
  assert.throws(() => validateDashboard(invalid), /protectedMain/);
}

for (const mutate of [
  (report) => { report.repository.url = "https://github.com/private-leak"; },
  (report) => { report.workflow.url = "https://github.com/private-leak"; },
  (report) => { report.governance.ruleset.url = "https://github.com/private-leak"; },
  (report) => { report.qualityRun.url = "https://github.com/private-leak"; },
  (report) => { report.checks[0].evidenceUrl = "https://github.com/private-leak"; }
]) {
  const invalid = buildValidDashboard();
  mutate(invalid.repositories[0]);
  assert.throws(() => validateDashboard(invalid), /privad|URL|evidencia/i);
}
```

Añadir también un caso de ensamblado con `qualityEvidence: { status: "current" }` en uno de los cuatro informes y comprobar que `assembleDashboard` rechaza el fixture y no deja `site/data.json` escrito.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node scripts/test-dashboard.mjs
```

Expected: FAIL porque la implementación actual no rechaza el contador manipulado, las URLs privadas ni el informe `current` incompleto.

- [ ] **Step 3: Commit**

```bash
git add -- scripts/test-dashboard.mjs
git commit -m "test: reproduce dashboard contract false greens"
```

### Task 2: Crear el contrato puro compartido

**Files:**
- Create: `scripts/dashboard-contract.mjs`
- Test: `scripts/test-dashboard.mjs`

**Interfaces:**
- Consumes: informes de auditoría ya serializados y el contrato `schemaVersion: 1`.
- Produces: `export function buildDashboardSummary(repositories)` y `export function validateDashboard(value)`; ambas no hacen I/O ni red.

- [ ] **Step 1: Write the pure interfaces and summary tests**

Definir el resultado esperado de la recomposición:

```js
export function buildDashboardSummary(repositories) {
  const count = (predicate) => repositories.filter(predicate).length;
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
```

La función de validación debe comparar cada clave de `summary` con este resultado y validar los objetos consumidos por Pages, incluidos los invariantes descritos en la spec. Los errores deben identificar la ruta lógica (`summary.protectedMain`, `repositories[0].qualityEvidence.summary`, etc.).

- [ ] **Step 2: Run the focused test**

Run:

```bash
node scripts/test-dashboard.mjs
```

Expected: los casos rojos de la Task 1 siguen fallando hasta conectar el adaptador y el ensamblador; las pruebas de forma pura pasan solo cuando la implementación mínima existe.

- [ ] **Step 3: Commit**

```bash
git add -- scripts/dashboard-contract.mjs scripts/test-dashboard.mjs
git commit -m "feat: add hermetic dashboard contract"
```

### Task 3: Conectar el CLI del validador al contrato puro

**Files:**
- Modify: `scripts/validate-dashboard.mjs`
- Modify: `scripts/test-dashboard.mjs`

**Interfaces:**
- Consumes: `validateDashboard(value)` desde `scripts/dashboard-contract.mjs`.
- Produces: el mismo CLI (`site/data.json` por defecto y ruta explícita) sin efectos de I/O al importar el módulo de contrato.

- [ ] **Step 1: Replace the duplicated validator body**

Mantener el guard de entrada existente y convertir el archivo en adaptador:

```js
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { validateDashboard } from "./dashboard-contract.mjs";

export { validateDashboard } from "./dashboard-contract.mjs";

async function main() {
  const file = process.argv[2] || "site/data.json";
  const value = JSON.parse(await readFile(file, "utf8"));
  validateDashboard(value);
  console.log("Dashboard válido: " + value.repositories.length + " repositorios.");
}
```

- [ ] **Step 2: Run CLI and dashboard tests**

Run:

```bash
node scripts/test-dashboard.mjs
node scripts/validate-dashboard.mjs --help
```

Expected: la suite de dashboard pasa y el CLI conserva su resolución de ruta; la invocación con `--help` debe fallar indicando que esa ruta no es un dashboard válido, porque no existe un modo help contratado.

- [ ] **Step 3: Commit**

```bash
git add -- scripts/validate-dashboard.mjs scripts/dashboard-contract.mjs scripts/test-dashboard.mjs
git commit -m "refactor: route dashboard CLI through contract"
```

### Task 4: Hacer hermético el ensamblado

**Files:**
- Modify: `scripts/assemble-dashboard.mjs`
- Modify: `scripts/test-dashboard.mjs`

**Interfaces:**
- Consumes: `buildDashboardSummary()` y `validateDashboard()` del contrato puro.
- Produces: `assembleDashboard()` solo escribe `data.json`, HTML y `.nojekyll` después de validar el objeto completo.

- [ ] **Step 1: Recompose and validate before writes**

Sustituir el `summary` calculado localmente por la función compartida y validar inmediatamente después de construir `data`:

```js
const data = {
  schemaVersion: 1,
  generatedAt: now.toISOString(),
  source: {
    repository: "AlexFrigenti/project-quality",
    commit: env.GITHUB_SHA || null,
    standardRelease: env.STANDARD_RELEASE || "v1.1.0",
    standardSha: env.STANDARD_SHA || null
  },
  summary: buildDashboardSummary(orderedReports),
  repositories: orderedReports
};

validateDashboard(data);
await writeFile(join(outputDir, "data.json"), `${JSON.stringify(data, null, 2)}\n`);
```

La validación debe ejecutarse antes de copiar páginas para que un informe inválido no produzca un sitio parcialmente utilizable.

- [ ] **Step 2: Run the assembler regression**

Run:

```bash
node scripts/test-dashboard.mjs
```

Expected: el caso de informe `current` incompleto falla durante `assembleDashboard`, no después en un paso separado.

- [ ] **Step 3: Commit**

```bash
git add -- scripts/assemble-dashboard.mjs scripts/dashboard-contract.mjs scripts/test-dashboard.mjs
git commit -m "fix: validate dashboard before assembly writes"
```

### Task 5: Completar regresiones de privacidad, coherencia e histórico

**Files:**
- Modify: `scripts/test-dashboard.mjs`
- Modify: `scripts/test-quality-history.mjs`
- Modify: `DASHBOARD.md`

**Interfaces:**
- Consumes: contrato compartido, `buildQualityHistorySnapshot()` y `validateQualityHistory()` existentes.
- Produces: evidencia de que el endurecimiento protege Pages sin cambiar snapshots antiguos ni el rendering.

- [ ] **Step 1: Add the remaining deterministic cases**

Cubrir explícitamente:

- todos los contadores de `summary`, no solo `total`, `pass` y `qualityCurrent`;
- URL en un objeto anidado privado no conocido por el validador;
- `current` con SHA de resumen distinto, cero gates o `qualityRun.status` incompatible;
- `pending`/`unavailable` con gates o `qualityRun.status: "pass"`;
- informe público válido con URLs de GitHub;
- informe privado válido sin URLs;
- `buildQualityHistorySnapshot` sobre datos válidos producidos por el nuevo ensamblador;
- snapshots históricos existentes que continúan pasando su validador.

- [ ] **Step 2: Update the dashboard contract documentation**

Añadir a `DASHBOARD.md` que el ensamblador recomputa y valida el `summary`, comprueba la coherencia de los informes y bloquea la escritura del sitio ante datos inválidos; conservar la descripción de privacidad actual.

- [ ] **Step 3: Run the affected suites**

Run:

```bash
node scripts/test-dashboard.mjs
node scripts/test-quality-history.mjs
node scripts/test-quality-history-index.mjs
node scripts/test-history-rendering.mjs
```

Expected: 0 fallos y los snapshots no se reescriben.

- [ ] **Step 4: Commit**

```bash
git add -- scripts/test-dashboard.mjs scripts/test-quality-history.mjs DASHBOARD.md
git commit -m "test: cover dashboard privacy and consistency"
```

### Task 6: Regresión completa y cierre local

**Files:**
- Review: diff completo de la rama frente a `origin/main`.
- Test: las suites Node deterministas del repositorio.

**Interfaces:**
- Consumes: commits anteriores de PQ-OX03.
- Produces: commit final local listo para revisión humana, sin publicación externa.

- [ ] **Step 1: Run the complete local regression**

```bash
for script in \
  scripts/test-quality-metrics.mjs \
  scripts/test-node-quality-workflow.mjs \
  scripts/test-audit-profiles.mjs \
  scripts/test-main-protection.mjs \
  scripts/test-history-rendering.mjs \
  scripts/test-dashboard.mjs \
  scripts/test-quality-evidence.mjs \
  scripts/test-quality-history.mjs \
  scripts/test-quality-history-index.mjs
do
  node "$script" || exit $?
done
```

Expected: cada suite termina con código 0.

- [ ] **Step 2: Review scope and hygiene**

```bash
git diff --check
git diff --stat origin/main...HEAD
git diff --name-only origin/main...HEAD
git status --short --branch
```

Confirmar manualmente que solo aparecen el contrato, validator/assembler, tests, documentación y artefactos `specs/012-dashboard-hermetic-validator/`.

- [ ] **Step 3: Run one independent review**

Revisar el diff completo contra la spec, buscando especialmente falsos verdes, privacidad en informes privados, compatibilidad con históricos y escritura prematura de Pages. Agrupar las correcciones necesarias en una sola ronda.

- [ ] **Step 4: Commit the final local result**

```bash
git add -- scripts/dashboard-contract.mjs scripts/validate-dashboard.mjs scripts/assemble-dashboard.mjs scripts/test-dashboard.mjs scripts/test-quality-history.mjs DASHBOARD.md specs/012-dashboard-hermetic-validator
git commit -m "fix: harden dashboard validation contract"
```

Detenerse después de este commit. No ejecutar `git push`, crear PR, fusionar ni desplegar.
