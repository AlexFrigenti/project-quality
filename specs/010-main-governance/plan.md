# Gobernanza real de `main` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que `main-protection` solo sea verde cuando GitHub demuestra las garantías contractuales completas de la rama estable.

**Architecture:** Extraer la decisión a `scripts/main-protection.mjs`, una unidad pura que normaliza y evalúa rulesets y branch protection clásica a partir de fixtures. `scripts/audit-repository.mjs` conserva la obtención de datos, consulta ambos mecanismos cuando corresponde y publica el resultado compatible en `governance.ruleset.status`; los consumidores de histórico y dashboard siguen leyendo el mismo estado.

**Tech Stack:** JavaScript ESM ejecutado con Node.js, GitHub REST API v2022-11-28, fixtures JSON inline, validadores y tests existentes ejecutados directamente con `node`.

**Spec:** `specs/010-main-governance/spec.md`

## Global Constraints

- No trabajar directamente sobre `main`; la rama es `feat/pq-ox02-main-governance`.
- El alcance es exclusivamente PQ-OX02 y no incluye snapshots históricos, puntuaciones ni deuda CRLF no causal.
- No añadir dependencias ni hardcodear required checks fuera de `profiles[].requiredQualityCheck.context`.
- No producir `pass` ante ausencia, error, bypass o información incompleta.
- Mantener `governance.ruleset.status`, `main-protection`, `process.mainProtection` y `schemaVersion: 1`.
- No publicar, hacer `push`, crear Pull Request, fusionar ni desplegar; el checkpoint termina tras el commit local.

---

### Task 1: Registrar el contrato T2 y los perfiles

**Files:**
- Create: `specs/010-main-governance/spec.md`
- Modify: `scripts/audit-repository.mjs`
- Test: `scripts/test-audit-profiles.mjs`

**Interfaces:**
- Consumes: los cuatro objetos existentes de `profiles`.
- Produces: `profiles[profileId].requiredQualityCheck.context`, usado por el evaluador para identificar el gate agregado esperado.

- [x] **Step 1: Escribir la especificación, criterios, riesgos e invariantes**

  La especificación debe conservar las decisiones aprobadas: gate agregado por perfil, soporte ruleset/branch protection, bypasses, estados no verdes ante incertidumbre y compatibilidad del schema.

- [ ] **Step 2: Escribir la prueba roja del contrato de perfiles**

  Ampliar `scripts/test-audit-profiles.mjs` para exigir `requiredQualityCheck.context` en cada perfil, que los tres perfiles Node compartan el contexto Node y que `nucleo-preview` use el contexto estático. La prueba debe fallar contra la base porque la propiedad todavía no existe.

- [ ] **Step 3: Ejecutar la prueba roja de perfiles**

  Run: `node scripts/test-audit-profiles.mjs`

  Expected: fallo por la ausencia del contrato de gate, no por un error de fixture o de importación.

- [ ] **Step 4: Añadir el contrato explícito de check a los cuatro perfiles**

  Usar exactamente:

  ```js
  requiredQualityCheck: { context: "Reusable Node.js quality / Quality gates" }
  requiredQualityCheck: { context: "Reusable static quality / Static quality gates" }
  ```

  Los tres perfiles Node comparten el primer contexto; `nucleo-preview` usa el segundo.

- [ ] **Step 5: Ejecutar la prueba de perfiles en verde**

  Run: `node scripts/test-audit-profiles.mjs`

  Expected: PASS para los contratos de perfiles y, antes de añadir la implementación principal, ningún cambio en histórico salvo el comportamiento ya cubierto.

### Task 2: TDD de la evaluación pura de gobernanza

**Files:**
- Create: `scripts/main-protection.mjs`
- Create: `scripts/test-main-protection.mjs`

**Interfaces:**
- Consumes: `{ profile, repository, defaultBranch, rulesets, branchProtection }` con estados de fuente y respuestas normalizadas.
- Produces: `evaluateMainProtection(input) -> { status, mechanism, name, reason, rules }`, donde `status` es `pass`, `fail` o `unknown`.

