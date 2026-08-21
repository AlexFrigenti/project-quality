# Plan: El índice histórico conserva la observación más reciente ante estados repetidos

## Especificación relacionada

- `specs/010-history-index-latest-observation/spec.md`

## Diseño propuesto

1. **Modificación de `buildHistoryIndex` en `scripts/collect-quality-history.mjs`**:
   - Sustituir el *last-write-wins* por una resolución determinista por contenido:
     ```javascript
     const existing = byId.get(snapshot.id);
     if (!existing || Date.parse(snapshot.generatedAt) > Date.parse(existing.generatedAt)) {
       byId.set(snapshot.id, snapshot);
     }
     ```
   - Ambos candidatos comparten identidad por construcción del `id`; elegir el de mayor `generatedAt` no altera la invariante de identidad y hace el resultado independiente del orden de entrada.

2. **Ampliación de `scripts/test-quality-history-index.mjs`**:
   - Reejecución del mismo estado con `generatedAt` posterior que comparte id con el asset histórico.
   - Escenario de producción `[actual, históricoOtro, históricoDuplicado]`: cardinalidad intacta y T2 conservado.
   - Orden inverso `[históricoOtro, históricoDuplicado, actual]`: resultado idéntico (determinismo).
   - Validación completa del índice resultante con `validateQualityHistoryIndex`.

3. **Aclaración de contrato en `QUALITY_HISTORY.md`**:
   - Documentar que ante un estado ya persistido, el índice conserva esa identidad una única vez con la fecha de generación más reciente.

## Archivos afectados

- Modificar:
  - `scripts/collect-quality-history.mjs`
  - `scripts/test-quality-history-index.mjs`
  - `QUALITY_HISTORY.md`
- Nuevos:
  - `specs/010-history-index-latest-observation/spec.md`
  - `specs/010-history-index-latest-observation/plan.md`
  - `specs/010-history-index-latest-observation/tasks.md`

## Invariantes preservadas

- Deduplicación: una única entrada por `id`.
- Orden temporal: snapshots ordenados del más reciente al más antiguo.
- Identidad: `id === snapshotId(contenido)` verificado por el validador; no se modifica la función de identidad.
- Assets inmutables: persistencia sin cambios; el índice se construye en `assemble`, antes de `history`.

## Riesgos

- Bajo: si algún consumidor dependiera implícitamente de retener la fecha antigua para estados repetidos, verá ahora la fecha de la última observación. El validador y las vistas solo requieren unicidad y orden descendente, ambas satisfechas.
