# Plan: Alineación de additionalProperties en quality-metrics

## Especificación relacionada

- `specs/005-quality-metrics-additional-properties/spec.md`

## Diseño propuesto

1. **Tests Primero en `scripts/test-quality-metrics.mjs`**:
   - Incorporar pruebas negativas que intenten validar reportes con propiedades desconocidas inyectadas en:
     - Raíz (`extraRoot`)
     - `project` (`extraProject`)
     - `commit` (`extraCommit`)
     - `run` (`extraRun`)
     - `standard` (`extraStandard`)
     - `gates[0]` (`extraGate`)
     - `evidence[0]` (`extraEvidence`)
     - `gates[0].evidence[0]` (`extraGateEvidence`)
   - Verificar que los mensajes de error contienen la ruta exacta del campo (`no está permitido`).
   - Incorporar pruebas positivas para validar la extensibilidad de `metrics`:
     - Métrica numérica directa (`custom_metric: 42`)
     - Métrica anidada con guiones (`custom-suite: { sub_feature: 99 }`)
   - Ejecutar la suite para comprobar el fallo esperado (estado RED).

2. **Modificación de `scripts/validate-quality-metrics.mjs`**:
   - Definir los `Set` inmutables de claves permitidas:
     - `ROOT_KEYS = new Set(["schemaVersion", "project", "commit", "run", "standard", "conclusion", "gates", "metrics", "evidence"])`
     - `PROJECT_KEYS = new Set(["id", "name", "repository", "kind"])`
     - `COMMIT_KEYS = new Set(["sha", "ref", "branch", "event"])`
     - `RUN_KEYS = new Set(["workflow", "id", "attempt", "startedAt", "completedAt", "url"])`
     - `STANDARD_KEYS = new Set(["version", "sha"])`
     - `GATE_KEYS = new Set(["id", "label", "applicability", "status", "details", "evidence"])`
     - `EVIDENCE_KEYS = new Set(["kind", "label", "url"])`
   - Implementar función helper:
     ```javascript
     function keys(value, allowed, path) {
       for (const key of Object.keys(value)) {
         if (!allowed.has(key)) fail(path + "." + key + " no está permitido");
       }
     }
     ```
   - Invocar `keys()` en la raíz, en `ensureEvidence`, en `ensureGate` / bucle de gates, y en cada sub-objeto de `project`, `commit`, `run` y `standard`.
   - Mantener intacto el procesamiento dinámico en `ensureMetricValue` y en el bucle de `metrics`.

3. **Verificación y validación**:
   - Ejecutar las 6 suites de validación del proyecto para asegurar cero regresiones.

## Archivos afectados

- Modificar:
  - `scripts/test-quality-metrics.mjs`
  - `scripts/validate-quality-metrics.mjs`
- Nuevos:
  - `specs/005-quality-metrics-additional-properties/spec.md`
  - `specs/005-quality-metrics-additional-properties/plan.md`
  - `specs/005-quality-metrics-additional-properties/tasks.md`