- [ ] **Step 1: Escribir el primer test rojo del falso positivo**

  Crear un fixture de ruleset activo aplicable con `deletion`, `non_fast_forward` y `pull_request`, pero sin `required_status_checks`, y afirmar que `evaluateMainProtection` no devuelve `pass`.

- [ ] **Step 2: Ejecutar el test rojo**

  Run: `node scripts/test-main-protection.mjs`

  Expected: fallo por módulo o función de evaluación aún inexistente, no por un error de fixture.

- [ ] **Step 3: Añadir la primera implementación mínima**

  Exportar `evaluateMainProtection` y devolver al menos un estado no verde para el fixture sin required quality check. No añadir todavía integración HTTP ni dashboard.

- [ ] **Step 4: Ejecutar el test en verde**

  Run: `node scripts/test-main-protection.mjs`

  Expected: PASS del caso rojo convertido en regresión.

- [ ] **Step 5: Añadir casos contractuales restantes**

  Cubrir PR sin check, check sin PR, ruleset desactivado, condición que no aplica a `main`, bypass actor, información insuficiente, branch protection clásica equivalente, configuración parcial con squash, métodos de merge incompatibles, error de fuente y contexto distinto por perfil.

- [ ] **Step 6: Ejecutar la batería ampliada**

  Run: `node scripts/test-main-protection.mjs`

  Expected: cada caso positivo/negativo expresa una razón observable; ningún caso incompleto es `pass`.

### Task 3: Integrar la evaluación en el auditor

**Files:**
- Modify: `scripts/audit-repository.mjs`
- Modify: `scripts/test-main-protection.mjs`

**Interfaces:**
- Consumes: respuestas de `/rulesets`, `/rulesets/:id`, `/branches/:branch/protection`, `/branches/:branch/protection/required_pull_request_reviews` y metadatos del repositorio.
- Produces: el objeto existente `report.governance.ruleset` con `status`, más `mechanism`, `reason` y trazabilidad opcionales; el check `main-protection` usa el mismo estado.

- [ ] **Step 1: Añadir inyección de request para la integración determinista**

  Extender `auditRepository({ env, deps })` de forma compatible. El `request` inyectado debe devolver `{ ok, status, data }`; la llamada a `collectQualityEvidence` debe reutilizarlo cuando se suministre, sin cambiar la ruta de producción.

- [ ] **Step 2: Normalizar todos los detalles de rulesets aplicables**

  Consultar detalles de todos los candidatos de rama, distinguir `~DEFAULT_BRANCH`, `~ALL`, referencias exactas y exclusiones, acumular garantías activas y conservar como incertidumbre cualquier detalle que no pueda leerse.

- [ ] **Step 3: Consultar branch protection clásica solo como mecanismo equivalente**

  Cuando no haya un ruleset activo aplicable y la enumeración de rulesets sea completa, consultar la protección de la rama. Normalizar booleanos y `{ enabled }`, required checks en `contexts`/`checks`, enforcement de administradores, flags de force push/deletion, configuración de merge del repositorio y allowances de bypass.

- [ ] **Step 4: Publicar el resultado compatible**

  Conservar `governance.ruleset.status` y `checks[].id = "main-protection"`. Usar `unknown` para errores o respuestas insuficientes, `fail` para garantías conocidas ausentes y `pass` únicamente para el contrato completo.

- [ ] **Step 5: Añadir prueba de integración del auditor**

  Alimentar `auditRepository` con request y evidence stubs deterministas. Verificar que un ruleset con el gate agregado publica `governance.ruleset.status = "pass"`, que uno sin el gate publica `fail`, y que una fuente con error publica `unknown` sin consultar una garantía parcial como verde.

- [ ] **Step 6: Ejecutar la integración**

  Run: `node scripts/test-main-protection.mjs`

  Expected: unidad pura e integración del auditor en verde, sin llamadas de red real.

### Task 4: Regresión de contratos, dashboard e histórico

