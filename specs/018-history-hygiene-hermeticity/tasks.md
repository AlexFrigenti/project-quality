# Tareas de Implementación: PQ-OX19 — Saneamiento de código muerto en histórico y hermeticidad de tests

- [ ] **T01: Fase RED — Comprobación estática de código muerto y detección de artefactos en tests**
  - [ ] Verificar estáticamente la presencia de funciones huérfanas en `collect-quality-history.mjs` y `persist-quality-history.mjs`.
  - [ ] Ejecutar `node scripts/test-github-api-resilience.mjs` y constatar la creación de `report-*.json` en el directorio de trabajo.

- [ ] **T02: Fase GREEN — Saneamiento de código muerto en `collect-quality-history.mjs`**
  - [ ] Eliminar la función `resilientJsonFetch` ([L28-L37](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/collect-quality-history.mjs#L28-L37)).
  - [ ] Eliminar la función `resilientAssetFetch` ([L39-L47](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/collect-quality-history.mjs#L39-L47)).

- [ ] **T03: Fase GREEN — Saneamiento de código muerto en `persist-quality-history.mjs`**
  - [ ] Eliminar la función `resilientGetTag` a nivel de módulo ([L32-L41](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L32-L41)).
  - [ ] Eliminar la función `singlePostRelease` a nivel de módulo ([L43-L58](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L43-L58)).
  - [ ] Eliminar la función `githubRequest` ([L334-L354](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L334-L354)).
  - [ ] Eliminar la función `uploadAsset` ([L449-L462](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L449-L462)).
  - [ ] Confirmar que las funciones homónimas internas `resilientGetTag` ([L359-L370](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L359-L370)) y `singlePostRelease` ([L372-L389](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L372-L389)) y la función activa `singleUploadAssetResilient` ([L464-L473](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L464-L473)) permanecen intactas.

- [ ] **T04: Fase GREEN — Hermetismo y aislamiento temporal en `test-github-api-resilience.mjs`**
  - [ ] Importar utilidades de sistema de archivos y rutas (`mkdtemp`, `rm` desde `node:fs/promises`, `tmpdir` desde `node:os`, `join` desde `node:path`).
  - [ ] En el caso 10, instanciar un directorio temporal aislado con `mkdtemp`.
  - [ ] Configurar `OUTPUT_FILE` apuntando al interior del directorio temporal.
  - [ ] Implementar bloque `try ... finally` para garantizar la eliminación recursiva del directorio temporal.
  - [ ] No realizar cambios en `scripts/audit-repository.mjs`.

- [ ] **T05: Verificación de árbol limpio y suites completas de pruebas**
  - [ ] Ejecutar `node scripts/test-github-api-resilience.mjs` y verificar `git status --porcelain` limpio.
  - [ ] Ejecutar `node scripts/test-history-production-path.mjs` (14 pruebas de ruta productiva).
  - [ ] Ejecutar `node scripts/test-quality-history.mjs` (reconciliación y persistencia).
  - [ ] Ejecutar `node scripts/test-history-api-resilience.mjs` (resiliencia de API).
  - [ ] Ejecutar `node scripts/test-history-quarantine.mjs` (cuarentena de histórico).
  - [ ] Ejecutar el resto de tests del proyecto (`npm test` o batería completa).

- [ ] **T06: Verificación de diff y commit final de implementación**
  - [ ] Validar ausencia de errores de sintaxis o espacios (`git diff --check`).
  - [ ] Validar diff exacto contra `origin/main` (`git diff --name-only origin/main...HEAD`).
  - [ ] Generar commit atómico de implementación.
