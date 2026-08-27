# Especificación T1: PQ-OX19 — Saneamiento de código muerto en histórico y hermeticidad de tests

## Clasificación
- **T1** — Refactorización de higiene técnica y hermeticidad de suite de pruebas sin alteración funcional, sin cambios en contratos públicos, schemas ni migraciones.
- **Estado**: Spec-only. Documentación aprobada; implementación no iniciada en este commit.

## Problema verificable y evidencia exacta

Tras la consolidación de la resiliencia y la unificación de la ruta productiva del histórico (PQ-OX13 a PQ-OX18), han quedado residuos de código no alcanzables y un test que ensucia el árbol de trabajo:

1. **Código muerto en [`scripts/collect-quality-history.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/collect-quality-history.mjs)**:
   - `resilientJsonFetch` ([L28-L37](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/collect-quality-history.mjs#L28-L37)): función a nivel de módulo que no se exporta ni es invocada en ninguna parte del repositorio.
   - `resilientAssetFetch` ([L39-L47](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/collect-quality-history.mjs#L39-L47)): función a nivel de módulo que no se exporta ni es invocada en ninguna parte del repositorio.
   - *Causa*: En PQ-OX16/PQ-OX18 la lógica de consulta resiliente pasó a construirse dinámicamente como closures locales dentro de `collectQualityHistory` ([L143-L167](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/collect-quality-history.mjs#L143-L167)) utilizando `withRetry` y `resilientFetch`.

2. **Código muerto y shadowing en [`scripts/persist-quality-history.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs)**:
   - `resilientGetTag` a nivel de módulo ([L32-L41](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L32-L41)): declaración externa con 4 parámetros (`tag, repo, token, deps`) que no está exportada ni tiene ninguna invocación activa.
   - `singlePostRelease` a nivel de módulo ([L43-L58](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L43-L58)): declaración externa con 6 parámetros (`repo, tag, period, token, targetCommit, deps`) que no está exportada ni tiene ninguna invocación activa.
   - `githubRequest` ([L334-L354](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L334-L354)): cliente HTTP genérico legado que no está exportado ni se utiliza tras migrar todo a `resilientFetch`, `singleAttemptFetch` y `withRetry`.
   - `uploadAsset` ([L449-L462](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L449-L462)): función legada no exportada ni invocada, sustituida íntegramente por `singleUploadAssetResilient` ([L464-L473](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L464-L473)).

3. **Falta de hermeticidad y contaminación del workspace en [`scripts/test-github-api-resilience.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/test-github-api-resilience.mjs)**:
   - El caso de prueba 10 ([L194-L201](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/test-github-api-resilience.mjs#L194-L201)) invoca `auditRepository` con `OUTPUT_FILE: 'report-${Date.now()}.json'`.
   - `auditRepository` escribe el archivo en el directorio de trabajo actual (CWD / raíz del repositorio).
   - El test no utiliza un directorio temporal (`mkdtemp`) ni limpia el archivo generado mediante un bloque `try ... finally`, dejando archivos residuales no ignorados (`report-<timestamp>.json`) tras cada ejecución de `npm test` o `node scripts/test-github-api-resilience.mjs`.

## Distinción entre funciones muertas y funciones internas activas homónimas

Es imperativo distinguir las declaraciones muertas a nivel de módulo de sus homónimas internas que sí constituyen la ruta de ejecución activa:

| Identificador | Nivel | Declaración | Estado | Uso en runtime |
| :--- | :--- | :--- | :--- | :--- |
| `resilientGetTag` | Módulo | `scripts/persist-quality-history.mjs:32-41` | **Muerta** | 0 llamadas. 4 argumentos. Eliminar. |
| `resilientGetTag` | Local | `scripts/persist-quality-history.mjs:359-370` | **Activa** | Invocada en L393, L417, L441 dentro de `getOrCreateRelease`. Cierra sobre ámbito léxico. **Mantener intacta.** |
| `singlePostRelease` | Módulo | `scripts/persist-quality-history.mjs:43-58` | **Muerta** | 0 llamadas. 6 argumentos. Eliminar. |
| `singlePostRelease` | Local | `scripts/persist-quality-history.mjs:372-389` | **Activa** | Invocada en L405, L429 dentro de `getOrCreateRelease`. Cierra sobre ámbito léxico. **Mantener intacta.** |
| `githubRequest` | Módulo | `scripts/persist-quality-history.mjs:334-354` | **Muerta** | 0 llamadas. Eliminar. |
| `uploadAsset` | Módulo | `scripts/persist-quality-history.mjs:449-462` | **Muerta** | 0 llamadas. Eliminar. |
| `singleUploadAssetResilient` | Módulo | `scripts/persist-quality-history.mjs:464-473` | **Activa** | Invocada en L503, L525 dentro de `persistSnapshot`. **Mantener intacta.** |
| `resilientJsonFetch` | Módulo | `scripts/collect-quality-history.mjs:28-37` | **Muerta** | 0 llamadas. Eliminar. |
| `resilientAssetFetch` | Módulo | `scripts/collect-quality-history.mjs:39-47` | **Muerta** | 0 llamadas. Eliminar. |

## Arquitectura objetivo

1. **[`scripts/collect-quality-history.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/collect-quality-history.mjs)**:
   - Limpieza de las funciones `resilientJsonFetch` y `resilientAssetFetch`.
   - La resolución de peticiones permanece en los closures de `collectQualityHistory` construidos con `withRetry` y `resilientFetch` sobre `deps.fetch` o los atajos legados `deps.fetchJson`/`deps.fetchAssetBody`.

