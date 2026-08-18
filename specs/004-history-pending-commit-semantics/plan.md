# Plan: Semántica de commits pendientes y no disponibles en el histórico

## Especificación relacionada

- `specs/004-history-pending-commit-semantics/spec.md`

## Diseño propuesto

1. **Modificación de `dashboard/history.html`**:
   - En `renderSnapshot(record)`:
     - Evaluar si `quality.status === "current"`.
     - Si es `current`: etiqueta `Commit validado`, valor `<code>${shortSha(quality.commitSha)}</code>`.
     - Si no es `current`: etiqueta `Commit actual`, valor `quality.currentHeadSha ? '<code>' + shortSha(quality.currentHeadSha) + '</code>' : '—'`.
   - En `renderOverview(records)`:
     - Si `latest?.repository?.quality?.status === "current"`:
       - `value`: `formatCompactDate(quality.validatedAt)` (estrictamente el timestamp de validación real; sin fallback a `generatedAt` por ser obligatorio según contrato).
       - `note`: `quality.commitSha ? "Commit " + shortSha(quality.commitSha) : "Sin evidencia"`
     - Si `quality?.status !== "current"`:
       - `value`: `"—"`
       - `note`: `quality?.currentHeadSha ? "Commit actual " + shortSha(quality.currentHeadSha) + (quality.status === "pending" ? " (pendiente)" : " (sin validar)") : (quality?.message || "Sin evidencia")`

2. **Creación de `scripts/test-history-rendering.mjs`**:
   - Extraer o ejecutar de forma determinista la lógica de renderizado sobre snapshots sintéticos de los 3 estados (`current`, `pending`, `unavailable` con/sin SHA).
   - Validar que el HTML producido cumple estrictamente los criterios de aceptación.

3. **Integración en CI**:
   - Actualizar `.github/workflows/quality-dashboard.yml` en `paths` y en el job `assemble` para incluir `scripts/test-history-rendering.mjs`.

## Archivos afectados

- Modificar:
  - `dashboard/history.html`
  - `.github/workflows/quality-dashboard.yml`
- Nuevos:
  - `scripts/test-history-rendering.mjs`
  - `specs/004-history-pending-commit-semantics/spec.md`
  - `specs/004-history-pending-commit-semantics/plan.md`
  - `specs/004-history-pending-commit-semantics/tasks.md`

## Validaciones

- `node scripts/test-history-rendering.mjs`
- `node scripts/test-audit-profiles.mjs`
- `node scripts/test-quality-metrics.mjs`
- `node scripts/test-quality-history.mjs`
- `node scripts/test-quality-history-index.mjs`
- `node scripts/test-quality-evidence.mjs`
