# Plan de implementación: PQ-OX23 — Paridad contractual del esquema de cuarentena histórica

## Resumen del enfoque

Este plan establece una implementación estrictamente TDD (RED → GREEN) para cerrar la brecha de paridad en [`scripts/test-schema-validator-parity.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/test-schema-validator-parity.mjs), eliminando la variable huérfana `quarantine` y dotándola de aserciones completas contra [`scripts/history-quarantine.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/history-quarantine.mjs) y [`scripts/quality-contract.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/quality-contract.mjs).

---

## Fases de ejecución

### Fase 1 — RED (Demostración de aserciones ausentes y discrepancias simuladas)
1. **Comprobar precondiciones:**
   - Rama: `feat/pq-ox23-quarantine-schema-parity`.
   - Base `origin/main` en `63092ab98e920eb36b256b5807e39b24405904e4`.
   - Árbol de trabajo 100% limpio.
2. **Añadir aserciones RED en `scripts/test-schema-validator-parity.mjs`:**
   - Exigir temporalmente una aserción de paridad que falle si no se evalúa `quarantine` (por ejemplo, validando la inclusión de `quarantine` en el bucle o comprobando una condición estricta sobre sus `$defs`).
3. **Ejecutar prueba RED:**
   - Ejecutar `node scripts/test-schema-validator-parity.mjs` y registrar el fallo esperado en rojo.

### Fase 2 — GREEN (Incorporación de paridad completa para quarantine)
1. **Actualizar [`scripts/test-schema-validator-parity.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/test-schema-validator-parity.mjs):**
   - Importar `QUARANTINE_REASONS` desde `./history-quarantine.mjs`.
   - Importar `QUARANTINE_DETAIL_LIMIT` desde `./quality-contract.mjs`.
   - Incluir `quarantine` en el bucle `for (const root of [metrics, history, historyIndex, quarantine])`.
   - Añadir aserción `assert.equal(quarantine.$defs.entry.additionalProperties, false)`.
   - Añadir aserción `assertEnum(quarantine.$defs.entry.properties.reason.enum, QUARANTINE_REASONS, "quarantine reason")`.
   - Añadir aserción `assert.equal(quarantine.$defs.entry.properties.detail.maxLength, QUARANTINE_DETAIL_LIMIT)`.
   - Añadir aserción `assert.equal(quarantine.$defs.entry.properties.releaseTag.pattern, CONTRACT_PATTERNS.historyReleaseTag)`.
   - Añadir aserción `assert.equal(quarantine.properties.generatedAt.pattern, CONTRACT_PATTERNS.rfc3339DateTime)`.
2. **Ejecutar prueba GREEN:**
   - `node scripts/test-schema-validator-parity.mjs` → `Schema-validator parity válido.`

### Fase 3 — Regresión y verificación integral
1. **Ejecución de las 19 suites completas:**
   - Ejecutar todos los `scripts/test-*.mjs` y confirmar que las 19 suites pasan con código de salida 0.
2. **Verificación de sintaxis:**
   - `node --check scripts/*.mjs`.
3. **Verificación de esquemas:**
   - Parsear todos los esquemas en `schemas/*.json`.
4. **Verificación de diff:**
   - `git diff --check`.
   - `git diff --name-only origin/main...HEAD` asegurando que contiene exactamente los archivos documentados y autorizados.

---

## Criterios de parada y mitigación

- Si alguna aserción falla en GREEN, verificar si hay alguna discrepancia en el schema antes de modificar cualquier archivo productivo.
- Preservar intactos todos los validadores en producción y la lógica activa de cuarentena.
