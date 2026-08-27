# Plan de implementación: PQ-OX20 — Higiene y consistencia de collect-quality-evidence

## Resumen del enfoque

Este plan establece una ejecución estrictamente TDD (RED → GREEN) para eliminar el helper huérfano de módulo `request` en `scripts/collect-quality-evidence.mjs` y homogeneizar la resolución de `globalThis.fetch` en `readArtifactJson`, protegiendo ambas invariantes mediante guardas estáticas en `scripts/test-quality-evidence.mjs`.

---

## Fases de ejecución

### Fase 1 — RED (Guardas contractuales)
1. **Comprobar precondiciones:**
   - Verificar rama `feat/pq-ox20-evidence-collector-hygiene`.
   - Verificar `origin/main` en `5cf423b8d2040fcfc753ae8760fdd5c60d264a9c`.
   - Confirmar árbol de trabajo limpio.
2. **Añadir guardas estáticas en [scripts/test-quality-evidence.mjs](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/scripts/test-quality-evidence.mjs):**
   - Leer el código fuente de `scripts/collect-quality-evidence.mjs`.
   - Añadir aserción: prohibir cualquier declaración de función llamada `request` (`/(?:async\s+)?function\s+request\b/`).
   - Añadir aserción: verificar que `readArtifactJson` contiene `deps.fetch || globalThis.fetch`.
3. **Ejecutar prueba RED:**
   - Ejecutar `node scripts/test-quality-evidence.mjs`.
   - Registrar y verificar el fallo esperado en RED por presencia de `async function request` y ausencia de `globalThis.fetch`.

### Fase 2 — GREEN (Refactorización mínima)
1. **Limpieza en [scripts/collect-quality-evidence.mjs](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/scripts/collect-quality-evidence.mjs):**
   - Eliminar la declaración huérfana de nivel de módulo `async function request(path) { ... }` (líneas 23-42).
   - En `readArtifactJson`, actualizar `const fetchImpl = deps.fetch || fetch;` por `const fetchImpl = deps.fetch || globalThis.fetch;`.
2. **Ejecutar prueba GREEN:**
   - Ejecutar `node scripts/test-quality-evidence.mjs`.
   - Confirmar que la suite pasa en GREEN con éxito (`Collector de evidencia válido.`).

### Fase 3 — Regresión y verificación integral
1. **Validación de suites completas:**
   - Ejecutar las 18 suites de pruebas del repositorio:
     - `test-actions-runtime.mjs`
     - `test-audit-profiles.mjs`
     - `test-dashboard-trigger-paths.mjs`
     - `test-dashboard.mjs`
     - `test-github-api-resilience.mjs`
     - `test-history-api-resilience.mjs`
     - `test-history-production-path.mjs`
     - `test-history-quarantine.mjs`
     - `test-history-rendering.mjs`
     - `test-main-protection.mjs`
     - `test-main-quality-gate.mjs`
     - `test-node-quality-workflow-crlf.mjs`
     - `test-node-quality-workflow.mjs`
     - `test-quality-evidence.mjs`
     - `test-quality-history-index.mjs`
     - `test-quality-history.mjs`
     - `test-quality-metrics.mjs`
     - `test-schema-validator-parity.mjs`
2. **Validación de sintaxis:**
   - Ejecutar `node --check scripts/*.mjs` para verificar la corrección de todos los módulos.
3. **Validación de esquemas JSON:**
   - Parsear todos los esquemas en `schemas/*.json`.
4. **Revisión del diff:**
   - Ejecutar `git diff --check` para verificar formato y saltos de línea.
   - Ejecutar `git diff --name-only origin/main...HEAD` y asegurar que contiene exclusivamente los archivos autorizados:
     - `scripts/collect-quality-evidence.mjs`
     - `scripts/test-quality-evidence.mjs`
     - `specs/019-evidence-collector-hygiene/spec.md`
     - `specs/019-evidence-collector-hygiene/plan.md`
     - `specs/019-evidence-collector-hygiene/tasks.md`

---

## Criterios de parada y mitigación

- Si falla alguna suite de prueba no relacionada o se introduce alguna inconsistencia en las funciones exportadas de `collect-quality-evidence.mjs`, detenerse inmediatamente, aislar la causa y corregir de manera mínima sin expandir el alcance.
