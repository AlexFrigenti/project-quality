# Plan: Cobertura de tests para auditoría y ensamblado del dashboard

## Especificación relacionada

- `specs/006-dashboard-assembly-and-validation-tests/spec.md`

## Diseño propuesto

1. **Refactor de `scripts/validate-dashboard.mjs`**:
   - Mover la lógica de validación a la función exportada:
     ```javascript
     export function validateDashboard(value) { ... return true; }
     ```
   - Encapsular la ejecución CLI en `async function main()` y protegerla con el guard estándar:
     ```javascript
     const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
     if (entrypoint === import.meta.url) {
       try {
         await main();
       } catch (error) {
         console.error(error instanceof Error ? error.message : String(error));
         process.exitCode = 1;
       }
     }
     ```
   - Mantener intacto el default CLI `process.argv[2] || "dashboard/data.json"`.

2. **Refactor de `scripts/assemble-dashboard.mjs`**:
   - Mover la lógica a la función exportada:
     ```javascript
     export async function assembleDashboard({
       reportsDir = process.env.REPORTS_DIR || "audit-reports",
       outputDir = process.env.OUTPUT_DIR || "site",
       env = process.env,
       now = new Date()
     } = {}) { ... return data; }
     ```
   - Proteger la invocación directa con `if (entrypoint === import.meta.url)`.

3. **Creación de `scripts/test-dashboard.mjs`**:
   - Implementar pruebas unitarias de `validateDashboard` en memoria usando un payload fixture base conforme.
   - Implementar pruebas negativas para `validateDashboard`:
     - Repositorio faltante (3 repos).
     - ID duplicado / ID inválido.
     - Incoherencia en `summary.pass`, `summary.total`, `summary.qualityCurrent`.
     - URL en `gate.evidence` de repo privado.
     - URL en `summary.run` de repo privado.
     - Clave `evidence` en `summary` de repo privado.
     - Token GitHub (`ghp_...`) en payload.
     - Bearer token (`Bearer ...`) en payload.
   - Implementar pruebas de integración de `assembleDashboard`:
     - Crear directorio temporal con `mkdtemp`.
     - Escribir 4 reportes mínimos válidos.
     - Ejecutar `assembleDashboard({ reportsDir, outputDir })`.
     - Verificar generación y contenido de `data.json`, `index.html`, `history.html` y `.nojekyll`.
     - Verificar orden canónico de repositorios.
     - Validar que `validateDashboard(data)` sobre el objeto ensamblado retorna `true`.
     - Caso de reporte faltante: escribir solo 3 reportes y comprobar que arroja `Error: Faltan informes de auditoría: ...`.
     - Limpiar directorio temporal en `finally`.

4. **Integración en CI**:
   - Modificar `.github/workflows/quality-dashboard.yml`:
     - Añadir `"scripts/test-dashboard.mjs"` a `paths` (triggers `pull_request` y `push`).
     - Añadir step `Validate dashboard assembly and validation` en el job `assemble`.

## Archivos afectados

- Modificar:
  - `scripts/validate-dashboard.mjs`
  - `scripts/assemble-dashboard.mjs`
  - `.github/workflows/quality-dashboard.yml`
- Nuevos:
  - `scripts/test-dashboard.mjs`
  - `specs/006-dashboard-assembly-and-validation-tests/spec.md`
  - `specs/006-dashboard-assembly-and-validation-tests/plan.md`
  - `specs/006-dashboard-assembly-and-validation-tests/tasks.md`
