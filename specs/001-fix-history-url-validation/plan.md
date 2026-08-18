# Plan: Corrección de falso positivo en validación de URLs en snapshots históricos

## Especificación relacionada

- `spec.md`

## Diseño propuesto

1. En `scripts/validate-quality-history.mjs`:
   - Implementar una función de validación de seguridad `rejectUnsafeProperties(value, path)` que recorra recursivamente el objeto:
     - Verifique que ninguna clave sea `url` (insensible a mayúsculas/minúsculas).
     - Verifique que ningún valor de cadena contenga `https?://`.
   - Reemplazar la comprobación por regex sobre `JSON.stringify(snapshot)` en la línea 164 por esta validación estructural.
2. En `scripts/test-quality-history.mjs`:
   - Añadir una aserción de regresión que valide un snapshot con un gate cuyo `details` incluya `url: no requerida`.
   - Verificar que se rechazan claves `url` y URLs `https://...`.

## Archivos afectados

- Crear:
  - `specs/001-fix-history-url-validation/spec.md`
  - `specs/001-fix-history-url-validation/plan.md`
  - `specs/001-fix-history-url-validation/tasks.md`
- Modificar:
  - `scripts/validate-quality-history.mjs`
  - `scripts/test-quality-history.mjs`

## Orden de implementación

1. Escribir artefactos de especificación.
2. Actualizar `scripts/validate-quality-history.mjs`.
3. Añadir caso de prueba en `scripts/test-quality-history.mjs`.
4. Ejecutar validaciones del repositorio.

## Estrategia de pruebas

- Ejecutar `node scripts/test-quality-history.mjs` y el resto de tests de calidad.

## Validaciones

- `node scripts/test-quality-history.mjs`
- `node scripts/test-quality-history-index.mjs`
- `node scripts/test-quality-evidence.mjs`
- `node scripts/test-quality-metrics.mjs`

## Riesgos, compatibilidad y reversión

- **Riesgos:** Ninguno; mejora la robustez y elimina falsos positivos.
- **Compatibilidad:** 100% compatible.
- **Reversión:** Revertir los cambios en `scripts/validate-quality-history.mjs` y `scripts/test-quality-history.mjs`.
