# Plan de Implementación TDD: PQ-OX18 — Cierre contractual de quality-dashboard.yml y trigger paths

## Enfoque y disciplina de desarrollo

- **Metodología:** TDD estricto y riguroso. Observar fallos en rojo (RED) antes de implementar, aplicar la corrección mínima y verificar verde (GREEN).
- **Proporcionalidad:** Alcance delimitado a [.github/workflows/quality-dashboard.yml](file:///c:/Users/Alex/OneDrive/Documenti/GitHub/project-quality/.github/workflows/quality-dashboard.yml) y [scripts/test-dashboard-trigger-paths.mjs](file:///c:/Users/Alex/OneDrive/Documenti/GitHub/project-quality/scripts/test-dashboard-trigger-paths.mjs).
- **Preservación de invariantes:** Sin modificaciones a código de producción ni al gate universal independiente de `main`.

---

## Secuencia de ejecución TDD futura

### 1. Prueba RED: Detección de suites ausentes en el job `assemble`
- **Acción:** En [scripts/test-dashboard-trigger-paths.mjs](file:///c:/Users/Alex/OneDrive/Documenti/GitHub/project-quality/scripts/test-dashboard-trigger-paths.mjs), añadir la verificación de que el job `assemble` ejecuta las suites requeridas del ciclo de vida del dashboard:
  - `node scripts/test-actions-runtime.mjs`
  - `node scripts/test-history-quarantine.mjs`
  - `node scripts/test-github-api-resilience.mjs`
- **Resultado esperado (RED):** Al ejecutar `node scripts/test-dashboard-trigger-paths.mjs`, la aserción debe fallar indicando que alguna de estas suites no se encuentra en el cuerpo del job `assemble` de `quality-dashboard.yml`.

### 2. Prueba RED: Detección de dependencias ausentes en `pull_request.paths`
- **Acción:** En `scripts/test-dashboard-trigger-paths.mjs`, expandir la lista de rutas requeridas en `pull_request.paths` para incluir:
  - `scripts/fixture-history-legacy.mjs`
  - `scripts/test-github-api-resilience.mjs`
- **Resultado esperado (RED):** La suite debe fallar con un error explícito (e.g., `pull_request.paths debe incluir scripts/fixture-history-legacy.mjs`).

### 3. Prueba RED: Detección de dependencias ausentes en `push.paths`
- **Acción:** Asegurar que la verificación de rutas requeridas se aplique simétricamente a `push.paths`.
- **Resultado esperado (RED):** La suite debe fallar verificando la ausencia en `push.paths`.

### 4. Corrección mínima del workflow `quality-dashboard.yml`
- **Acción:**
  1. En `quality-dashboard.yml`, añadir a `pull_request.paths` y `push.paths`:
     - `"scripts/fixture-history-legacy.mjs"`
     - `"scripts/test-github-api-resilience.mjs"`
  2. En el job `assemble`, añadir los pasos de ejecución correspondientes para:
     - `test-actions-runtime.mjs`
     - `test-history-quarantine.mjs`
     - `test-github-api-resilience.mjs`

### 5. Corrección y consolidación de `test-dashboard-trigger-paths.mjs`
- **Acción:**
  - Consolidar la suite contractual para verificar la correspondencia entre todas las dependencias identificadas y las listas `paths:`.
  - Validar que las 17 suites pertenecientes al ciclo de vida del dashboard están presentes en el job `assemble`.
  - Asegurar mensajes descriptivos de fallo en caso de regresión o divergencia entre `pull_request` y `push`.

### 6. Pruebas GREEN del contrato
- **Acción:** Ejecutar `node scripts/test-dashboard-trigger-paths.mjs`.
- **Resultado esperado (GREEN):** La suite debe pasar con código de salida `0` y emitir confirmación de validación contractual.

### 7. Verificación del gate independiente de `main`
- **Acción:** Ejecutar `node scripts/test-main-quality-gate.mjs`.
- **Resultado esperado:** Salida limpia `0`. Confirmar que [.github/workflows/main-quality-gate.yml](file:///c:/Users/Alex/OneDrive/Documenti/GitHub/project-quality/.github/workflows/main-quality-gate.yml) no ha sido modificado y que su contrato universal de calidad permanece intacto.

### 8. Verificación de no alteración funcional en ensamblado, cuarentena, histórico y despliegue
- **Acción:**
  - Ejecutar `node scripts/test-dashboard.mjs`.
  - Ejecutar `node scripts/test-history-quarantine.mjs`.
  - Ejecutar `node scripts/test-quality-history.mjs`.
  - Ejecutar `node scripts/test-actions-runtime.mjs`.
- **Resultado esperado:** Todas las suites deterministas pasan sin fallos. Se confirma la preservación absoluta de los contratos de salida (`data.json`, `history-quarantine.json`, `history.json`).

### 9. Ejecución completa de la batería de pruebas
- **Acción:** Ejecutar todas las suites del repositorio:
  ```bash
  for file in scripts/test-*.mjs; do node "$file"; done
  ```
  y comprobación sintáctica:
  ```bash
  for file in scripts/*.mjs; do node --check "$file"; done
  ```
- **Resultado esperado:** 18 de 18 suites pasan en verde; sintaxis verificada sin advertencias ni errores.

### 10. Revisión final del diff
- **Acción:** Ejecutar `git diff origin/main...HEAD` y verificar:
  - Solo modificados `.github/workflows/quality-dashboard.yml` y `scripts/test-dashboard-trigger-paths.mjs`.
  - Cero modificaciones a scripts productivos o schemas.
  - Formato y saltos de línea limpios (`git diff --check`).
