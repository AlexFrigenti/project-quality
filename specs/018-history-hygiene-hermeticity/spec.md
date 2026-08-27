# Especificación T1: PQ-OX19 — Saneamiento de código muerto en persistencia de histórico y hermeticidad de tests

## Clasificación
- **T1** — Refactorización de higiene técnica y hermeticidad de suite de pruebas sin alteración funcional, sin cambios en contratos públicos, schemas ni migraciones.
- **Estado**: Spec-only. Corrección de alcance aprobada; implementación no iniciada en este commit.

## Problema verificable y evidencia exacta

Tras la consolidación de la resiliencia y la unificación de la ruta productiva del histórico (PQ-OX13 a PQ-OX18), han quedado cuatro residuos de código no alcanzables en la persistencia y un test que ensucia el árbol de trabajo:

1. **Código muerto y shadowing en [`scripts/persist-quality-history.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs)**:
   - `resilientGetTag` a nivel de módulo ([L32-L38](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L32-L38)): declaración externa con 4 parámetros (`tag, repo, token, deps`) que no está exportada ni tiene ninguna invocación activa.
   - `singlePostRelease` a nivel de módulo ([L40-L55](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L40-L55)): declaración externa con 6 parámetros (`repo, tag, period, token, targetCommit, deps`) que no está exportada ni tiene ninguna invocación activa.
   - `githubRequest` ([L328-L348](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L328-L348)): cliente HTTP genérico legado que no está exportado ni se utiliza tras migrar todo a `resilientFetch`, `singleAttemptFetch` y `withRetry`.
   - `uploadAsset` ([L440-L453](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L440-L453)): función legada no exportada ni invocada, sustituida íntegramente por `singleUploadAssetResilient` ([L455-L464](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L455-L464)).

2. **Falta de hermeticidad y contaminación del workspace en [`scripts/test-github-api-resilience.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/test-github-api-resilience.mjs)**:
   - El caso de prueba 10 ([L186-L201](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/test-github-api-resilience.mjs#L186-L201)) invoca `auditRepository` con `OUTPUT_FILE: 'report-${Date.now()}.json'`.
   - `auditRepository` escribe el archivo en el directorio de trabajo actual (CWD / raíz del repositorio).
   - El test no utiliza un directorio temporal (`mkdtemp`) ni limpia el archivo generado mediante un bloque `try ... finally`, dejando archivos residuales no ignorados (`report-<timestamp>.json`) tras cada ejecución de `npm test` o `node scripts/test-github-api-resilience.mjs`.

## Distinción entre funciones muertas y funciones activas (colección y persistencia)

Es imperativo distinguir las declaraciones muertas de las funciones que sí constituyen la ruta de ejecución activa:

| Identificador | Archivo / Ubicación | Ámbito | Estado | Uso en runtime |
| :--- | :--- | :--- | :--- | :--- |
| `resilientJsonFetch` | [`collect-quality-history.mjs:28-37`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/collect-quality-history.mjs#L28-L37) | Módulo | **Activa** | Invocada en [L145](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/collect-quality-history.mjs#L145) por `collectQualityHistory`. **Mantener intacta.** |
| `resilientAssetFetch` | [`collect-quality-history.mjs:39-47`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/collect-quality-history.mjs#L39-L47) | Módulo | **Activa** | Invocada en [L149](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/collect-quality-history.mjs#L149) por `collectQualityHistory`. **Mantener intacta.** |
| `resilientGetTag` | [`persist-quality-history.mjs:32-38`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L32-L38) | Módulo | **Muerta** | 0 llamadas. 4 argumentos (`tag, repo, token, deps`). **Eliminar.** |
| `resilientGetTag` | [`persist-quality-history.mjs:353-361`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L353-L361) | Local | **Activa** | Invocada en L384, L408, L432 dentro de `getOrCreateRelease`. Cierra sobre ámbito léxico. **Mantener intacta.** |
| `singlePostRelease` | [`persist-quality-history.mjs:40-55`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L40-L55) | Módulo | **Muerta** | 0 llamadas. 6 argumentos (`repo, tag, period, token, targetCommit, deps`). **Eliminar.** |
| `singlePostRelease` | [`persist-quality-history.mjs:363-380`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L363-L380) | Local | **Activa** | Invocada en L396, L420 dentro de `getOrCreateRelease`. Cierra sobre ámbito léxico. **Mantener intacta.** |
| `githubRequest` | [`persist-quality-history.mjs:328-348`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L328-L348) | Módulo | **Muerta** | 0 llamadas. **Eliminar.** |
| `uploadAsset` | [`persist-quality-history.mjs:440-453`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L440-L453) | Módulo | **Muerta** | 0 llamadas. **Eliminar.** |
| `singleUploadAssetResilient` | [`persist-quality-history.mjs:455-464`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L455-L464) | Módulo | **Activa** | Invocada en L494, L516 dentro de `persistSnapshot`. **Mantener intacta.** |

## Arquitectura objetivo

1. **[`scripts/collect-quality-history.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/collect-quality-history.mjs)**:
   - **Fuera de alcance**: No se modifica ningún helper ni línea de este archivo. `resilientJsonFetch` y `resilientAssetFetch` se preservan íntegras como funciones activas utilizadas por `collectQualityHistory`. No se realiza inlining.

2. **[`scripts/persist-quality-history.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs)**:
   - Eliminación exclusiva de las cuatro funciones muertas: `resilientGetTag` (módulo), `singlePostRelease` (módulo), `githubRequest` y `uploadAsset`.
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
  - Se preserva la colección de histórico mediante `resilientJsonFetch` y `resilientAssetFetch` y la paginación completa de releases y assets (`history-pagination.mjs`).
  - Se preserva el mecanismo de cuarentena fail-closed (`history-quarantine.mjs`).
  - Se preserva la identidad semántica y el cálculo de `snapshotId`.
  - Se preservan intactos todos los esquemas JSON (`schemas/`), contratos (`quality-contract.mjs`, `dashboard-contract.mjs`) y workflows de GitHub Actions (`.github/workflows/`).

## Matriz de pruebas

| ID | Tipo | Archivo / Componente | Condición a verificar |
| :--- | :--- | :--- | :--- |
| M1 | Estática / AST | `persist-quality-history.mjs` | Ausencia de `resilientGetTag` a nivel de módulo, `singlePostRelease` a nivel de módulo, `githubRequest` y `uploadAsset`. |
| M2 | Estática / AST | `collect-quality-history.mjs` | Presencia continua y uso de `resilientJsonFetch` y `resilientAssetFetch` en `collectQualityHistory`. |
| M3 | Hermeticidad | `test-github-api-resilience.mjs` | Ejecución del test deja `git status --porcelain` completamente vacío (sin `report-*.json` en CWD). |
| M4 | Regresión | `test-history-production-path.mjs` | Todas las pruebas de ruta productiva y resiliencia pasan en verde con `deps.fetch`. |
| M5 | Regresión | `test-quality-history.mjs` | Reconciliación, persistencia y límite de 2 POST pasan en verde. |
| M6 | Regresión | `test-history-api-resilience.mjs` | Tolerancia a fallos HTTP 429, 403, 503 y timeouts pasa en verde. |
| M7 | Regresión | `test-history-quarantine.mjs` | Detección de corrupción y manifiestos de cuarentena pasan en verde. |
| M8 | Integración | Suite completa del repositorio | Todos los scripts `test-*.mjs` pasan satisfactoriamente. |

## Criterios de aceptación

1. `scripts/persist-quality-history.mjs` no contiene las declaraciones de nivel de módulo `resilientGetTag`, `singlePostRelease`, `githubRequest` ni `uploadAsset`.
2. `scripts/collect-quality-history.mjs` mantiene intactas las funciones `resilientJsonFetch` y `resilientAssetFetch` y sus invocaciones activas en `collectQualityHistory`.
3. Las funciones internas homónimas de `getOrCreateRelease` y `singleUploadAssetResilient` continúan funcionando exactamente igual en `persist-quality-history.mjs`.
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
  - Eliminación de las cuatro funciones muertas confirmadas en `persist-quality-history.mjs` (`resilientGetTag` módulo, `singlePostRelease` módulo, `githubRequest`, `uploadAsset`).
  - Aislamiento y limpieza con `try / finally` en el caso 10 de `scripts/test-github-api-resilience.mjs`.
- **Fuera de alcance**:
  - Modificar `scripts/collect-quality-history.mjs` (`resilientJsonFetch` y `resilientAssetFetch` son activas).
  - Modificar `scripts/audit-repository.mjs`.
  - Modificar funciones activas de persistencia, colección, paginación o resiliencia.
  - Modificar schemas, contratos o workflows de CI/CD.
  - Candidatos funcionales o mejoras futuras de PQ-OX20.
