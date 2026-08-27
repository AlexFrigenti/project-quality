# Plan de Implementación TDD: PQ-OX19 — Saneamiento de código muerto en histórico y hermeticidad de tests

## Enfoque de implementación

El plan de trabajo sigue una disciplina estricta de desarrollo dirigido por pruebas (TDD) para garantizar la no regresión de los flujos de resiliencia del histórico y verificar el hermetismo total de los tests sin contaminar el espacio de trabajo.

---

## Fases de ejecución

### Fase 1: RED para detección de declaraciones muertas y artefactos residuales
1. **Comprobación estática de código muerto (RED inicial)**:
   - Crear una aserción o inspección de comprobación de código fuente que detecte la presencia indebida de `resilientJsonFetch`, `resilientAssetFetch`, `resilientGetTag` (módulo), `singlePostRelease` (módulo), `githubRequest` y `uploadAsset`.
2. **Detección de artefactos en test de resiliencia (RED inicial)**:
   - Ejecutar `scripts/test-github-api-resilience.mjs` y verificar que genera `report-*.json` en el CWD (`git status --porcelain` detecta archivo no trackeado).

### Fase 2: Saneamiento mínimo de código muerto
3. **Limpieza en [`scripts/collect-quality-history.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/collect-quality-history.mjs)**:
   - Eliminar `resilientJsonFetch` ([L28-L37](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/collect-quality-history.mjs#L28-L37)).
   - Eliminar `resilientAssetFetch` ([L39-L47](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/collect-quality-history.mjs#L39-L47)).
4. **Limpieza en [`scripts/persist-quality-history.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs)**:
   - Eliminar `resilientGetTag` a nivel de módulo ([L32-L41](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L32-L41)).
   - Eliminar `singlePostRelease` a nivel de módulo ([L43-L58](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L43-L58)).
   - Eliminar `githubRequest` ([L334-L354](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L334-L354)).
   - Eliminar `uploadAsset` ([L449-L462](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L449-L462)).
   - *Verificación de seguridad*: Comprobar que `resilientGetTag` y `singlePostRelease` internas dentro de `getOrCreateRelease` y `singleUploadAssetResilient` permanecen 100% intactas.

### Fase 3: Aislamiento temporal y hermetismo del test
5. **Aislamiento en [`scripts/test-github-api-resilience.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/test-github-api-resilience.mjs)**:
   - Importar `mkdtemp`, `rm` desde `node:fs/promises` y `tmpdir` desde `node:os` y `join` desde `node:path`.
   - En el caso 10, crear `const tempDir = await mkdtemp(join(tmpdir(), "test-github-resilience-"));`.
   - Pasar `OUTPUT_FILE: join(tempDir, "quality-report.json")`.
   - Envolver la ejecución y aserciones en un bloque `try ... finally` que garantice la ejecución de `await rm(tempDir, { recursive: true, force: true });`.
   - No modificar [`scripts/audit-repository.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/audit-repository.mjs).

### Fase 4: GREEN de rutas activas y verificación de no regresión
6. **Ejecución y validación GREEN de suites de pruebas**:
   - Ejecutar `node scripts/test-github-api-resilience.mjs` y comprobar que concluye exitosamente.
   - Comprobar con `git status --porcelain` que el árbol permanece completamente limpio y no se generó ningún `report-*.json`.
   - Ejecutar `node scripts/test-history-production-path.mjs` (14 pruebas de ruta productiva).
   - Ejecutar `node scripts/test-quality-history.mjs` (reconciliación y persistencia).
   - Ejecutar `node scripts/test-history-api-resilience.mjs` (resiliencia de API de histórico).
   - Ejecutar `node scripts/test-history-quarantine.mjs` (cuarentena e integridad).
   - Ejecutar el resto de tests del proyecto (`test-actions-runtime.mjs`, `test-audit-profiles.mjs`, `test-dashboard.mjs`, `test-main-protection.mjs`, `test-quality-evidence.mjs`, `test-quality-metrics.mjs`, `test-schema-validator-parity.mjs`, etc.).

### Fase 5: Validación final de árbol y diff
7. **Verificación de diff mínimo y sintaxis**:
   - Comprobar `git diff --check` (sin espacios en blanco ni errores de formato).
   - Revisar el diff línea por línea contra `origin/main` para asegurar que sólo se eliminaron las 6 funciones muertas y se aisló el test.
   - Confirmar estado de árbol limpio (`git status --short --branch`).
