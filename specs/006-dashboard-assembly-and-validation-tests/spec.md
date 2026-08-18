# Especificación: Cobertura de tests para auditoría y ensamblado del dashboard

## Contexto y problema

El repositorio dispone de suites de pruebas dedicadas para contratos de métricas, evidencia, histórico de calidad y perfiles de auditoría. Sin embargo, las dos piezas clave del ensamblado y validación final del dashboard carecían de pruebas unitarias/de integración automatizadas:
1. `scripts/validate-dashboard.mjs`: Ejecutaba su lógica únicamente top-level y solo era invocado en CI al final del pipeline contra datos de producción.
2. `scripts/assemble-dashboard.mjs`: Ejecutaba su lógica top-level y carecía de pruebas deterministas ante directorios de reportes incompletos o válidos.

## Objetivos

1. Modularizar `scripts/validate-dashboard.mjs` para exportar `validateDashboard(value)` preservando intacto su comportamiento CLI y sus defaults (sin tocar la deuda `PQ-AUDIT-06`).
2. Modularizar `scripts/assemble-dashboard.mjs` para exportar `assembleDashboard(options)` permitiendo parametrizar `reportsDir` y `outputDir` sin ejecutar efectos secundarios al ser importado.
3. Crear una suite de prueba unificada y determinista `scripts/test-dashboard.mjs` que cubra:
   - Validación estructural en memoria (`validateDashboard`): payloads válidos, repositorios ausentes/duplicados/desconocidos, incoherencia de contadores en `summary`, fuga de URLs/evidencias en repositorios privados y detección de patrones de tokens (GitHub PAT y Bearer).
   - Ensamblado en filesystem temporal (`assembleDashboard`): generación correcta de `data.json`, presencia y orden de los 4 proyectos, copia de `index.html` e `history.html`, creación de `.nojekyll` y fallo explícito ante reportes faltantes.
4. Integrar `scripts/test-dashboard.mjs` en el workflow `.github/workflows/quality-dashboard.yml`.

## Exclusiones explícitas

- `PQ-AUDIT-06` (Ruta por defecto `dashboard/data.json` vs `site/data.json` en `validate-dashboard.mjs`): Permanece fuera de alcance y no se modifica.
- `PQ-AUDIT-07` (`propertyNames` en `quality-metrics.schema.json`): Permanece fuera de alcance.
- `PQ-AUDIT-08`: Permanece fuera de alcance.
- `scripts/audit-repository.mjs`: Ya cubierto por `test-audit-profiles.mjs`; no se añaden mocks de GitHub API.

## Criterios de aceptación

- [ ] **CA1 (Testabilidad validator)**: `validate-dashboard.mjs` exporta `validateDashboard(value)` y no realiza operaciones de I/O al importarse.
- [ ] **CA2 (Testabilidad assembler)**: `assemble-dashboard.mjs` exporta `assembleDashboard(options)` y no realiza operaciones de I/O al importarse.
- [ ] **CA3 (Cobertura validator)**: `test-dashboard.mjs` valida casos positivos y rechazo de ausencias, duplicados, discrepancias en summary, URLs privadas y tokens.
- [ ] **CA4 (Cobertura assembler)**: `test-dashboard.mjs` valida ensamblado completo sobre directorio temporal y rechazo de reportes faltantes con limpieza obligatoria en `finally`.
- [ ] **CA5 (Compatibilidad CLI)**: Las ejecuciones CLI directas de ambos scripts funcionan exactamente igual que antes.
- [ ] **CA6 (CI)**: `test-dashboard.mjs` se añade a `paths` y al job `assemble` de `.github/workflows/quality-dashboard.yml`.
- [ ] **CA7 (Validaciones)**: Las 7 suites de pruebas del repositorio pasan exitosamente.
