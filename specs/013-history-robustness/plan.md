# Plan: Robustez del histórico persistente (PQ-OX07)

## Enfoque

T2 con TDD estricto por grupos: prueba mínima → RED observado → implementación mínima → GREEN → refactor. Commits pequeños por grupo.

## Grupos y pasos

1. **Contrato de cuarentena** (commit `feat: add historical asset quarantine manifest contract`)
   - `schemas/quality-history-quarantine.schema.json` (contrato cerrado).
   - `scripts/history-quarantine.mjs`: razones, sanitización de detalle, validación de manifest.
   - `scripts/test-history-quarantine.mjs`: RED primero.
2. **Colección fail-closed + paginación completa** (commit `feat: quarantine corrupt history assets and paginate collection`)
   - `scripts/history-pagination.mjs`: límites y recorrido hasta página incompleta, inyectable.
   - Patrones de release/asset movidos a `quality-contract.mjs`.
   - Refactor de `collectQualityHistory` con seam `deps` (`fetchJson`, `fetchAssetBody`), evaluación por asset con entradas de cuarentena, sin índice parcial; `main()` escribe manifest y sale ≠ 0.
   - Workflow: subida condicional de la manifest + paths triggers.
3. **Deduplicación determinista del índice** (commit `fix: make history deduplication deterministic`)
   - `canonicalJson` promovida a `quality-contract.mjs`; `buildHistoryIndex` con comparador determinista; tests de permutación y empate.
4. **Deduplicación global de persistencia** (commit `fix: avoid duplicate history assets across releases`)
   - Búsqueda global previa en `persistSnapshot` con seam `deps.request/upload`; tests con fakes.
5. **Documentación** (commit `docs: document history quarantine and retention policy`)
   - `QUALITY_HISTORY.md`: cuarentena, fail-closed, paginación completa, deduplicaciones, retención indefinida sin pruning.

## Invariantes

- Ningún DELETE ni sustitución/renombrado de assets o releases.
- Sin entradas de cuarentena el índice es idéntico en contenido al pipeline anterior.
- La identidad legacy v1 y semantic v2 no cambian.
- Los snapshots de entrada a `buildHistoryIndex` no se mutan.

## Compatibilidad

- `history.json` y snapshots conservan forma; nueva pieza opcional `history-quarantine.json` solo ante corrupción.
- `collectQualityHistory` cambia su retorno interno ({ok, index|quarantine}); único consumidor es su propio `main()`.

## Reversión

Revertir los commits del sprint restaura el comportamiento anterior; no hay migraciones ni datos persistentes nuevos.
