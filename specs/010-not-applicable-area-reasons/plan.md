# Plan: Explicación de por qué no aplica en las áreas excluidas por perfil

## Especificación relacionada

- `specs/010-not-applicable-area-reasons/spec.md`

## Diseño propuesto

1. **Contrato (`schemas/quality-history.schema.json`)**: `notApplicableAreas.items` pasa a `oneOf`:
   ```json
   { "type": "string", "minLength": 1, "maxLength": 120 }
   ```
   y
   ```json
   {
     "type": "object",
     "additionalProperties": false,
     "required": ["area", "reason"],
     "properties": {
       "area": { "type": "string", "minLength": 1, "maxLength": 120 },
       "reason": { "type": "string", "minLength": 1, "maxLength": 240 }
     }
   }
   ```

2. **Validador (`scripts/validate-quality-history.mjs`)**: en el recorrido de `notApplicableAreas`, si el elemento es string se valida como hasta ahora (≤ 120); si es objeto, claves exactas `{area, reason}` con los mismos límites de texto.

3. **Persistencia (`scripts/persist-quality-history.mjs`)**: nueva función `normalizeNotApplicableArea(item)`:
   - string → `boundedText(item, 120)` (comportamiento actual);
   - objeto → `{ area: boundedText(area, 120), reason: boundedText(reason, 240) }`, fallando si falta alguno o queda vacío;
   - otro tipo → error explícito.

4. **Perfiles (`scripts/audit-repository.mjs`)**: cada entrada pasa a `{ area, reason }` con razones alineadas con `QUALITY_STANDARD.md`; mismas áreas canónicas que la spec 003.

5. **Dashboard**:
   - `dashboard/index.html`: helpers para leer área y razón aceptando ambas formas; la razón se muestra tras `· No aplica ·`.
   - `dashboard/history.html`: mismo criterio en `renderSnapshot`.

## Archivos afectados

- Crear:
  - `specs/010-not-applicable-area-reasons/spec.md`
  - `specs/010-not-applicable-area-reasons/plan.md`
  - `specs/010-not-applicable-area-reasons/tasks.md`
- Modificar:
  - `schemas/quality-history.schema.json`
  - `scripts/validate-quality-history.mjs`
  - `scripts/persist-quality-history.mjs`
  - `scripts/audit-repository.mjs`
  - `dashboard/index.html`
  - `dashboard/history.html`
  - `QUALITY_HISTORY.md`
- Pruebas:
  - `scripts/test-audit-profiles.mjs`
  - `scripts/test-quality-history.mjs`
  - `scripts/test-history-rendering.mjs`
  - `scripts/test-dashboard.mjs`

## Orden de implementación

1. Artefactos T2 (esta carpeta).
2. Schema + validador + pruebas de contrato (TDD).
3. Normalización en persistencia + pruebas.
4. Perfiles con razones + pruebas de propagación.
5. Renderizado en ambas vistas + pruebas.
6. Documentación y validación completa.

## Estrategia de pruebas

- Contrato: casos válidos string/objeto/mixtos y casos inválidos (sin reason, vacía, >240, clave extra) sobre `validateQualityHistory`.
- Persistencia: snapshot con entradas enriquecidas conserva `{area, reason}`; entradas legacy permanecen como string; entrada inválida lanza error.
- Perfiles: áreas canónicas intactas, razones presentes ≤ 240, propagación real hacia snapshot validado.
- Renderizado: `history.html` con forma enriquecida y legacy; `index.html` (`renderQualityEvidence`) con ambas formas mediante `node:vm`.

## Validaciones

- Las siete suites: `test-quality-metrics`, `test-node-quality-workflow`, `test-audit-profiles`, `test-history-rendering`, `test-dashboard`, `test-quality-evidence`, `test-quality-history`, `test-quality-history-index`.
- CLIs: `validate-quality-history.mjs`, `validate-quality-history-index.mjs`, `validate-dashboard.mjs` sobre fixtures generados.
- `git diff --check` y revisión adversarial del diff completo.

## Riesgos, compatibilidad y reversión

- Compatibilidad: el validador y el esquema aceptan la forma legacy, por lo que los assets ya publicados siguen revalidándose sin cambios.
- Reversión: revertir la rama restaura el contrato anterior; los snapshots con objetos publicados durante la ventana quedarían fuera del validador antiguo, por lo que la reversión debe valorarse antes del primer despliegue con datos enriquecidos.
- Sin migraciones: no hay transformación de datos existentes, solo ampliación aditiva del contrato.