**Files:**
- Modify: `scripts/test-audit-profiles.mjs`
- Modify: `scripts/test-quality-history.mjs`
- Modify: `scripts/test-dashboard.mjs`
- Modify: `DASHBOARD.md`
- Modify: `QUALITY_STANDARD.md`
- Modify: `.github/workflows/quality-dashboard.yml`

**Interfaces:**
- Consumes: informes con `governance.ruleset.status` y metadatos opcionales de mecanismo.
- Produces: dashboard e histórico compatibles con estados antiguos y nuevos.

- [ ] **Step 1: Añadir regresión de los cuatro perfiles y el snapshot**

  Verificar que el contexto de gate acompaña al perfil y que `buildQualityHistorySnapshot` sigue normalizando solo el estado contractual, sin exigir ni copiar una nueva versión de schema.

- [ ] **Step 2: Añadir regresión de ensamblado y dashboard**

  Incluir un informe con `mechanism: "branch-protection"`, comprobar que `assembleDashboard` mantiene `protectedMain` basado en `status`, y validar que las cuatro tarjetas siguen siendo aceptadas.

- [ ] **Step 3: Documentar la garantía real**

  Actualizar `DASHBOARD.md` y la fase de bloqueo de `QUALITY_STANDARD.md` para distinguir mecanismo existente de protección suficiente, required quality gate, bypasses y estado desconocido.

- [ ] **Step 4: Activar el nuevo test en ambos filtros de paths del workflow**

  Añadir `scripts/main-protection.mjs` y `scripts/test-main-protection.mjs` a las listas `pull_request.paths` y `push.branches.main.paths` de `.github/workflows/quality-dashboard.yml`.

- [ ] **Step 5: Ejecutar la regresión contractual**

  Run:

  ```bash
  node scripts/test-audit-profiles.mjs
  node scripts/test-quality-history.mjs
  node scripts/test-dashboard.mjs
  ```

  Expected: tres procesos con exit code 0 y sin alterar snapshots versionados.

### Task 5: Verificación final y checkpoint local

**Files:**
- Review: todo el diff de la rama frente a `origin/main`.

**Interfaces:**
- Consumes: resultados de todas las suites y revisión independiente.
- Produces: commit local final de PQ-OX02, sin push ni Pull Request.

- [ ] **Step 1: Ejecutar todas las suites del workflow assemble**

  Run:

  ```bash
  node scripts/test-quality-metrics.mjs
  node scripts/test-node-quality-workflow.mjs
  node scripts/test-audit-profiles.mjs
  node scripts/test-main-protection.mjs
  node scripts/test-history-rendering.mjs
  node scripts/test-dashboard.mjs
  node scripts/test-quality-evidence.mjs
  node scripts/test-quality-history.mjs
  node scripts/test-quality-history-index.mjs
  ```

  Expected: exit code 0 en todas; si reaparece el fallo CRLF conocido, separarlo como preexistente y no corregirlo dentro de PQ-OX02.

- [ ] **Step 2: Ejecutar comprobaciones de diff y alcance**

  Run: `git diff --check` y `git diff --stat origin/main...HEAD`.

  Expected: sin errores de whitespace y solo archivos de spec, auditor, tests, documentación y workflow incluidos en este plan.

- [ ] **Step 3: Obtener una revisión independiente del diff completo**

  Revisar requisitos, falsos verdes, bypasses, compatibilidad, seguridad y tests. No repetir una revisión integral salvo que la corrección cambie sustancialmente la arquitectura.

- [ ] **Step 4: Corregir problemas agrupados y repetir solo validaciones afectadas**

  Si la revisión detecta problemas, aplicar una única ronda agrupada, ejecutar las suites afectadas y volver a comprobar diff. Si exige otra ronda integral sustancial, detenerse y solicitar autorización.

- [ ] **Step 5: Crear el commit local final**

  Revisar `git status`, añadir únicamente las rutas confirmadas y crear un commit descriptivo. No ejecutar `git push`, creación de PR, merge ni despliegue.
