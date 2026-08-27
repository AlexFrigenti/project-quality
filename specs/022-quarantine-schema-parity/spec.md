# Especificación: PQ-OX23 — Paridad contractual del esquema de cuarentena histórica

## Contexto y problema

El repositorio `AlexFrigenti/project-quality` define 4 esquemas JSON formales en el directorio `schemas/`:
1. `schemas/quality-metrics.schema.json`
2. `schemas/quality-history.schema.json`
3. `schemas/quality-history-index.schema.json`
4. `schemas/quality-history-quarantine.schema.json`

La suite [`scripts/test-schema-validator-parity.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/test-schema-validator-parity.mjs) tiene como objetivo fundamental asegurar la **paridad matemática estricta** entre las definiciones de los esquemas JSON y los contratos / constantes de JavaScript en runtime ([`scripts/quality-contract.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/quality-contract.mjs) y [`scripts/history-quarantine.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/history-quarantine.mjs)).

### Evidencia exacta de la brecha
En [`scripts/test-schema-validator-parity.mjs:37`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/test-schema-validator-parity.mjs#L37), se carga el esquema del manifiesto de cuarentena:
```javascript
const metrics = await schema("schemas/quality-metrics.schema.json");
const history = await schema("schemas/quality-history.schema.json");
const historyIndex = await schema("schemas/quality-history-index.schema.json");
const quarantine = await schema("schemas/quality-history-quarantine.schema.json");
```

Sin embargo:
1. **Variable huérfana:** La variable `quarantine` **no vuelve a utilizarse en ninguna aserción ni función** a lo largo de todo el archivo.
2. **Exclusión en el bucle de objetos raíz cerrados:** En la línea 63, el bucle sólo valida tres esquemas:
   ```javascript
   for (const root of [metrics, history, historyIndex]) {
     assert.equal(root.additionalProperties, false, `${root.title}: el objeto raíz debe estar cerrado`);
   }
   ```
   `quarantine` queda excluido de esta comprobación.
3. **Ausencia de comprobaciones sobre `$defs.entry`:** No se valida que `quarantine.$defs.entry.additionalProperties === false`.
4. **Ausencia de paridad de enums y límites:** No se comprueba que `quarantine.$defs.entry.properties.reason.enum` coincida con los miembros de `QUARANTINE_REASONS`, ni que `quarantine.$defs.entry.properties.detail.maxLength` coincida con `QUARANTINE_DETAIL_LIMIT`, ni que los patrones de `releaseTag` y `generatedAt` coincidan con `CONTRACT_PATTERNS`.

---

## Distinción: Cobertura de esquema vs comportamiento en runtime

- **Comportamiento en runtime:** La lógica activa de creación, saneamiento y deserialización de cuarentena histórica está validada en [`scripts/history-quarantine.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/history-quarantine.mjs) y probada funcionalmente en [`scripts/test-history-quarantine.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/test-history-quarantine.mjs).
- **Paridad de esquema (esta spec):** Garantiza que el contrato serializado formal expuesto en `schemas/quality-history-quarantine.schema.json` y las definiciones JavaScript no diverjan ante futuros cambios o refactorizaciones, manteniendo la coherencia de los 4 esquemas del estándar.

---

## Fuentes autoritativas y estructura del esquema

### 1. Estructura de `schemas/quality-history-quarantine.schema.json` ([L1-L49](file:///c:/Users/AlexF/Documents/GitHub/project-quality/schemas/quality-history-quarantine.schema.json#L1-L49))
- **Objeto raíz cerrado:** `additionalProperties: false` ([L7](file:///c:/Users/AlexF/Documents/GitHub/project-quality/schemas/quality-history-quarantine.schema.json#L7)).
- **Definición `$defs.entry`:** Existe en [L26-L47](file:///c:/Users/AlexF/Documents/GitHub/project-quality/schemas/quality-history-quarantine.schema.json#L26-L47).
- **Entrada cerrada:** `$defs.entry.additionalProperties: false` ([L29](file:///c:/Users/AlexF/Documents/GitHub/project-quality/schemas/quality-history-quarantine.schema.json#L29)).
- **Enum de razones:** `$defs.entry.properties.reason.enum` ([L43](file:///c:/Users/AlexF/Documents/GitHub/project-quality/schemas/quality-history-quarantine.schema.json#L43)).
- **Límite de detalle:** `$defs.entry.properties.detail.maxLength: 200` ([L44](file:///c:/Users/AlexF/Documents/GitHub/project-quality/schemas/quality-history-quarantine.schema.json#L44)).
- **Patrón de release:** `$defs.entry.properties.releaseTag.pattern: "^quality-history-\\d{4}-(?:0[1-9]|1[0-2])$"` ([L39](file:///c:/Users/AlexF/Documents/GitHub/project-quality/schemas/quality-history-quarantine.schema.json#L39)).
- **Patrón de generatedAt:** `properties.generatedAt.pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$"` ([L18](file:///c:/Users/AlexF/Documents/GitHub/project-quality/schemas/quality-history-quarantine.schema.json#L18)).

### 2. Fuentes autoritativas en JavaScript
- **`QUARANTINE_REASONS`:** Exportado en [`scripts/history-quarantine.mjs:8-14`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/history-quarantine.mjs#L8-L14) como `Set(["invalid-name", "download-failed", "invalid-json", "invalid-snapshot", "asset-id-mismatch"])`.
- **`QUARANTINE_DETAIL_LIMIT`:** Exportado en [`scripts/quality-contract.mjs:31`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/quality-contract.mjs#L31) con el valor `200`.
- **`CONTRACT_PATTERNS.historyReleaseTag`:** Exportado en [`scripts/quality-contract.mjs:49`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/quality-contract.mjs#L49) (`"^quality-history-\\d{4}-(?:0[1-9]|1[0-2])$"`).
- **`CONTRACT_PATTERNS.rfc3339DateTime`:** Exportado en [`scripts/quality-contract.mjs:42`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/quality-contract.mjs#L42) (`"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$"`).

---

## Arquitectura objetivo

1. **Importación de fuentes autoritativas en `scripts/test-schema-validator-parity.mjs`:**
   - Importar `QUARANTINE_REASONS` desde `./history-quarantine.mjs`.
   - Importar `QUARANTINE_DETAIL_LIMIT` desde `./quality-contract.mjs`.

2. **Inclusión de `quarantine` en la validación de objetos raíz cerrados:**
   - Ampliar el bucle a `for (const root of [metrics, history, historyIndex, quarantine])` verificando `root.additionalProperties === false`.

3. **Aserciones de paridad estructural y semántica para `quarantine`:**
   - Validar `quarantine.$defs.entry.additionalProperties === false`.
   - Validar igualdad de miembros entre `quarantine.$defs.entry.properties.reason.enum` y `QUARANTINE_REASONS` mediante `assertEnum(quarantine.$defs.entry.properties.reason.enum, QUARANTINE_REASONS, "quarantine reason")` (comparación por miembros de `Set`, sin imponer orden contractual artificial).
   - Validar `quarantine.$defs.entry.properties.detail.maxLength === QUARANTINE_DETAIL_LIMIT`.
   - Validar `quarantine.$defs.entry.properties.releaseTag.pattern === CONTRACT_PATTERNS.historyReleaseTag`.
   - Validar `quarantine.properties.generatedAt.pattern === CONTRACT_PATTERNS.rfc3339DateTime`.

4. **Preservación estricta de archivos productivos:**
   - No se modifica `schemas/quality-history-quarantine.schema.json`, `scripts/history-quarantine.mjs` ni ningún otro validador o workflow productivo.

---

## Invariantes

- **Invariante 1 (Preservación de esquemas JSON):** Los 4 schemas JSON en `schemas/*.json` permanecen 100% inalterados.
- **Invariante 2 (Preservación de lógica de cuarentena e histórico):** [`scripts/history-quarantine.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/history-quarantine.mjs), [`scripts/collect-quality-history.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/collect-quality-history.mjs) y [`scripts/persist-quality-history.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/persist-quality-history.mjs) permanecen inalterados.
- **Invariante 3 (Preservación del inventario de suites):** El repositorio mantiene 19 suites de prueba en `scripts/test-*.mjs` y 18 suites en `assemble` de `quality-dashboard.yml`.
- **Invariante 4 (Compatibilidad acumulativa):** Se preservan todas las garantías de PQ-OX13 (resiliencia), PQ-OX15 (history API), PQ-OX16 (production path), PQ-OX17 (single retry), PQ-OX18 (dashboard closure), PQ-OX19 (history hygiene), PQ-OX20 (collector hygiene), PQ-OX21 (static quality contract) y PQ-OX22 (node quality contract).

---

## Matriz de pruebas

| Identificador | Nivel | Componente | Descripción |
| :--- | :--- | :--- | :--- |
| **M1** | Paridad | `test-schema-validator-parity.mjs` | Verifica que `quarantine.additionalProperties === false` en el bucle de objetos raíz. |
| **M2** | Paridad | `test-schema-validator-parity.mjs` | Verifica que `quarantine.$defs.entry.additionalProperties === false`. |
| **M3** | Paridad | `test-schema-validator-parity.mjs` | Verifica igualdad de miembros entre `quarantine.$defs.entry.properties.reason.enum` y `QUARANTINE_REASONS`. |
| **M4** | Paridad | `test-schema-validator-parity.mjs` | Verifica que `quarantine.$defs.entry.properties.detail.maxLength === QUARANTINE_DETAIL_LIMIT`. |
| **M5** | Paridad | `test-schema-validator-parity.mjs` | Verifica que `quarantine.$defs.entry.properties.releaseTag.pattern === CONTRACT_PATTERNS.historyReleaseTag`. |
| **M6** | Paridad | `test-schema-validator-parity.mjs` | Verifica que `quarantine.properties.generatedAt.pattern === CONTRACT_PATTERNS.rfc3339DateTime`. |
| **M7** | Integración global | 19 suites de prueba (`scripts/test-*.mjs`) | Todas las suites del proyecto se ejecutan y pasan con código 0. |
| **M8** | Sintaxis y schemas | Todo el repositorio | `node --check scripts/*.mjs` y parseo de schemas JSON sin errores. |

---

## Criterios de aceptación

1. `scripts/test-schema-validator-parity.mjs` utiliza efectivamente la variable `quarantine` y valida su paridad con `QUARANTINE_REASONS`, `QUARANTINE_DETAIL_LIMIT` y `CONTRACT_PATTERNS`.
2. Las 19 suites de prueba del repositorio pasan con código 0.
3. No se modifica ningún archivo productivo en `schemas/`, `scripts/` (salvo `test-schema-validator-parity.mjs`) ni `.github/workflows/`.
4. El diff contra `origin/main` se limita exclusivamente a `scripts/test-schema-validator-parity.mjs` y la documentación del sprint.

---

## Riesgos y mitigación

- **Riesgo:** Confusión de tipos o comparación de orden entre `Set` y `Array` en `reason.enum`.
  - *Mitigación:* Reutilizar la función auxiliar existente `assertEnum(schemaValue, expectedSet, message)` que convierte el array a `Set` antes de comparar con `deepEqual`.

---

## Alcance y fuera de alcance

### Dentro de alcance:
- Ampliar `scripts/test-schema-validator-parity.mjs` para incluir las comprobaciones de paridad de `quarantine`.
- Documentación del sprint en `specs/022-quarantine-schema-parity/`.

### Fuera de alcance:
- Modificar schemas JSON.
- Modificar `history-quarantine.mjs`, `quality-contract.mjs` o `validate-quality-history.mjs`.
- Modificar workflows o suites de prueba no relacionadas.
- Añadir dependencias de paquetes npm.
