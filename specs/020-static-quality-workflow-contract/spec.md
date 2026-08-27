# Especificación: PQ-OX21 — Contrato y validación del workflow static-quality.yml

## Contexto y problema

El repositorio `AlexFrigenti/project-quality` define dos flujos reutilizables estándar de calidad para auditar y certificar repositorios consumidores:
1. **`.github/workflows/node-quality.yml`**: Flujo reutilizable para proyectos basados en Node.js (utilizado por los perfiles `gestor-autonomo`, `nexo` y `nucleo`).
2. **`.github/workflows/static-quality.yml`**: Flujo reutilizable para proyectos frontend y estáticos sin backend (utilizado por el perfil `nucleo-preview` en [scripts/audit-repository.mjs:52-61](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/scripts/audit-repository.mjs#L52-L61)).

Sin embargo, existe una **asimetría de cobertura contractual**:
- Para `node-quality.yml`, existen dos suites dedicadas:
  - [scripts/test-node-quality-workflow.mjs](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/scripts/test-node-quality-workflow.mjs): valida inputs, orden cronológico de steps, existencia de gates, diagnóstico de tests y sparse-checkout de dependencias.
  - [scripts/test-node-quality-workflow-crlf.mjs](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/scripts/test-node-quality-workflow-crlf.mjs): valida tolerancia ante finales de línea CRLF en Windows.
- Para `static-quality.yml`, **no existe ninguna suite contractual dedicada** (`scripts/test-static-quality-workflow.mjs` no existe).

### Riesgos no cubiertos por la ausencia de contrato
1. **Inputs no verificados:** Si se altera el nombre o la obligatoriedad de `validation-command`, `standard-version` o `standard-sha`, ningún test lo detecta antes de la auditoría.
2. **Sparse-checkout incompleto:** Si se modifican o eliminan las rutas del checkout parcial de `.quality-standard` ([.github/workflows/static-quality.yml:79-84](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/.github/workflows/static-quality.yml#L79-L84)), el pipeline fallará en ejecución real en GitHub Actions.
3. **Mapeo de variables de entorno y gates:** Si las variables `QUALITY_GATE_IDS`, `QUALITY_GATE_APPLICABILITY_*` o `QUALITY_GATE_STATUS_*` divergen de lo que espera [scripts/generate-quality-metrics.mjs](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/scripts/generate-quality-metrics.mjs), la evidencia generada será inválida.
4. **Validación y subida de artefactos:** La llamada a `validate-quality-metrics.mjs` y la subida de `quality-metrics` con `if-no-files-found: error` no están blindadas contractualmente.
5. **Sensibilidad a CRLF:** La tolerancia a saltos de línea Windows no está probada de forma aislada para este workflow.

---

## Evidencia exacta de la brecha contractual

### 1. Estructura de `static-quality.yml` ([.github/workflows/static-quality.yml:1-117](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/.github/workflows/static-quality.yml#L1-L117))
- **Inputs obligatorios:**
  - `standard-version` (líneas 6–9)
  - `standard-sha` (líneas 10–13)
  - `validation-command` (líneas 19–22)
- **Inputs opcionales:**
  - `node-version` (líneas 14–18, default: `"22"`)
  - `smoke-command` (líneas 23–27, default: `""`)
  - `metrics-command` (líneas 28–32, default: `""`)
  - `metrics-file` (líneas 33–37, default: `".quality/metrics.json"`)
- **Step de validación determinista:**
  - `id: validation`, `run: ${{ inputs.validation-command }}` (líneas 56–59)
- **Steps opcionales condicionales:**
  - `Smoke test` (`id: smoke`, `if: ${{ inputs.smoke-command != '' }}`) (líneas 60–64)
  - `Additional metrics` (`id: metrics`, `if: ${{ always() && inputs.metrics-command != '' }}`) (líneas 66–70)
- **Sparse-checkout de dependencias:**
  - Líneas 79–84:
    ```yaml
    sparse-checkout: |
      schemas/quality-metrics.schema.json
      scripts/quality-contract.mjs
      scripts/generate-quality-metrics.mjs
      scripts/validate-quality-metrics.mjs
    ```
- **Generación, validación y subida de métricas:**
  - Generador: `node .quality-standard/scripts/generate-quality-metrics.mjs` (línea 104) con variables de entorno para gates `validation`, `smoke`, `metrics`.
  - Validador: `node .quality-standard/scripts/validate-quality-metrics.mjs quality-metrics.json` (línea 108).
  - Subida de artefacto: `actions/upload-artifact@v7`, `name: quality-metrics`, `path: quality-metrics.json`, `if-no-files-found: error` (líneas 110–116).

### 2. Integración en `quality-dashboard.yml` y `test-dashboard-trigger-paths.mjs`
- [.github/workflows/quality-dashboard.yml](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/.github/workflows/quality-dashboard.yml) incluye `.github/workflows/static-quality.yml` en sus `paths:` (línea 49 y línea 95), pero no ejecuta ninguna suite contractual para este archivo en su job `assemble`.
- [scripts/test-dashboard-trigger-paths.mjs](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/scripts/test-dashboard-trigger-paths.mjs) valida actualmente que `assemble` ejecute exactamente 17 suites pertenecientes al dominio del dashboard.
- [scripts/test-main-quality-gate.mjs](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/scripts/test-main-quality-gate.mjs) y [.github/workflows/main-quality-gate.yml](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/.github/workflows/main-quality-gate.yml) ejecutan todas las suites de `scripts/test-*.mjs` automáticamente.

---

## Arquitectura objetivo

1. **Creación de `scripts/test-static-quality-workflow.mjs`:**
   - Crear una suite determinista que verifique contractualmente:
     - Definición exacta de inputs obligatorios (`standard-version`, `standard-sha`, `validation-command`) y opcionales (`node-version`, `smoke-command`, `metrics-command`, `metrics-file`).
     - Step `Deterministic static validation` con `id: validation` y comando `${{ inputs.validation-command }}`.
     - Steps opcionales de smoke y metrics con sus correspondientes condiciones `if:`.
     - Presencia de los 4 archivos indispensables en el bloque `sparse-checkout:`.
     - Inyección correcta de `QUALITY_GATE_IDS` (`validation smoke metrics`) y mapeo de aplicabilidad y estados.
     - Pasos de validación con `validate-quality-metrics.mjs` y subida obligatoria del artefacto `quality-metrics` con `if-no-files-found: error`.
     - **Tolerancia a CRLF:** Verificación integrada (o soporte nativo con normalización y prueba sintética) que garantiza que el validador acepta archivos con finales de línea Windows (`\r\n`).

2. **Integración en `.github/workflows/quality-dashboard.yml`:**
   - Añadir `node scripts/test-static-quality-workflow.mjs` a los steps de ejecución de tests del job `assemble`.
   - Añadir `"scripts/test-static-quality-workflow.mjs"` a los bloques `pull_request.paths` y `push.paths`.

3. **Actualización de `scripts/test-dashboard-trigger-paths.mjs`:**
   - Actualizar el conteo de suites del dominio del dashboard de 17 a 18 suites (todas las 19 suites del repositorio excepto `test-main-quality-gate.mjs`).
   - Validar que `test-static-quality-workflow.mjs` está en `assemble` y en los `paths:` sincronizados.

4. **Preservación estricta de `static-quality.yml`:**
   - No se modifica el código YAML de `.github/workflows/static-quality.yml` (su diseño actual es 100% válido y compatible).

---

## Invariantes

- **Invariante 1 (Independencia de Main Quality Gate):** [.github/workflows/main-quality-gate.yml](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/.github/workflows/main-quality-gate.yml) y [scripts/test-main-quality-gate.mjs](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/scripts/test-main-quality-gate.mjs) permanecen inalterados. El gate universal ejecutará la nueva suite automáticamente por el patrón `scripts/test-*.mjs`.
- **Invariante 2 (Preservación funcional de workflows):** `.github/workflows/static-quality.yml` y `.github/workflows/node-quality.yml` no sufren alteraciones funcionales ni estructurales.
- **Invariante 3 (Preservación de perfiles y auditoría):** [scripts/audit-repository.mjs](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/scripts/audit-repository.mjs) y [scripts/test-audit-profiles.mjs](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/scripts/test-audit-profiles.mjs) permanecen inalterados; el perfil `nucleo-preview` conserva exactamente sus inputs y reglas.
- **Invariante 4 (Contratos, métricas y esquemas):** No se alteran `quality-contract.mjs`, `dashboard-contract.mjs` ni ningún schema en `schemas/*.json`.
- **Invariante 5 (Ensamblado y despliegue del dashboard):** La lógica de construcción del sitio estático (`assemble-dashboard.mjs`), histórico (`collect-quality-history.mjs`, `persist-quality-history.mjs`) y despliegue en Pages permanece idéntica.

---

## Matriz de pruebas

| Identificador | Nivel | Componente | Descripción |
| :--- | :--- | :--- | :--- |
| **M1** | Contrato | `test-static-quality-workflow.mjs` | Verifica inputs obligatorios (`standard-version`, `standard-sha`, `validation-command`) y opcionales (`node-version`, `smoke-command`, `metrics-command`, `metrics-file`). |
| **M2** | Contrato | `test-static-quality-workflow.mjs` | Verifica steps de validación determinista, smoke test y metrics. |
| **M3** | Contrato | `test-static-quality-workflow.mjs` | Verifica las 4 dependencias requeridas en el `sparse-checkout:`. |
| **M4** | Contrato | `test-static-quality-workflow.mjs` | Verifica mapeo de `QUALITY_GATE_IDS` y variables de entorno para generación y validación de métricas. |
| **M5** | Robustez | `test-static-quality-workflow.mjs` | Verifica que el contrato analiza correctamente workflows con finales de línea CRLF (`\r\n`). |
| **M6** | Integración / Triggers | `test-dashboard-trigger-paths.mjs` | Verifica que `assemble` ejecuta las 18 suites del dashboard y que los `paths:` están sincronizados. |
| **M7** | Integración global | 19 suites de prueba (`scripts/test-*.mjs`) | Todas las suites del proyecto se ejecutan y pasan con código 0. |
| **M8** | Sintaxis y schemas | Todo el repositorio | `node --check scripts/*.mjs` y validación de schemas JSON sin errores. |

---

## Criterios de aceptación

1. Existe el archivo `scripts/test-static-quality-workflow.mjs` cubriendo exhaustivamente las invariantes contractuales de `static-quality.yml`.
2. La suite tolera y valida correctamente workflows con formato CRLF.
3. `quality-dashboard.yml` ejecuta `node scripts/test-static-quality-workflow.mjs` en su job `assemble` e incluye la ruta en `pull_request.paths` y `push.paths`.
4. `scripts/test-dashboard-trigger-paths.mjs` se actualiza y valida satisfactoriamente las 18 suites del dominio del dashboard.
5. Las 19 suites de pruebas del repositorio pasan limpias en verde.
6. El diff contra `origin/main` se limita exclusivamente a los archivos documentados y autorizados.

---

## Riesgos y mitigación

- **Riesgo:** Desincronización entre el número de suites esperado en `test-dashboard-trigger-paths.mjs` y las suites reales en `scripts/`.
  - *Mitigación:* `test-dashboard-trigger-paths.mjs` lee dinámicamente el directorio `scripts/` y compara contra las suites ejecutadas en `assemble`, asegurando coincidencia exacta (18 suites de dashboard, 19 totales).
- **Riesgo:** Falsos fallos por saltos de línea Windows en `test-static-quality-workflow.mjs`.
  - *Mitigación:* Normalizar `\r\n` a `\n` al inicio de la lectura del fichero y añadir prueba sintética explícita de CRLF.

---

## Alcance y fuera de alcance

### Dentro de alcance:
- Crear `scripts/test-static-quality-workflow.mjs`.
- Integrar la suite en `quality-dashboard.yml` (`assemble` y `paths:`).
- Actualizar `scripts/test-dashboard-trigger-paths.mjs`.
- Documentación del sprint en `specs/020-static-quality-workflow-contract/`.

### Fuera de alcance:
- Modificar funcionalmente `static-quality.yml` o `node-quality.yml`.
- Modificar `main-quality-gate.yml` o `test-main-quality-gate.mjs`.
- Modificar `audit-repository.mjs` o `test-audit-profiles.mjs`.
- Modificar schemas JSON, métricas o despliegue en Pages.
- Añadir dependencias de paquetes npm.
