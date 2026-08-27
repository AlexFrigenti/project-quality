# Especificación: PQ-OX22 — Paridad y completitud contractual de node-quality.yml

## Contexto y problema

El repositorio `AlexFrigenti/project-quality` define el flujo reutilizable [`.github/workflows/node-quality.yml`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml) como el contrato principal de calidad para el 75% de los repositorios monitoreados (`gestor-autonomo`, `nexo` y `nucleo`).

Tras el sprint PQ-OX21, el workflow para proyectos estáticos ([`.github/workflows/static-quality.yml`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/static-quality.yml)) quedó protegido por una suite exhaustiva ([`scripts/test-static-quality-workflow.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/test-static-quality-workflow.mjs)) que valida el 100% de sus inputs, steps, gates, sparse-checkout, métricas, artefactos y tolerancia CRLF.

Sin embargo, la suite contractual existente para Node ([`scripts/test-node-quality-workflow.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/test-node-quality-workflow.mjs)) quedó rezagada con una cobertura muy reducida, originada históricamente sólo para validar el diagnóstico de tests (`test-results-file`).

### Brechas exactas de cobertura contractual en `node-quality.yml`
1. **Inputs desprotegidos:** De los 16 inputs declarados en [`.github/workflows/node-quality.yml:5-81`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml#L5-L81), la suite actual solo valida 1 (`test-results-file`). Quedan sin aserción contractual los 5 inputs obligatorios y 10 inputs opcionales con sus valores por defecto.
2. **Sparse-checkout incompleto:** De las 4 dependencias requeridas en [`.github/workflows/node-quality.yml:169-174`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml#L169-L174), la suite solo valida 1 (`scripts/quality-contract.mjs`), dejando fuera el schema JSON y los scripts generador y validador de métricas.
3. **Gates y variables de entorno no verificados:** De los 11 gates declarados ([L183](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml#L183)), solo se comprueba el step de tests unitarios ([L27-L31](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/test-node-quality-workflow.mjs#L27-L31)). Los otros 10 gates (`install`, `preflight`, `lint`, `typecheck`, `build`, `coverage`, `e2e-install`, `e2e`, `smoke`, `metrics`), sus condiciones `if:`, `QUALITY_GATE_IDS`, aplicabilidades y mapeos de outcome están desprotegidos.
4. **Validación y artefactos no asegurados:** Los steps de `Validate quality metrics` y `Upload quality metrics` con `if-no-files-found: error` no son verificados por la suite actual.
5. **Falta de función exportada en memoria:** `test-node-quality-workflow.mjs` no exporta `validateNodeQualityWorkflowContent(content)`, impidiendo pruebas sintéticas directas en memoria.

---

## Evidencia exacta de la estructura de `node-quality.yml`

### 1. Inputs reales (16 inputs)
- **5 Inputs obligatorios (`required: true`, `type: string`):**
  1. `standard-version` ([.github/workflows/node-quality.yml:6-9](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml#L6-L9))
  2. `standard-sha` ([.github/workflows/node-quality.yml:10-13](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml#L10-L13))
  3. `install-command` ([.github/workflows/node-quality.yml:19-22](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml#L19-L22))
  4. `build-command` ([.github/workflows/node-quality.yml:38-41](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml#L38-L41))
  5. `test-command` ([.github/workflows/node-quality.yml:42-45](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml#L42-L45))

- **11 Inputs opcionales (`required: false`, `type: string`):**
  1. `node-version` (default: `"22"`, [.github/workflows/node-quality.yml:14-18](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml#L14-L18))
  2. `preflight-command` (default: `""`, [.github/workflows/node-quality.yml:23-27](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml#L23-L27))
  3. `lint-command` (default: `""`, [.github/workflows/node-quality.yml:28-32](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml#L28-L32))
  4. `typecheck-command` (default: `""`, [.github/workflows/node-quality.yml:33-37](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml#L33-L37))
  5. `test-results-file` (default: `""`, [.github/workflows/node-quality.yml:46-50](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml#L46-L50))
  6. `coverage-command` (default: `""`, [.github/workflows/node-quality.yml:51-55](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml#L51-L55))
  7. `e2e-install-command` (default: `""`, [.github/workflows/node-quality.yml:56-60](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml#L56-L60))
  8. `e2e-command` (default: `""`, [.github/workflows/node-quality.yml:61-65](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml#L61-L65))
  9. `smoke-command` (default: `""`, [.github/workflows/node-quality.yml:66-70](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml#L66-L70))
  10. `metrics-command` (default: `""`, [.github/workflows/node-quality.yml:71-75](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml#L71-L75))
  11. `metrics-file` (default: `".quality/metrics.json"`, [.github/workflows/node-quality.yml:76-80](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml#L76-L80))

### 2. Gates reales (11 gates) y mapeo de IDs
- `install`: step `id: install`, `run: ${{ inputs.install-command }}` (obligatorio)
- `preflight`: step `id: preflight`, `if: ${{ inputs.preflight-command != '' }}`, `run: ${{ inputs.preflight-command }}` (opcional)
- `lint`: step `id: lint`, `if: ${{ inputs.lint-command != '' }}`, `run: ${{ inputs.lint-command }}` (opcional)
- `typecheck`: step `id: typecheck`, `if: ${{ inputs.typecheck-command != '' }}`, `run: ${{ inputs.typecheck-command }}` (opcional)
- `build`: step `id: build`, `run: ${{ inputs.build-command }}` (obligatorio)
- `tests`: step `id: tests`, `run: ${{ inputs.test-command }}` (obligatorio)
- `coverage`: step `id: coverage`, `if: ${{ inputs.coverage-command != '' }}`, `run: ${{ inputs.coverage-command }}` (opcional)
- `e2e-install`: step `id: e2e_install`, `if: ${{ inputs.e2e-install-command != '' }}`, `run: ${{ inputs.e2e-install-command }}` (opcional)
- `e2e`: step `id: e2e`, `if: ${{ inputs.e2e-command != '' }}`, `run: ${{ inputs.e2e-command }}` (opcional)
- `smoke`: step `id: smoke`, `if: ${{ inputs.smoke-command != '' }}`, `run: ${{ inputs.smoke-command }}` (opcional)
- `metrics`: step `id: metrics`, `if: ${{ always() && inputs.metrics-command != '' }}`, `run: ${{ inputs.metrics-command }}` (opcional)

### 3. Sparse-checkout (4 dependencias indispensables)
- `schemas/quality-metrics.schema.json` ([.github/workflows/node-quality.yml:170](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml#L170))
- `scripts/quality-contract.mjs` ([.github/workflows/node-quality.yml:171](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml#L171))
- `scripts/generate-quality-metrics.mjs` ([.github/workflows/node-quality.yml:172](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml#L172))
- `scripts/validate-quality-metrics.mjs` ([.github/workflows/node-quality.yml:173](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml#L173))

### 4. Generación, validación y artefactos de métricas
- Inyección de `QUALITY_PROJECT_KIND: node` ([L180](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml#L180)).
- `QUALITY_GATE_IDS: install preflight lint typecheck build tests coverage e2e-install e2e smoke metrics` ([L183](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml#L183)).
- Aplicabilidades obligatorias (`install`, `build`, `tests`) y condicionales (`preflight`, `lint`, `typecheck`, `coverage`, `e2e-install`, `e2e`, `smoke`, `metrics`) ([L184-L194](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml#L184-L194)).
- Validación con `validate-quality-metrics.mjs quality-metrics.json` ([L214](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml#L214)).
- Subida obligatoria de `quality-metrics` con `if-no-files-found: error` ([L216-L222](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml#L216-L222)).

---

## Arquitectura objetivo

1. **Ampliación exhaustiva de [`scripts/test-node-quality-workflow.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/test-node-quality-workflow.mjs):**
   - Exportar la función pura `validateNodeQualityWorkflowContent(content)` para desacoplar el contrato de la I/O.
   - Validar los 16 inputs reales (5 obligatorios y 11 opcionales con defaults exactos).
   - Validar los steps de instalación, preflight, lint, typecheck, build, tests, diagnóstico de tests, coverage, e2e-install, e2e, smoke y metrics.
   - Validar las 4 dependencias requeridas en el `sparse-checkout:`.
   - Validar `QUALITY_PROJECT_KIND: node`, `QUALITY_GATE_IDS` (11 gates), aplicabilidades y outcomes.
   - Validar la ejecución de `validate-quality-metrics.mjs` y la subida de `quality-metrics.json` con `if-no-files-found: error`.
   - Incluir prueba sintética directa de tolerancia a CRLF en memoria.

2. **Preservación y compatibilidad de [`scripts/test-node-quality-workflow-crlf.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/test-node-quality-workflow-crlf.mjs):**
   - Mantener la suite independiente existente en `scripts/` como test de subproceso real en Windows para garantizar que el total de 19 suites de prueba del repositorio permanece inalterado.

3. **Preservación absoluta de workflows productivos:**
   - [`.github/workflows/node-quality.yml`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml), [`.github/workflows/static-quality.yml`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/static-quality.yml), [`.github/workflows/main-quality-gate.yml`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/main-quality-gate.yml) y [`.github/workflows/quality-dashboard.yml`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/quality-dashboard.yml) no requieren modificaciones funcionales en producción.

---

## Invariantes

- **Invariante 1 (Preservación funcional de `node-quality.yml`):** El workflow reutilizable para Node no sufre modificaciones de código YAML; su diseño actual es correcto y compatible.
- **Invariante 2 (Preservación del inventario de pruebas):** El repositorio mantiene exactamente 19 suites de prueba en `scripts/test-*.mjs`, de las cuales 18 corresponden al dominio de `quality-dashboard.yml` (job `assemble`) y `test-main-quality-gate.mjs` permanece como gate universal independiente.
- **Invariante 3 (Preservación de perfiles y auditoría):** `audit-repository.mjs`, los perfiles (`gestor-autonomo`, `nexo`, `nucleo`, `nucleo-preview`) y `test-audit-profiles.mjs` permanecen inalterados.
- **Invariante 4 (Contratos, métricas y esquemas):** No se modifican `quality-contract.mjs`, `dashboard-contract.mjs`, `generate-quality-metrics.mjs`, `validate-quality-metrics.mjs` ni ningún archivo en `schemas/*.json`.
- **Invariante 5 (Cero dependencias externas):** No se incorporan dependencias npm ni llamadas de red en las suites de prueba.

---

## Matriz de pruebas

| Identificador | Nivel | Componente | Descripción |
| :--- | :--- | :--- | :--- |
| **M1** | Contrato | `test-node-quality-workflow.mjs` | Verifica los 5 inputs obligatorios y los 11 inputs opcionales con sus valores por defecto. |
| **M2** | Contrato | `test-node-quality-workflow.mjs` | Verifica los steps de validación deterministas (`install`, `build`, `tests`) y los condicionales (`preflight`, `lint`, `typecheck`, `coverage`, `e2e_install`, `e2e`, `smoke`, `metrics`). |
| **M3** | Contrato | `test-node-quality-workflow.mjs` | Verifica el step `Upload unit test diagnostics` y su preservación tras los tests. |
| **M4** | Contrato | `test-node-quality-workflow.mjs` | Verifica las 4 dependencias requeridas en el `sparse-checkout:`. |
| **M5** | Contrato | `test-node-quality-workflow.mjs` | Verifica `QUALITY_PROJECT_KIND: node`, `QUALITY_GATE_IDS` (11 gates), aplicabilidades y asignación de outcomes. |
| **M6** | Contrato | `test-node-quality-workflow.mjs` | Verifica `Validate quality metrics` y subida obligatoria de `quality-metrics` (`if-no-files-found: error`). |
| **M7** | Robustez | `test-node-quality-workflow.mjs` & `test-node-quality-workflow-crlf.mjs` | Verifica tolerancia a saltos de línea Windows (`\r\n`) en memoria y mediante subproceso aislado. |
| **M8** | Integración global | 19 suites de prueba (`scripts/test-*.mjs`) | Todas las suites del proyecto se ejecutan y pasan con código 0. |
| **M9** | Sintaxis y schemas | Todo el repositorio | `node --check scripts/*.mjs` y validación de schemas JSON sin errores. |

---

## Criterios de aceptación

1. `scripts/test-node-quality-workflow.mjs` exporta `validateNodeQualityWorkflowContent(content)` y valida exhaustivamente todos los inputs, steps, gates, sparse-checkout y métricas de `node-quality.yml`.
2. Ambas suites `test-node-quality-workflow.mjs` y `test-node-quality-workflow-crlf.mjs` pasan limpias en verde.
3. Las 19 suites de prueba del repositorio pasan con código de salida 0.
4. `node-quality.yml` y los restantes workflows productivos permanecen funcionalmente intactos.
5. El diff contra `origin/main` se limita exclusivamente a los archivos documentados y autorizados.

---

## Riesgos y mitigación

- **Riesgo:** Sobreescribir o relajar aserciones existentes sobre `test-results-file` o `Upload unit test diagnostics`.
  - *Mitigación:* Preservar explícitamente las pruebas de orden cronológico (`testsStep < diagnosticsStep < coverageStep`) y flags de artefacto (`if-no-files-found: warn`).
- **Riesgo:** Falsos fallos por expresiones regulares que no contemplen espacios o saltos de línea.
  - *Mitigación:* Normalizar a `\n` al inicio de `validateNodeQualityWorkflowContent` y usar patrones multilínea deterministas.

---

## Alcance y fuera de alcance

### Dentro de alcance:
- Ampliar la cobertura contractual de `scripts/test-node-quality-workflow.mjs`.
- Exportar `validateNodeQualityWorkflowContent(content)`.
- Validar tolerancia a CRLF en memoria y mantener `scripts/test-node-quality-workflow-crlf.mjs`.
- Documentación del sprint en `specs/021-node-quality-workflow-contract/`.

### Fuera de alcance:
- Modificar funcionalmente `node-quality.yml`, `static-quality.yml`, `main-quality-gate.yml` o `quality-dashboard.yml`.
- Modificar `audit-repository.mjs` o perfiles.
- Modificar schemas JSON o contratos serializados.
- Añadir dependencias de paquetes npm.
