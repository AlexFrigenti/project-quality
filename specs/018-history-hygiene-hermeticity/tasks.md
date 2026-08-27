# Tareas de Implementación: PQ-OX19 — Saneamiento de código muerto en persistencia de histórico y hermeticidad de tests

- [ ] **T01: Fase RED — Comprobación estática de cuatro funciones muertas, preservación de colección y detección de artefactos en tests**
  - [ ] Añadir guarda estática en `scripts/test-history-production-path.mjs` que verifique la ausencia de las 4 funciones huérfanas en `persist-quality-history.mjs` (`githubRequest`, `uploadAsset`, `resilientGetTag` módulo, `singlePostRelease` módulo) y la presencia activa de `resilientJsonFetch` y `resilientAssetFetch` en `collect-quality-history.mjs`.
  - [ ] Ejecutar `node scripts/test-history-production-path.mjs` y constatar el fallo RED por presencia de las 4 funciones en `persist-quality-history.mjs`.
  - [ ] Ejecutar `node scripts/test-github-api-resilience.mjs` y constatar la creación de `report-*.json` en el directorio de trabajo.

- [ ] **T02: Fase GREEN — Saneamiento de cuatro funciones muertas en `persist-quality-history.mjs`**
  - [ ] Eliminar la función `resilientGetTag` a nivel de módulo ([L32-L38](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L32-L38)).
  - [ ] Eliminar la función `singlePostRelease` a nivel de módulo ([L40-L55](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L40-L55)).
  - [ ] Eliminar la función `githubRequest` ([L328-L348](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L328-L348)).
  - [ ] Eliminar la función `uploadAsset` ([L440-L453](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L440-L453)).
  - [ ] Confirmar que las funciones homónimas internas `resilientGetTag` ([L353-L361](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L353-L361)) y `singlePostRelease` ([L363-L380](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L363-L380)) y la función activa `singleUploadAssetResilient` ([L455-L464](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L455-L464)) permanecen intactas.
  - [ ] Confirmar que `scripts/collect-quality-history.mjs` permanece intacto sin modificaciones.

- [ ] **T03: Fase GREEN — Hermetismo y aislamiento temporal en `test-github-api-resilience.mjs`**
  - [ ] Importar utilidades de sistema de archivos y rutas (`mkdtemp`, `rm` desde `node:fs/promises`, `tmpdir` desde `node:os`, `join` desde `node:path`).
  - [ ] En el caso 10, instanciar un directorio temporal aislado con `mkdtemp`.
  - [ ] Configurar `OUTPUT_FILE` apuntando al interior del directorio temporal.
  - [ ] Implementar bloque `try ... finally` para garantizar la eliminación recursiva del directorio temporal.
  - [ ] No realizar cambios en `scripts/audit-repository.mjs`.

- [ ] **T04: Verificación de árbol limpio y suites completas de pruebas**
  - [ ] Ejecutar `node scripts/test-history-production-path.mjs` y verificar paso a GREEN.
  - [ ] Ejecutar `node scripts/test-github-api-resilience.mjs` y verificar `git status --porcelain` limpio.
  - [ ] Ejecutar `node scripts/test-quality-history.mjs` (reconciliación y persistencia).
  - [ ] Ejecutar `node scripts/test-history-api-resilience.mjs` (resiliencia de API).
  - [ ] Ejecutar `node scripts/test-history-quarantine.mjs` (cuarentena de histórico).
  - [ ] Ejecutar el resto de tests del proyecto (`npm test` o batería completa).

- [ ] **T05: Verificación de diff y commit final de implementación**
  - [ ] Validar ausencia de errores de sintaxis o espacios (`git diff --check`).
  - [ ] Validar diff exacto contra `origin/main` (`git diff --name-only origin/main...HEAD`).
  - [ ] Generar commit atómico de implementación.
