# Especificación: PQ-OX18 — Cierre y consistencia contractual de quality-dashboard.yml y trigger paths

## Contexto y problema

En sprints anteriores se consolidaron componentes fundamentales del repositorio:
- **PQ-OX07**: Manifiesto y lógica de cuarentena histórica (`history-quarantine.mjs`).
- **PQ-OX08**: Contrato de runtime Node 24 y allowlist de GitHub Actions (`test-actions-runtime.mjs`).
- **PQ-OX13**: Resiliencia de red de la API de GitHub (`github-api-request.mjs` y `test-github-api-resilience.mjs`).
- **PQ-OX14**: Suite contractual inicial de triggers del dashboard (`test-dashboard-trigger-paths.mjs`).
- **PQ-OX15, PQ-OX16 y PQ-OX17**: Resiliencia, cierre de la ruta productiva y retry único en la persistencia del histórico (`test-history-api-resilience.mjs` y `test-history-production-path.mjs`).

A pesar de estas mejoras, una auditoría rigurosa de [.github/workflows/quality-dashboard.yml](file:///c:/Users/Alex/OneDrive/Documenti/GitHub/project-quality/.github/workflows/quality-dashboard.yml) y de [scripts/test-dashboard-trigger-paths.mjs](file:///c:/Users/Alex/OneDrive/Documenti/GitHub/project-quality/scripts/test-dashboard-trigger-paths.mjs) revela dos inconsistencias contractuales que comprometen la hermeticidad del pipeline de publicación del dashboard:

1. **Omisión de suites en el job `assemble` del workflow de publicación:**
   El job `assemble` ejecuta actualmente 14 suites de test antes de generar el sitio estático y publicar en Pages. Sin embargo, omite 3 suites directamente vinculadas a su ciclo de vida:
   - `node scripts/test-history-quarantine.mjs`: `quality-dashboard.yml` genera `site/history-quarantine.json` (mediante `collect-quality-history.mjs`) y lo sube como artefacto (`history-quarantine-manifest` en líneas 226-233). La suite ya está en `paths:` (líneas 33 y 78), pero nunca se ejecuta en `assemble`.
   - `node scripts/test-actions-runtime.mjs`: Verifica que todas las GitHub Actions del repositorio (incluyendo las usadas por `quality-dashboard.yml` para desplegar en Pages: `checkout`, `upload-artifact`, `download-artifact`, `configure-pages`, `upload-pages-artifact`, `deploy-pages`) respeten la allowlist de majors de Node 24. Está listada en `paths:`, pero no se ejecuta en `assemble`.
   - `node scripts/test-github-api-resilience.mjs`: Es la suite fundacional de `resilientFetch` creada en PQ-OX13. `assemble` ejecuta `test-history-api-resilience.mjs` y `test-history-production-path.mjs`, pero no la suite base de la que dependen `audit-repository` y `collect-quality-evidence`.

2. **Dependencias directas omitidas en `pull_request.paths` y `push.paths`:**
   Los bloques de paths de `quality-dashboard.yml` declaran 41 patrones, pero omiten:
   - `scripts/fixture-history-legacy.mjs`: Archivo de datos importado directamente por [scripts/test-quality-history.mjs:7](file:///c:/Users/Alex/OneDrive/Documenti/GitHub/project-quality/scripts/test-quality-history.mjs#L7). Una modificación en este fixture no dispararía el workflow del dashboard si no se tocan otros archivos.
   - `scripts/test-github-api-resilience.mjs`: Suite directa que prueba [scripts/github-api-request.mjs](file:///c:/Users/Alex/OneDrive/Documenti/GitHub/project-quality/scripts/github-api-request.mjs).

3. **Verificación insuficiente en `test-dashboard-trigger-paths.mjs`:**
   En PQ-OX14, [scripts/test-dashboard-trigger-paths.mjs](file:///c:/Users/Alex/OneDrive/Documenti/GitHub/project-quality/scripts/test-dashboard-trigger-paths.mjs) se limitó a verificar un array estático de 3 rutas (`github-api-request.mjs`, `zip-entry-reader.mjs`, `test-dashboard-trigger-paths.mjs`) y que `node scripts/test-dashboard-trigger-paths.mjs` estuviese en el workflow. No verifica la presencia de las suites en `assemble` ni la integridad completa de dependencias requeridas.

---

## Estado actual del workflow `quality-dashboard.yml`

- **Triggers configurados:**
  - `workflow_dispatch`: manual.
  - `pull_request.paths`: 41 entradas.
  - `push.branches: [main]` con `paths`: 41 entradas.
  - `schedule`: cron `"17 6 * * 1"`.
- **Jobs:**
  1. `audit`: Auditoría paralela de repositorios externos con `audit-repository.mjs`.
  2. `assemble`:
     - Ejecuta secuencialmente 14 suites (`test-quality-metrics`, `test-node-quality-workflow`, `test-node-quality-workflow-crlf`, `test-audit-profiles`, `test-main-protection`, `test-history-rendering`, `test-dashboard`, `test-quality-evidence`, `test-quality-history`, `test-schema-validator-parity`, `test-quality-history-index`, `test-dashboard-trigger-paths`, `test-history-api-resilience`, `test-history-production-path`).
     - Ensambla sitio con `assemble-dashboard.mjs`.
     - Genera índice histórico y manifiesto de cuarentena con `collect-quality-history.mjs`.
     - Sube artefacto `history-quarantine-manifest`.
     - Valida `history.json` y `data.json`.
     - Sube preview y artefacto de Pages `quality-dashboard-site`.
  3. `history`: Persistencia de snapshots sanitizados mediante `persist-quality-history.mjs`.
  4. `deploy`: Despliegue en GitHub Pages.

---

## Matriz componente → dependencia → suite → trigger

| Componente del Dashboard | Dependencias directas | Suite asociada | Estado en `paths:` | Estado en `assemble` |
| :--- | :--- | :--- | :--- | :--- |
| **Métricas de calidad** | `generate-quality-metrics.mjs`<br>`validate-quality-metrics.mjs`<br>`quality-contract.mjs` | `test-quality-metrics.mjs`<br>`test-schema-validator-parity.mjs` | Presente | Presente |
| **Workflows diagnósticos** | `node-quality.yml`<br>`static-quality.yml` | `test-node-quality-workflow.mjs`<br>`test-node-quality-workflow-crlf.mjs` | Presente | Presente |
| **Runtime de Actions Node 24** | `.github/workflows/*.yml` | `test-actions-runtime.mjs` | Presente | **FALTA** |
| **Auditoría y gobernanza** | `audit-repository.mjs`<br>`main-protection.mjs` | `test-audit-profiles.mjs`<br>`test-main-protection.mjs` | Presente | Presente |
| **Ensamblado y vista web** | `assemble-dashboard.mjs`<br>`validate-dashboard.mjs`<br>`dashboard-contract.mjs`<br>`dashboard/**` | `test-history-rendering.mjs`<br>`test-dashboard.mjs` | Presente | Presente |
| **Evidencia y lector ZIP** | `collect-quality-evidence.mjs`<br>`zip-entry-reader.mjs` | `test-quality-evidence.mjs` | Presente | Presente |
| **Histórico y fixtures** | `persist-quality-history.mjs`<br>`validate-quality-history.mjs`<br>`fixture-history-legacy.mjs` | `test-quality-history.mjs` | `fixture-history-legacy.mjs` **FALTA** | Presente |
| **Índice y paginación** | `collect-quality-history.mjs`<br>`validate-quality-history-index.mjs`<br>`history-pagination.mjs` | `test-quality-history-index.mjs` | Presente | Presente |
| **Cuarentena histórica** | `history-quarantine.mjs`<br>`schemas/quality-history-quarantine.schema.json` | `test-history-quarantine.mjs` | Presente | **FALTA** |
| **Resiliencia API GitHub** | `github-api-request.mjs` | `test-github-api-resilience.mjs` | **FALTA** | **FALTA** |
| **Resiliencia histórico** | `collect-quality-history.mjs`<br>`persist-quality-history.mjs` | `test-history-api-resilience.mjs`<br>`test-history-production-path.mjs` | Presente | Presente |
| **Integridad de triggers** | `test-dashboard-trigger-paths.mjs` | `test-dashboard-trigger-paths.mjs` | Presente | Presente |
| **Gate universal independiente** | `main-quality-gate.yml` | `test-main-quality-gate.mjs` | *No aplica (gate independiente)* | *No aplica* |

*Nota de auditoría sobre `test-main-quality-gate.mjs`:*
La exclusión de `test-main-quality-gate.mjs` de `quality-dashboard.yml` es **correcta e intencionada**. `main-quality-gate.yml` es el validador universal de PRs y commits hacia `main`, independiente del flujo de publicación del dashboard. No debe añadirse a `quality-dashboard.yml` para evitar acoplamientos circulares entre el pipeline de Pages y la gobernanza general de ramas.

---

## Arquitectura contractual objetivo

1. **Sincronización de `assemble` en `quality-dashboard.yml`:**
   El job `assemble` debe ejecutar las 17 suites pertenecientes al ciclo de vida del dashboard (todas las 18 suites del repositorio excepto `test-main-quality-gate.mjs`). Se incorporan los 3 pasos faltantes:
   - `node scripts/test-actions-runtime.mjs`
   - `node scripts/test-history-quarantine.mjs`
   - `node scripts/test-github-api-resilience.mjs`

2. **Cierre de dependencias en `paths:` de `quality-dashboard.yml`:**
   Se incorporan a `pull_request.paths` y `push.paths`:
   - `"scripts/fixture-history-legacy.mjs"`
   - `"scripts/test-github-api-resilience.mjs"`

3. **Endurecimiento de `test-dashboard-trigger-paths.mjs`:**
   El test contractual no se limitará a 3 rutas fijas, sino que verificará:
   - Que `pull_request.paths` y `push.paths` contienen todas las dependencias requeridas (incluyendo fixtures y suites relacionadas).
   - Que `assemble` ejecuta explícitamente todas las suites del dominio del dashboard (17 suites identificadas).
   - Que ambos bloques (`pull_request.paths` y `push.paths`) se mantienen perfectamente sincronizados.

---

## Invariantes

- **Invariante 1 (Independencia de Main Quality Gate):** [.github/workflows/main-quality-gate.yml](file:///c:/Users/Alex/OneDrive/Documenti/GitHub/project-quality/.github/workflows/main-quality-gate.yml) y [scripts/test-main-quality-gate.mjs](file:///c:/Users/Alex/OneDrive/Documenti/GitHub/project-quality/scripts/test-main-quality-gate.mjs) permanecen 100% inalterados. El gate universal de `main` sigue ejecutando todas las suites (`test-*.mjs`) sin filtros de rutas.
- **Invariante 2 (Preservación de Ensamblado, Cuarentena, Histórico y Despliegue):** El proceso de construcción del sitio (`assemble-dashboard.mjs`), generación y subida del manifiesto de cuarentena (`history-quarantine.json`), persistencia de histórico (`persist-quality-history.mjs`) y despliegue en Pages permanece idéntico.
- **Invariante 3 (Contratos y esquemas de datos):** No se alteran schemas JSON (`schemas/*.json`), contratos serializados ni versiones de esquemas.
- **Invariante 4 (Código productivo):** No se modifica ningún script productivo (`scripts/*.mjs` que no sean tests o workflows).
- **Invariante 5 (Compatibilidad estricta):** Todas las 18 suites de prueba existentes deben pasar en verde con código de salida `0`.

---

## Compatibilidad con sprints previos

- **PQ-OX14**: Extiende y culmina la cobertura contractual de dependencias de triggers iniciada en PQ-OX14, transformando la validación parcial (3 archivos) en una validación exhaustiva y reproducible.
- **PQ-OX15, PQ-OX16 y PQ-OX17**: Preserva la resiliencia y el retry único de la API de GitHub y de la persistencia histórica, consolidando la ejecución de `test-github-api-resilience.mjs` junto con `test-history-api-resilience.mjs` y `test-history-production-path.mjs` dentro del pipeline de Pages.
- **PQ-OX07 y PQ-OX08**: Conecta formalmente la ejecución de `test-history-quarantine.mjs` y `test-actions-runtime.mjs` en el job que genera el manifiesto y utiliza las GitHub Actions.

---

## Matriz de pruebas

| Prueba / Verificación | Tipo | Objetivo |
| :--- | :--- | :--- |
| `test-dashboard-trigger-paths.mjs` | Contractual (unidad) | Validar exhaustivamente la presencia de todas las dependencias en `paths:` y la presencia de las 17 suites en `assemble`. |
| `main-quality-gate.yml` | Integración CI | Validar que el gate universal sigue cubriendo el repositorio al 100%. |
| Batería completa de 18 suites | Determinista | Garantizar que las adiciones en `quality-dashboard.yml` no generan efectos colaterales. |
| `node --check scripts/*.mjs` | Sintaxis | Asegurar que los scripts de prueba son sintácticamente impecables. |

---

## Criterios de aceptación

- [ ] **CA1 (Suites en `assemble`):** El job `assemble` de `quality-dashboard.yml` incluye y ejecuta explícitamente `node scripts/test-actions-runtime.mjs`, `node scripts/test-history-quarantine.mjs` y `node scripts/test-github-api-resilience.mjs`.
- [ ] **CA2 (Dependencias en `paths`):** Los bloques `on.pull_request.paths` y `on.push.paths` de `quality-dashboard.yml` contienen `"scripts/fixture-history-legacy.mjs"` y `"scripts/test-github-api-resilience.mjs"`.
- [ ] **CA3 (Sincronía de triggers):** `pull_request.paths` y `push.paths` son idénticos entre sí respecto a la lista de archivos rastreados.
- [ ] **CA4 (Test contractual reforzado):** `scripts/test-dashboard-trigger-paths.mjs` aserta de forma determinista que las dependencias requeridas y las 17 suites están presentes en `quality-dashboard.yml`.
- [ ] **CA5 (Aislamiento de main gate):** `scripts/test-main-quality-gate.mjs` y `.github/workflows/main-quality-gate.yml` no son modificados y su suite pasa en verde.
- [ ] **CA6 (Preservación funcional):** El ensamblado del dashboard, la generación del histórico, la cuarentena y la subida de artefactos de Pages no sufren alteración alguna.
- [ ] **CA7 (Verificación global):** Las 18 suites de prueba terminan con código de salida `0` y `node --check` es limpio.

---

## Riesgos y estrategia de reversión

- **Riesgo 1 (Incremento del tiempo de job en CI):**
  *Impacto:* Bajo. Las 3 suites adicionales tardan conjuntamente menos de 1 segundo en Node 22 (son herméticas y ejecutan mocks sin dependencias de red externa).
- **Riesgo 2 (Incompatibilidad en trigger paths):**
  *Impacto:* Ninguno. Añadir rutas válidas solo previene falsos negativos en PRs donde se modifiquen dichas dependencias.
- **Estrategia de reversión:**
  Reversión atómica mediante `git revert` del commit de implementación. Al no existir migraciones de datos ni cambios en contratos serializados, la reversión restaura el estado previo sin impacto residual.

---

## Alcance y fuera de alcance

### Incluido en el alcance
- Adición de las 3 suites faltantes al job `assemble` en [.github/workflows/quality-dashboard.yml](file:///c:/Users/Alex/OneDrive/Documenti/GitHub/project-quality/.github/workflows/quality-dashboard.yml).
- Adición de las 2 dependencias faltantes a `pull_request.paths` y `push.paths` en `quality-dashboard.yml`.
- Actualización y robustecimiento de [scripts/test-dashboard-trigger-paths.mjs](file:///c:/Users/Alex/OneDrive/Documenti/GitHub/project-quality/scripts/test-dashboard-trigger-paths.mjs).
- Documentación T1 en `specs/017-dashboard-contract-closure/`.

### Fuera de alcance
- Modificar scripts productivos (`scripts/assemble-dashboard.mjs`, `scripts/collect-quality-history.mjs`, `scripts/persist-quality-history.mjs`).
- Limpiar funciones huérfanas/código muerto en `scripts/persist-quality-history.mjs` (identificado como deuda separada).
- Limpiar archivos residuales en `scripts/test-github-api-resilience.mjs` (identificado como deuda separada).
- Modificar esquemas (`schemas/*.json`) o contratos del dashboard.
- Modificar el flujo o archivo de [.github/workflows/main-quality-gate.yml](file:///c:/Users/Alex/OneDrive/Documenti/GitHub/project-quality/.github/workflows/main-quality-gate.yml).