2. **[`scripts/persist-quality-history.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs)**:
   - Limpieza de `resilientGetTag` (módulo), `singlePostRelease` (módulo), `githubRequest` y `uploadAsset`.
   - `getOrCreateRelease` y `persistSnapshot` mantienen sin alteraciones sus funciones internas y flujos de reconciliación en dos fases con `singleUploadAssetResilient` y `findAssetResilient`.
   - Los únicos símbolos exportados permanecen exactamente iguales: `snapshotId`, `buildQualityHistorySnapshot`, `persistSnapshot`.

3. **[`scripts/test-github-api-resilience.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/test-github-api-resilience.mjs)**:
   - El caso 10 crea un directorio temporal aislado con `await mkdtemp(join(tmpdir(), "test-github-resilience-"))`.
   - Define `OUTPUT_FILE: join(tempDir, "quality-report.json")`.
   - Ejecuta la prueba dentro de un bloque `try ... finally` que invoca `await rm(tempDir, { recursive: true, force: true })`.
   - No se modifica [`scripts/audit-repository.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/audit-repository.mjs).

## Invariantes y compatibilidad

- **Compatibilidad total con PQ-OX13, PQ-OX15, PQ-OX16, PQ-OX17 y PQ-OX18**:
  - Se preservan intactas las políticas de reintentos (`withRetry`, `resilientFetch`), backoff exponencial capado a 5s, timeouts de 10s y priorización de cabeceras `Retry-After` y `X-RateLimit-Reset`.
  - Se preserva el comportamiento estricto de POST de una sola tentativa (`singleAttemptFetch`), el límite de dos intentos con reconciliación intermedia y la prohibición de un tercer POST.
  - Se preserva la paginación completa de releases y assets (`history-pagination.mjs`).
  - Se preserva el mecanismo de cuarentena fail-closed (`history-quarantine.mjs`).
  - Se preserva la identidad semántica y el cálculo de `snapshotId`.
  - Se preservan intactos todos los esquemas JSON (`schemas/`), contratos (`quality-contract.mjs`, `dashboard-contract.mjs`) y workflows de GitHub Actions (`.github/workflows/`).

## Matriz de pruebas

| ID | Tipo | Archivo / Componente | Condición a verificar |
| :--- | :--- | :--- | :--- |
| M1 | Estática / AST | `persist-quality-history.mjs` | Ausencia de `resilientGetTag` a nivel de módulo, `singlePostRelease` a nivel de módulo, `githubRequest` y `uploadAsset`. |
| M2 | Estática / AST | `collect-quality-history.mjs` | Ausencia de `resilientJsonFetch` y `resilientAssetFetch`. |
| M3 | Hermeticidad | `test-github-api-resilience.mjs` | Ejecución del test deja `git status --porcelain` completamente vacío (sin `report-*.json` en CWD). |
| M4 | Regresión | `test-history-production-path.mjs` | Todas las 14 pruebas de ruta productiva y resiliencia pasan en verde. |
| M5 | Regresión | `test-quality-history.mjs` | Reconciliación, persistencia y límite de 2 POST pasan en verde. |
| M6 | Regresión | `test-history-api-resilience.mjs` | Tolerancia a fallos HTTP 429, 403, 503 y timeouts pasa en verde. |
| M7 | Regresión | `test-history-quarantine.mjs` | Detección de corrupción y manifiestos de cuarentena pasan en verde. |
| M8 | Integración | Suite completa del repositorio | Todos los scripts `test-*.mjs` pasan satisfactoriamente. |

## Criterios de aceptación

1. `scripts/collect-quality-history.mjs` no contiene las declaraciones `resilientJsonFetch` ni `resilientAssetFetch`.
2. `scripts/persist-quality-history.mjs` no contiene las declaraciones de nivel de módulo `resilientGetTag`, `singlePostRelease`, `githubRequest` ni `uploadAsset`.
3. Las funciones internas homónimas de `getOrCreateRelease` y `singleUploadAssetResilient` continúan funcionando exactamente igual.
4. `scripts/test-github-api-resilience.mjs` ejecuta el caso 10 en un directorio temporal aislado y garantiza su borrado en un bloque `finally`.
5. Ejecutar `node scripts/test-github-api-resilience.mjs` no genera ningún archivo residual en el árbol de trabajo.
6. La suite completa de pruebas del proyecto (`npm test` o ejecución secuencial de todos los `test-*.mjs`) pasa al 100% sin errores ni advertencias.
7. El árbol de trabajo permanece completamente limpio tras ejecutar la suite de pruebas.

## Riesgos y plan de reversión

- **Riesgo**: Eliminación inadvertida de la función interna homónima dentro de `getOrCreateRelease` en lugar de la función externa.
  - *Mitigación*: Verificación por número de línea, firma y pruebas unitarias automáticas específicas de reconciliación (`test-quality-history.mjs`).
- **Plan de reversión**: Revertir el commit único de implementación con `git revert <commit-sha>`. Al no haber cambios de esquema ni datos persistidos, el rollback es inmediato e inocuo.

## Alcance y fuera de alcance

- **En alcance**:
  - Eliminación de 6 funciones muertas confirmadas en `collect-quality-history.mjs` y `persist-quality-history.mjs`.
  - Aislamiento y limpieza con `try / finally` en el caso 10 de `scripts/test-github-api-resilience.mjs`.
- **Fuera de alcance**:
  - Modificar `scripts/audit-repository.mjs`.
  - Modificar funciones activas de persistencia, colección, paginación o resiliencia.
  - Modificar schemas, contratos o workflows de CI/CD.
  - Candidatos funcionales o mejoras futuras de PQ-OX20.
