# Plan — PQ-OX07 Robustez del histórico persistente

## Diseño

### A. Cuarentena (`scripts/history-quarantine.mjs` + schema + test)

- `QUARANTINE_REASONS`: enum cerrado de las cinco razones aprobadas.
- `isSnapshotNamespaceName(name)`: `quality-snapshot-*.json`; cualquier otro nombre no es snapshot y se ignora sin semántica.
- `sanitizeDetail(value)`: recorta a 240 caracteres, elimina URLs (`http(s)://…`), patrones de token y colapsa espacios.
- `buildQuarantineManifest(entries, { now })` y `validateQuarantineManifest(manifest)`: contrato cerrado espejo del schema (campos exactos, razón tipada, `releaseTag` con patrón mensual, fechas RFC3339, límites de longitud).

Schema `schemas/quality-history-quarantine.schema.json`: raíz cerrada (`additionalProperties: false`), entradas con `releaseTag`, `releaseId`, `assetId`, `assetName`, `reason` (enum), `detail`.

### B+C. Colección (`scripts/collect-quality-history.mjs`)

- `collectQualityHistory({ repository, token, currentSnapshot, fetchImpl = fetch })`: la frontera de red se inyecta y se propaga a todas las llamadas.
- Releases: paginación completa hasta página vacía/incompleta con límite de seguridad (20 páginas ⇒ fallo explícito); filtro mensual conservado.
- Assets: paginación completa por release con límite de seguridad (100 páginas ⇒ fallo explícito).
- Clasificación por asset: ajeno al namespace ⇒ ignorado; nombre malformado ⇒ `invalid-name`; descarga fallida ⇒ `download-failed`; JSON inválido ⇒ `invalid-json`; snapshot inválido ⇒ `invalid-snapshot`; id distinto al del nombre ⇒ `asset-id-mismatch`.
- Resultado: `{ index, quarantine }`. Con entradas de cuarentena, `index === null` (fail-closed).
- `main()`: escribe `site/history-quarantine.json` solo si hay entradas, sale con código ≠ 0 y no escribe `history.json`.
- `buildHistoryIndex`: representante determinista por id (mayor `generatedAt`; empate ⇒ `canonicalJson` menor), importando `canonicalJson` desde `persist-quality-history.mjs` para no duplicar.

### D. Persistencia (`scripts/persist-quality-history.mjs`)

- `fetchImpl` inyectable en `githubRequest/uploadAsset`.
- `persistSnapshot` busca el asset por nombre en todos los releases históricos paginados antes de crear nada; si existe devuelve `{ created: false, period, assetName, releaseTag }` (adición compatível). Sin DELETE; el asset corrupto remoto nunca se reemplaza aquí.

### F. Workflow y docs

- `quality-dashboard.yml`: paths de los dos scripts nuevos, paso «Validate historical asset quarantine contract» en `assemble` y upload condicional del manifest.
- `QUALITY_HISTORY.md`: cuarentena fail-closed, paginación completa, deduplicaciones, retención indefinida sin pruning.

## Orden de implementación (TDD, un commit por grupo)

1. Docs: spec/plan/tasks.
2. `test:` contrato de cuarentena (schema + módulo + su suite).
3. `feat:` cuarentena + paginación en colección (+ tests de red inyectada + workflow).
4. `fix:` deduplicación determinista del índice (+ tests de permutación/empate).
5. `fix:` deduplicación entre releases en persistencia (+ tests con fetch falso).
6. `docs:` QUALITY_HISTORY.md.

## Pruebas mínimas

Manifest válida y rechazo de URL/token · JSON inválido ⇒ `invalid-json` · snapshot en página posterior descubierto · asset corrupto bloquea la colección · permutar duplicados no cambia el representante · empate usa JSON canónico · legacy v1 conserva identidad literal · asset existente evita release/upload nuevos · workflow sube manifest sin relajar bloqueo · no existe ruta de borrado o reemplazo.

## Riesgos y reversión

- Cambios confinados a scripts de histórico y su workflow; reversión = revertir los commits del sprint (sin datos afectados: ningún asset real se toca).
- Los tests usan dobles de `fetch`; ninguna llamada de red real en suites.
