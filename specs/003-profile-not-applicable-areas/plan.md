# Plan: Declaración explícita de notApplicableAreas en perfiles de auditoría

## Especificación relacionada

- `specs/003-profile-not-applicable-areas/spec.md`

## Diseño propuesto

1. En `scripts/audit-repository.mjs`:
   - Exportar `profiles` añadiendo `notApplicableAreas` a cada uno de los 4 perfiles.
   - Encapsular la lógica de auditoría en una función exportable `runAudit()` y proteger la ejecución CLI con la cláusula canónica `if (entrypoint === import.meta.url)` para permitir importar `profiles` en tests sin ejecutar efectos secundarios contra GitHub API.

2. En `scripts/test-audit-profiles.mjs` (nuevo test):
   - Importar `profiles` directamente desde `scripts/audit-repository.mjs`.
   - Validar que los 4 perfiles existen y que sus `notApplicableAreas` coinciden con los arrays canónicos.
   - Validar que un snapshot con repositorios construidos con estos perfiles valida contra `validateQualityHistory`.

## Archivos afectados

- Modificar:
  - `scripts/audit-repository.mjs`
  - `.github/workflows/quality-dashboard.yml`
- Nuevos:
  - `scripts/test-audit-profiles.mjs`
  - `specs/003-profile-not-applicable-areas/spec.md`
  - `specs/003-profile-not-applicable-areas/plan.md`
  - `specs/003-profile-not-applicable-areas/tasks.md`

## Orden de implementación

1. Crear especificación, plan y tareas.
2. Modificar `scripts/audit-repository.mjs` declarando `notApplicableAreas` y exportando `profiles`.
3. Crear `scripts/test-audit-profiles.mjs`.
4. Ejecutar la suite completa de pruebas.
5. Marcar tareas y verificar working tree.

## Estrategia de pruebas

- Prueba determinista sobre la exportación real de `profiles`.
- Prueba de propagación hacia `buildQualityHistorySnapshot` y `validateQualityHistory`.
- Ejecución de la suite completa de contratos del proyecto.

## Validaciones

- `node scripts/test-audit-profiles.mjs`
- `node scripts/test-quality-metrics.mjs`
- `node scripts/test-quality-history.mjs`
- `node scripts/test-quality-history-index.mjs`
- `node scripts/test-quality-evidence.mjs`

## Riesgos, compatibilidad y reversión

- Riesgo mínimo: el esquema de históricos ya exigía `notApplicableAreas: []` como mínimo; proveer los strings válidos enriquece los datos respetando estrictamente el schema.
- Reversión inmediata mediante rollback en caso de imprevisto.
