# Plan: Corrección de la ruta por defecto en `validate-dashboard.mjs`

## Especificación relacionada

- `specs/007-validate-dashboard-default-path/spec.md`

## Diseño propuesto

1. **Modificación de `scripts/validate-dashboard.mjs`**:
   - Cambiar la línea:
     ```javascript
     const file = process.argv[2] || "dashboard/data.json";
     ```
     por:
     ```javascript
     const file = process.argv[2] || "site/data.json";
     ```

2. **Ampliación de `scripts/test-dashboard.mjs`**:
   - Añadir una sección de pruebas CLI mediante `child_process.execFile`:
     - **Caso A (Default sin argumentos)**: Crear un directorio temporal con subdirectorio `site/` que contenga un `data.json` válido. Ejecutar `node scripts/validate-dashboard.mjs` con `cwd: tempDir` sin argumentos. Verificar exit code 0 y salida `Dashboard válido: 4 repositorios.`.
     - **Caso B (Ruta explícita)**: Crear un subdirectorio `custom-dir/` que contenga un `data.json` válido. Ejecutar pasando la ruta relativa `custom-dir/data.json`. Verificar exit code 0 y salida `Dashboard válido: 4 repositorios.`.
     - **Caso C (Default ausente)**: Ejecutar `node scripts/validate-dashboard.mjs` con `cwd: tempDirVacio` sin argumentos. Verificar que arroja error (exit code 1) y que el mensaje contiene `site/data.json` o `site\\data.json`.
     - Limpieza garantizada de todos los directorios temporales en bloque `finally`.

## Archivos afectados

- Modificar:
  - `scripts/validate-dashboard.mjs`
  - `scripts/test-dashboard.mjs`
- Nuevos:
  - `specs/007-validate-dashboard-default-path/spec.md`
  - `specs/007-validate-dashboard-default-path/plan.md`
  - `specs/007-validate-dashboard-default-path/tasks.md`
