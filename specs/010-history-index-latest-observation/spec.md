# Especificación: El índice histórico conserva la observación más reciente ante estados repetidos

## Contexto y problema

Se reportó un comportamiento intermitente en el histórico de calidad: tras generar correctamente un snapshot para la ejecución actual, el índice histórico (`history.json`) puede no reflejar esa ejecución como la observación más reciente que debería conservarse.

La identidad del snapshot (`snapshotId`, sha256 de `identityFor`) excluye deliberadamente `generatedAt` y `dashboardCommitSha` para que una reejecución del mismo estado reutilice el asset persistido ("una reejecución del mismo estado no crea otro asset", QUALITY_HISTORY.md). Por ello, cuando la ejecución actual vuelve a observar un estado ya persistido en un release histórico, existen dos snapshots válidos con el mismo `id` pero distinto `generatedAt`: el actual (reciente) y el descargado del asset (antiguo).

`buildHistoryIndex` deduplicaba mediante `Map.set` en orden de llegada (*last-write-wins*). Como `collectQualityHistory` antepone el snapshot actual a los assets históricos descargados, la copia obsoleta sobrescribía a la reciente y el índice mostraba ese estado con su fecha antigua, sin reflejar la ejecución actual.

## Causa raíz confirmada

Deduplicación dependiente del orden de entrada en `buildHistoryIndex` (`scripts/collect-quality-history.mjs`), no del contenido. Demostrado con el mismo conjunto de datos: `[actual(T2), histórico(T1)]` producía T1, mientras que `[histórico(T1), actual(T2)]` producía T2.

## Objetivos

1. La deduplicación del índice debe ser determinista respecto al contenido: ante ids duplicados se conserva la entrada con `generatedAt` más reciente, sea cual sea el orden de entrada.
2. Preservar las invariantes existentes: una entrada por id, orden descendente por `generatedAt` e identidad verificable (`id === snapshotId(content)`).
3. Añadir una prueba de regresión que capture el escenario de producción (snapshot actual + asset histórico obsoleto con la misma identidad).

## Exclusiones explícitas

- No se modifican `snapshotId` ni `identityFor` en `scripts/persist-quality-history.mjs`.
- No se modifican esquemas JSON ni los validadores.
- No se modifica el orden de jobs del workflow ni la semántica de persistencia de assets inmutables.
- No se aborda el fallo preexistente de `test-node-quality-workflow.mjs` (fin de línea CRLF), ajeno a este alcance.

## Criterios de aceptación

- [ ] **CA1**: Ante snapshots con id duplicado, `buildHistoryIndex` conserva exactamente una entrada y es la de `generatedAt` más reciente, independientemente del orden de entrada.
- [ ] **CA2**: En el escenario de producción (snapshot actual T2 antepuesto a un asset histórico T1 con el mismo id), el índice refleja T2 como observación conservada.
- [ ] **CA3**: `validateQualityHistoryIndex` continúa aceptando el índice resultante (unicidad de ids, orden descendente, identidad coincidente) y rechaza duplicados.
- [ ] **CA4**: Las suites relacionadas del repositorio pasan, salvo la deuda preexistente documentada.
