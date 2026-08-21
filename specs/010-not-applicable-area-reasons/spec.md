# Especificación: Explicación de por qué no aplica en las áreas excluidas por perfil

## Contexto y problema

El sistema permite declarar `notApplicableAreas` por perfil en `scripts/audit-repository.mjs` (spec 003). Actualmente cada exclusión se conserva solo como el nombre del área (string), tanto en el informe de auditoría como en el snapshot histórico y en las vistas del dashboard. No queda registrado **por qué** esa área no aplica, lo que obliga a consultar `QUALITY_STANDARD.md` para interpretar cada exclusión.

## Objetivo

Permitir que cada área no aplicable incluya una explicación breve (`reason`) de por qué no aplica, de forma que la explicación sobreviva a todo el flujo: definición del perfil → informe de auditoría → datos derivados (`data.json`) → snapshot histórico sanitizado → validación → dashboard (`index.html` e `history.html`).

## Distinción semántica (se mantiene la de la spec 003)

- `notApplicableAreas` sigue siendo una declaración estática del perfil, nunca inferida de gates dinámicos.
- La explicación es texto breve y estable; no es un log ni una salida de comando.

## Decisiones

1. **Forma del dato**: cada entrada de `notApplicableAreas` admite dos formas:
   - Forma legacy: `"Tipos"` (string, solo nombre).
   - Forma enriquecida: `{ "area": "Tipos", "reason": "…" }` (objeto con exactamente esas claves).
2. **Forma canónica nueva**: los perfiles y la normalización de persistencia emiten la forma enriquecida. Las cadenas legacy se conservan tal cual al normalizar (sin inventar razones).
3. **Límites**: `area` ≤ 120 caracteres (existente); `reason` ≤ 240 caracteres, no vacía tras recortar.
4. **Compatibilidad histórica**: los snapshots ya publicados contienen arrays de strings. El validador y el esquema deben seguir aceptando la forma legacy; `collect-quality-history.mjs` revalida todos los assets en cada ejecución.
5. **Identidad del snapshot**: `identityFor` no incluye `notApplicableAreas`, por lo que añadir razones no altera las reglas de deduplicación existentes.
6. **Privacidad**: las razones son texto plano revisado a mano; quedan sujetas a los mismos controles anti-token/anti-URL de `validateQualityHistory` y `rejectUnsafe`.

## Alcance

### Incluye

- Declarar la razón de cada área no aplicable en los cuatro perfiles de `scripts/audit-repository.mjs`, con las mismas áreas canónicas de la spec 003.
- Extender `schemas/quality-history.schema.json` (`$defs.repository.notApplicableAreas.items`) para aceptar string o `{area, reason}`.
- Extender `scripts/validate-quality-history.mjs` para validar ambas formas.
- Extender `scripts/persist-quality-history.mjs` para normalizar ambas formas sin alterar la forma recibida.
- Renderizar la explicación en `dashboard/index.html` y `dashboard/history.html`, aceptando ambas formas.
- Actualizar documentación afectada (`QUALITY_HISTORY.md`) y pruebas.

### Fuera de alcance

- No modificar `assemble-dashboard.mjs` ni `collect-quality-history.mjs` (propagan el dato sin transformarlo).
- No añadir validación de `notApplicableAreas` en `validate-dashboard.mjs`: hoy no valida campos de perfil y un motivo malformado ya falla en `buildQualityHistorySnapshot` antes de publicar.
- No modificar la semántica de gates `not-applicable` en `quality-metrics.json`.
- No cambiar áreas canónicas de ningún perfil.

## Requisitos funcionales

1. Cada perfil declara sus áreas como `{ area, reason }` con razones basadas en `QUALITY_STANDARD.md`; `gestor-autonomo` mantiene `[]`.
2. El informe de auditoría propaga las entradas enriquecidas en `profile.notApplicableAreas`.
3. El snapshot histórico conserva `{ area, reason }` con los límites definidos; las entradas string legacy se conservan como string.
4. `validateQualityHistory` acepta arrays mixtos de strings y objetos válidos, y rechaza objetos con claves distintas, vacíos o fuera de límite.
5. Ambas vistas del dashboard muestran el área, la marca `No aplica` y, si existe, la explicación; con datos legacy siguen mostrando el área sin explicación.

## Criterios de aceptación

- [ ] CA1: Los cuatro perfiles mantienen sus áreas canónicas y cada exclusión lleva `reason` no vacía ≤ 240 caracteres.
- [ ] CA2: Un snapshot generado desde informes con entradas enriquecidas valida y conserva `{ area, reason }` íntegro.
- [ ] CA3: Un snapshot con entradas legacy (strings) sigue validando (compatibilidad con assets ya publicados).
- [ ] CA4: `validateQualityHistory` rechaza motivos inválidos: objeto sin `reason`, `reason` vacía, `reason` > 240, claves adicionales.
- [ ] CA5: `history.html` renderiza área + `No aplica` + explicación con forma enriquecida y solo área + `No aplica` con forma legacy.
- [ ] CA6: `index.html` renderiza la evidencia con explicaciones sin degradar el caso legacy.
- [ ] CA7: Las siete suites de pruebas existentes pasan al 100%.

## Casos de error y límites

- Entrada de perfil que no sea string ni objeto, u objeto sin `area`/`reason` no vacíos: `buildQualityHistorySnapshot` falla con error explícito.
- `reason` con URL o patrón de token: rechazada por los controles de privacidad existentes.
- Datos históricos legacy: ninguna ejecución falla; se muestran sin explicación.

## Riesgos y restricciones

- Si un consumidor externo asumiera strings estrictos en `notApplicableAreas`, verá objetos nuevos; el contrato versionado (`schemaVersion: 1`) admite ambas formas y así queda documentado.
- Las razones son declarativas: pueden quedar desactualizadas si cambia la arquitectura de un proyecto; se corrigen editando el perfil.
