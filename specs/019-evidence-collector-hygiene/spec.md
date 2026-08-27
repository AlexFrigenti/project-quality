# Especificación: PQ-OX20 — Higiene y consistencia de collect-quality-evidence

## Contexto y problema

En sprints anteriores se consolidaron la resiliencia de red y la arquitectura de pruebas del proyecto:
- **PQ-OX13**: Cliente HTTP base resiliente con reintentos y timeouts acotados (`scripts/github-api-request.mjs`).
- **PQ-OX15, PQ-OX16 y PQ-OX17**: Resiliencia, reconciliación y política de reintento único en la persistencia del histórico (`scripts/persist-quality-history.mjs`).
- **PQ-OX18**: Cierre contractual y consistencia de triggers del dashboard (`.github/workflows/quality-dashboard.yml` y `scripts/test-dashboard-trigger-paths.mjs`).
- **PQ-OX19**: Higiene del histórico y hermeticidad de pruebas en `scripts/persist-quality-history.mjs` y `scripts/test-github-api-resilience.mjs`.

Tras estas mejoras, una auditoría exhaustiva de [scripts/collect-quality-evidence.mjs](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/scripts/collect-quality-evidence.mjs) revela dos deudas técnicas de higiene y consistencia:

1. **Declaración huérfana no utilizada a nivel de módulo (`request`):**
   En [scripts/collect-quality-evidence.mjs:23-42](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/scripts/collect-quality-evidence.mjs#L23-L42), permanece declarada la función `async function request(path)`. Esta función:
   - No está exportada.
   - No es invocada por ninguna función de `collect-quality-evidence.mjs`.
   - No tiene referencias en ningún otro script ni suite de pruebas del repositorio.
   - Es un helper legado anterior a la implementación de la closure interna `fetchImpl` con `withRetry` ([L305-L324](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/scripts/collect-quality-evidence.mjs#L305-L324)).

2. **Inconsistencia en la resolución por defecto de `fetch` en `readArtifactJson`:**
   En [scripts/collect-quality-evidence.mjs:45](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/scripts/collect-quality-evidence.mjs#L45), la función `readArtifactJson` resuelve el cliente de red como:
   ```javascript
   const fetchImpl = deps.fetch || fetch;
   ```
   En contraste, la función principal `collectQualityEvidence` ([L300](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/scripts/collect-quality-evidence.mjs#L300)), el módulo `audit-repository.mjs` ([L92](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/scripts/audit-repository.mjs#L92)) y `persist-quality-history.mjs` ([L29](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs#L29)) utilizan de forma homogénea y explícita `deps.fetch || globalThis.fetch`.

---

## Evidencia exacta y análisis de referencias

### 1. Declaración huérfana `request` ([scripts/collect-quality-evidence.mjs:23-42](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/scripts/collect-quality-evidence.mjs#L23-L42))
```javascript
async function request(path) {
  try {
    const response = await resilientFetch(apiUrl(path), { headers });
    let data = response.data;
    if (data === undefined) {
      try {
        data = await response.json();
      } catch {
        data = null;
      }
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: { message: String(error instanceof Error ? error.message : error).slice(0, 200) }
    };
  }
}
```
- **Llamadas dentro de `collect-quality-evidence.mjs`**: 0.
- **Exportaciones**: Ninguna.
- **Ruta real de llamadas en `collectQualityEvidence`**:
  - `collectQualityEvidence` instancia `resilientDeps` con `deps.fetch || globalThis.fetch`.
  - Define localmente `fetchImpl(path)` que envuelve la llamada en `withRetry(operation, resilientDeps)` y usa `resilientFetch` cuando no se inyecta `deps.fetch`.
  - Las paginaciones de workflow runs (L335) y de artifacts (L247 en `evaluateLatestRun`) pasan exclusivamente por esa closure `fetchImpl`.
  - La descarga de ZIP en `readArtifactJson` (L54) invoca directamente `resilientFetch(archiveUrl, { headers }, resilientDeps)`.
  - Por lo tanto, `request` está completamente desconectada del runtime.

### 2. Resolución de `fetch` en `readArtifactJson` ([scripts/collect-quality-evidence.mjs:45](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/scripts/collect-quality-evidence.mjs#L45))
```javascript
export async function readArtifactJson(artifact, repository, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const resilientDeps = {
    fetch: fetchImpl,
    sleep: deps.sleep,
    now: deps.now,
    config: deps.config
  };
  // ...
}
```
- **Inconsistencia**: `fetch` global directo en lugar de `globalThis.fetch`.
- **Estandarización requerida**: `const fetchImpl = deps.fetch || globalThis.fetch;`.

---

## Cadena efectiva de llamadas en producción

```
collectQualityEvidence({ repository, defaultBranch, currentCommitSha, ... })
  │
  ├─► fetchImpl(runsPath)
  │     └─► withRetry(operation)
  │           └─► resilientFetch(apiUrl(path), { headers }, resilientDeps)
  │
  └─► evaluateLatestRun(latestRun, ...)
        │
        ├─► fetchImpl(artifactsPath) [paginado]
        │     └─► withRetry(operation)
        │           └─► resilientFetch(apiUrl(path), { headers }, resilientDeps)
        │
        └─► readArtifact(artifact, repository)
              └─► readArtifactJson(artifact, repository, deps)
                    └─► resilientFetch(archiveUrl, { headers }, resilientDeps)
                          └─► deps.fetch || globalThis.fetch
```

---

## Arquitectura objetivo

1. **Limpieza de código muerto:**
   - Eliminar completamente la declaración huérfana de nivel de módulo `async function request(path)` de [scripts/collect-quality-evidence.mjs](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/scripts/collect-quality-evidence.mjs).
   - Preservar todas las funciones exportadas: `readArtifactJson`, `sanitizeQualityMetrics`, `buildQualitySummary`, `pendingQualityEvidence` y `collectQualityEvidence`.
   - Preservar la closure activa `fetchImpl` con `withRetry` dentro de `collectQualityEvidence`.

2. **Normalización de `globalThis.fetch`:**
   - En `readArtifactJson`, sustituir `deps.fetch || fetch` por `deps.fetch || globalThis.fetch`.

3. **Guarda contractual en `scripts/test-quality-evidence.mjs`:**
   - Añadir una guarda estática que verifique:
     - Que `scripts/collect-quality-evidence.mjs` no contiene ninguna declaración `async function request` ni `function request`.
     - Que `readArtifactJson` usa explícitamente `deps.fetch || globalThis.fetch`.
     - Que las rutas funcionales y activas siguen pasando al 100%.

---

## Invariantes

- **Invariante 1 (Compatibilidad de red y resiliencia):** El comportamiento ante fallos transitorios, reintentos con backoff exponencial, timeouts acotados y sanitización de cabeceras/mensajes (`github-api-request.mjs`) no se altera.
- **Invariante 2 (Contratos de evidencia y evaluación):** Las reglas de precedencia de runs, candidate rejection, verificación de default branch, coincidencia de commit SHA, lectura y descompresión de ZIP (`zip-entry-reader.mjs`), límites de tamaño de artefacto (10 MB) y estructura de salida de `collectQualityEvidence` permanecen idénticas.
- **Invariante 3 (Sanitización y validación de métricas):** Las funciones `sanitizeQualityMetrics`, `buildQualitySummary` y `pendingQualityEvidence` no sufren cambios funcionales.
- **Invariante 4 (Schemas y Workflows):** Ningún schema JSON (`schemas/*.json`) ni workflow (`.github/workflows/*.yml`) es modificado.
- **Invariante 5 (Otros scripts productivos):** `scripts/audit-repository.mjs`, `scripts/persist-quality-history.mjs`, `scripts/collect-quality-history.mjs` y `scripts/github-api-request.mjs` no se modifican.

---

## Matriz de pruebas

| Identificador | Nivel | Componente | Descripción |
| :--- | :--- | :--- | :--- |
| **M1** | Estático | `test-quality-evidence.mjs` | Verifica que `collect-quality-evidence.mjs` no declara la función huérfana `request`. |
| **M2** | Estático | `test-quality-evidence.mjs` | Verifica que `readArtifactJson` usa `globalThis.fetch` por defecto. |
| **M3** | Contrato / Unitario | `test-quality-evidence.mjs` | Verifica que `readArtifactJson` descarga y extrae correctamente `quality-metrics.json` usando `resilientFetch`. |
| **M4** | Contrato / Unitario | `test-quality-evidence.mjs` | Verifica que `collectQualityEvidence` ejecuta correctamente la paginación de runs y artifacts con `withRetry`. |
| **M5** | Contrato / Unitario | `test-quality-evidence.mjs` | Verifica la lectura portable de ZIP sin depender del binario `unzip`. |
| **M6** | Integración | Suite completa (18 suites) | Todas las suites `scripts/test-*.mjs` pasan con código de salida 0. |
| **M7** | Sintaxis y esquemas | Todo el repositorio | `node --check scripts/*.mjs` y validación de schemas JSON sin errores. |

---

## Criterios de aceptación

1. La función huérfana de nivel de módulo `request` no está presente en [scripts/collect-quality-evidence.mjs](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/scripts/collect-quality-evidence.mjs).
2. `readArtifactJson` utiliza `globalThis.fetch` cuando `deps.fetch` no es provisto.
3. Se añade la guarda estática en [scripts/test-quality-evidence.mjs](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/scripts/test-quality-evidence.mjs) previniendo regresiones.
4. Las 18 suites de tests del repositorio se ejecutan y pasan limpias en verde.
5. El diff frente a `origin/main` contiene estrictamente los archivos documentados y aprobados.

---

## Riesgos y mitigación

- **Riesgo:** Confundir la función huérfana de módulo `request` con alguna función homónima o método en otros archivos.
  - *Mitigación:* La función solo existe en `collect-quality-evidence.mjs` a nivel de módulo. La función `request` en `audit-repository.mjs` es una closure interna activa dentro de `auditRepository` y no debe tocarse.
- **Riesgo:** Alterar el comportamiento de inyección de dependencias `deps.fetch`.
  - *Mitigación:* Se preserva estrictamente la prioridad `deps.fetch || globalThis.fetch`, compatible con todos los mocks existentes en los tests.

---

## Alcance y fuera de alcance

### Dentro de alcance:
- Eliminar la declaración huérfana `request` en `scripts/collect-quality-evidence.mjs`.
- Cambiar `fetch` por `globalThis.fetch` en `readArtifactJson` de `scripts/collect-quality-evidence.mjs`.
- Añadir la guarda estática en `scripts/test-quality-evidence.mjs`.
- Documentación del sprint en `specs/019-evidence-collector-hygiene/`.

### Fuera de alcance:
- Modificar `scripts/audit-repository.mjs`.
- Modificar `scripts/github-api-request.mjs`.
- Modificar la lógica de paginación de runs o artifacts.
- Modificar schemas, workflows o perfiles de auditoría.
- Añadir suites o funcionalidades nuevas (como la cobertura de `static-quality.yml`).
