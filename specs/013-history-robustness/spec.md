# Especificación: PQ-OX07 — Robustez del histórico persistente

## Contexto

Base: `main` `39228aba1f65bc8be6d6d2038c07ad0e0fc9e95b`. Hallazgos revalidados en esa base:

1. `collect-quality-history.mjs` aborta con un error genérico cuando falla un asset histórico, sin manifest estructurada de cuarentena ni evidencia de diagnóstico.
2. Los assets cuyo nombre no coincide con el patrón esperado se filtran silenciosamente.
3. Releases: máximo 20 páginas. Assets: solo la primera página de 100 elementos.
4. `buildHistoryIndex` usa `Map.set`, por lo que el representante de un id repetido depende del orden de llegada.
5. `persistSnapshot` solo busca el asset en el release mensual actual, permitiendo duplicados del mismo id entre releases.
6. No existe pruning automático y no debe introducirse en este sprint.

## Objetivo

Hacer robusto el histórico persistente ante assets corruptos o parcialmente ilegibles, respuestas paginadas incompletas, duplicados semánticos en distinto orden y reejecuciones mensuales de una misma identidad. Regla principal **fail-closed**: si existe corrupción histórica verificable, no se publica un `history.json` parcial que pueda parecer íntegro.

## Alcance aprobado

### A. Cuarentena no destructiva
- Módulo dedicado (`scripts/history-quarantine.mjs`) con contrato cerrado versionado (`schemaVersion: 1`) y schema propio (`schemas/quality-history-quarantine.schema.json`).
- Entradas por asset problemático del namespace `quality-snapshot-*` con razón tipada: `invalid-name`, `download-failed`, `invalid-json`, `invalid-snapshot`, `asset-id-mismatch`.
- Detalles acotados y sanitizados: sin URLs, tokens, headers ni cuerpos de respuesta.
- Con entradas: se escribe `site/history-quarantine.json`, la colección termina con código distinto de cero, no se genera índice parcial, el workflow sube la manifest como artifact de diagnóstico y `history`/`deploy` permanecen bloqueados por el fallo de `assemble`.
- Los assets ajenos al namespace histórico no son snapshots: se ignoran deliberadamente, sin semántica de snapshot y sin borrado.

### B. Paginación completa
- Frontera de red inyectable para pruebas (`fetchImpl`).
- Releases: todas las páginas hasta página vacía/incompleta, conservando el filtro `quality-history-YYYY-MM`.
- Assets: todas las páginas por release hasta página vacía/incompleta.
- Límite interno de seguridad superado ⇒ fallo explícito; nunca truncamiento silencioso.

### C. Deduplicación determinista del índice
- `buildHistoryIndex(snapshots, { now })` conserva su firma.
- Para ids repetidos gana: mayor `generatedAt`; en empate, el JSON canónico (claves ordenadas) menor lexicográficamente.
- Selección independiente del orden de entrada, válida con legacy v1 y semantic v2, sin mutar las entradas.

### D. Deduplicación global de persistencia
- Antes de crear el release mensual actual, se busca `quality-snapshot-<id>.json` en todos los releases históricos paginados.
- Si existe: `created: false`, no se crea release ni se hace upload, y se informa del release que ya contiene el asset.
- Si el asset remoto existe pero está corrupto, no se reemplaza: la colección posterior lo pondrá en cuarentena.
- No se usa ningún método DELETE.

### E. Retención
- Sin pruning. La retención es indefinida hasta que exista una decisión explícita con política, alcance, reversión y compatibilidad histórica.

### F. Workflow y documentación
- `quality-dashboard.yml`: subida condicional de `site/history-quarantine.json` con `if: always()` e `if-no-files-found: ignore`, sin relajar los guards de `history` y `deploy`.
- `QUALITY_HISTORY.md`: cuarentena fail-closed, paginación completa, deduplicaciones determinista y entre releases, retención indefinida sin pruning automático.

## Invariantes

1. Ningún asset histórico se borra, renombra, reescribe o sustituye.
2. Ningún `history.json` parcial se publica ante corrupción verificable.
3. El contrato HTTP/CLI existente se conserva (mensajes, códigos y forma del resultado de `persistSnapshot` ampliada solo aditivamente).
4. Los tests no dependen de la red real: la frontera `fetch` es inyectable.
5. Los snapshots legacy v1 conservan su identidad literal; v2 su identidad semántica.

## Criterios de aceptación

Cada caso mínimo del plan tiene prueba RED observada antes del código y GREEN después; las suites `scripts/test-*.mjs` terminan en 0; `git diff --check` limpio; el diff se limita a PQ-OX07.

## Riesgos y exclusiones

- Sin política de retención ni recuperación de assets corruptos: quedan en cuarentena lógica indefinida.
- La corrección de un asset corrupto requiere decisión humana externa a este sprint.
- Los límites internos de paginación son de seguridad: superarlos es fallo explícito, nunca truncamiento silencioso.
