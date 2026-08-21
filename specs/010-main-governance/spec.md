# Especificación: Gobernanza real de `main`

## Contexto y problema

La auditoría de PQ-OX02 confirmó un falso positivo semántico en `scripts/audit-repository.mjs`. El auditor considera suficiente un ruleset activo con Pull Request, bloqueo de borrado, bloqueo de force push y un método de merge compatible, pero no comprueba que GitHub exija el gate agregado de calidad ni que no existan bypasses relevantes.

Ese resultado se publica como:

```text
governance.ruleset.status
→ summary.protectedMain
→ process.mainProtection
→ dashboard e histórico
```

Por tanto, Project Quality puede mostrar `main` como protegida aunque el merge no esté bloqueado por la validación de calidad correspondiente al perfil.

## Objetivo

Que `main-protection = pass` solo signifique que Project Quality ha podido demostrar, con información suficiente de GitHub, las garantías contractuales reales sobre la rama estable:

- cambios mediante Pull Request;
- bloqueo de borrado;
- bloqueo de force push o non-fast-forward;
- merge mediante commit de merge;
- gate agregado de calidad requerido y aplicable;
- ausencia de bypasses relevantes;
- mecanismo de protección aplicable a la rama `main` y en modo efectivo.

La ausencia, el error o la ambigüedad de una respuesta de GitHub nunca debe producir `pass`.

## Alcance

### Incluye

- Contrato explícito del gate de calidad merge-blocking en los cuatro perfiles de `audit-repository.mjs`.
- Extracción de la evaluación de gobernanza a una unidad pura y testeable.
- Normalización de rulesets y branch protection clásica antes de evaluar el contrato.
- Comprobación de la regla `required_status_checks` contra el gate agregado definido por el perfil.
- Comprobación de bypass actors de rulesets y bypasses/admin enforcement de branch protection.
- Soporte equivalente para un ruleset activo aplicable o una branch protection clásica demostrablemente suficiente.
- Integración con `audit-repository.mjs`, manteniendo los campos públicos existentes.
- Pruebas deterministas de la unidad, integración del auditor, cuatro perfiles, ensamblado, histórico y dashboard.
- Documentación contractual y activación del nuevo test en el workflow del dashboard.

### Fuera de alcance

- Reabrir o modificar PQ-OX01.
- Cambiar la identidad, retención o poda del histórico.
- Reescribir snapshots históricos existentes.
- Rediseñar visualmente el dashboard.
- Cambiar `schemaVersion` o migrar los schemas del histórico.
- Hardcodear nombres de checks fuera del contrato de perfiles.
- Convertir lint, tipos, build, tests, cobertura, E2E o smoke en required checks individuales.
- Corregir el fallo preexistente de CRLF de `test-node-quality-workflow.mjs`.
- Refactorizar globalmente el auditor o limpiar deuda no relacionada.

## Usuarios y escenarios

- El mantenedor consulta el dashboard y necesita que “Protegida” represente una garantía efectiva, no solo la presencia de un ruleset.
- El auditor procesa un repositorio Node o estático según uno de los cuatro perfiles existentes.
- El histórico recibe el estado normalizado sin cambiar su contrato ni reinterpretar snapshots antiguos.
- Las pruebas unitarias alimentan la evaluación con fixtures sintéticos, sin depender de GitHub real.

## Requisitos funcionales

1. Cada perfil debe declarar explícitamente el contexto del check agregado que bloquea el merge mediante una propiedad estable `requiredQualityCheck.context`.
2. Los perfiles Node deben exigir `Reusable Node.js quality / Quality gates` y el perfil estático debe exigir `Reusable static quality / Static quality gates`, porque esos nombres son parte del contrato explícito de los workflows reutilizables y no una heurística del evaluador.
3. Un ruleset solo puede contribuir a `pass` si:
   - es de ramas, está activo y su condición incluye realmente la rama por defecto;
   - contiene una regla Pull Request;
   - las restricciones de métodos de merge aplicables dejan únicamente `merge`;
   - existen reglas `deletion` y `non_fast_forward`;
   - existe una regla `required_status_checks` cuyo conjunto de checks contiene exactamente el contexto requerido por el perfil;
   - la respuesta demuestra que no hay `bypass_actors` configurados.
4. Si hay varios rulesets activos aplicables, sus garantías se normalizan conjuntamente: las reglas presentes pueden complementar las garantías, las restricciones de métodos se intersectan y cualquier bypass o información incompleta relevante impide el `pass`.
5. Una branch protection clásica solo puede producir `pass` si demuestra:
   - `required_pull_request_reviews` habilitado;
   - required status checks con el contexto requerido por el perfil;
   - `enforce_admins` habilitado;
   - `allow_deletions` deshabilitado;
   - `allow_force_pushes` deshabilitado;
   - configuración del repositorio con merge commits habilitados y squash/rebase deshabilitados;
   - listas de bypass de Pull Request explícitamente vacías.
6. Los valores de API equivalentes representados como booleano u objeto `{ enabled }` deben normalizarse sin cambiar la semántica.
7. Un mecanismo no aplicable a `main`, desactivado o con una garantía conocida ausente produce `fail`; un error de API, campo indispensable ausente o respuesta ambigua produce `unknown`. Ninguno produce `pass`.
8. Si el endpoint de rulesets confirma que no hay un mecanismo activo aplicable, el auditor puede evaluar la branch protection clásica. Si la enumeración o el detalle de rulesets es incompleto por error, la branch protection no puede ocultar esa incertidumbre.
9. Se conservan `governance.ruleset.status`, el check `main-protection`, `process.mainProtection` y `schemaVersion: 1`. `governance.ruleset` puede incorporar `mechanism`, `reason` y datos de trazabilidad opcionales.
10. Los snapshots históricos existentes siguen siendo legibles y no se reescriben. Los snapshots nuevos consumen el mismo campo `mainProtection` normalizado.

## Criterios de aceptación

- [ ] PR obligatorio y contexto de quality gate correcto producen `pass` con un ruleset activo aplicable.
- [ ] PR obligatorio sin required quality check no produce `pass`.
- [ ] Required quality check sin regla Pull Request no produce `pass`.
- [ ] Ruleset desactivado no produce `pass`.
- [ ] Ruleset que no aplica a `main` no produce `pass`.
- [ ] Un bypass actor relevante no produce `pass`.
- [ ] Información insuficiente o error de API produce `unknown` o equivalente no verde con razón trazable.
- [ ] Branch protection clásica con garantías equivalentes y configuración de merge demostrable produce `pass`.
- [ ] Configuración parcialmente válida, incluidos métodos `merge` y `squash`, no produce falso verde.
- [ ] Los cuatro perfiles declaran el contexto correcto y la evaluación no comparte accidentalmente el contrato estático con los perfiles Node.
- [ ] El auditor integra el resultado en `governance.ruleset.status` y `checks[].id = main-protection` sin cambiar el schema público.
- [ ] `data.json`, el snapshot histórico y las validaciones del dashboard siguen funcionando; los snapshots antiguos no se modifican.
- [ ] `git diff --check` queda limpio y las suites directamente afectadas y la regresión general finalizan con código cero, salvo el fallo CRLF preexistente documentado si reaparece.

## Casos de error y límites

- `rulesets` o `branch protection` inaccesibles: `unknown` salvo que GitHub haya demostrado explícitamente la ausencia del mecanismo consultado.
- Un detalle de ruleset no descargable cuando puede afectar a la rama: `unknown`.
- `bypass_mode` `always`, `pull_request` o `exempt` dentro de un ruleset aplicable se trata como bypass relevante, porque el actor puede evitar reglas del mecanismo.
- En branch protection, `enforce_admins` falso o ausente no se interpreta como protección suficiente frente a administradores.
- La ausencia de `bypass_pull_request_allowances` no demuestra que la lista esté vacía; si la API no permite verificarla, el resultado es `unknown`.
- No se exigen aprobaciones humanas adicionales ni reglas de conversación que no formen parte del contrato aprobado.

## Decisiones técnicas y alternativas descartadas

1. **Contrato de gate por perfil.** Se añade `requiredQualityCheck.context` a cada perfil. Se descarta aceptar cualquier required check y se descarta codificar en el evaluador nombres de Actions sin pasar por el contrato del perfil.
2. **Mecanismo equivalente.** Se aceptan rulesets y branch protection clásica. Se descarta exigir rulesets por motivos de implementación o presentar una protección parcial como suficiente.
3. **Unidad pura.** La evaluación recibe fixtures normalizados y devuelve `pass`, `fail` o `unknown` con razones. Se descarta mantener la decisión dentro del bloque monolítico de llamadas HTTP.
4. **Compatibilidad.** Se conserva el campo de estado existente y no se cambia el schema. Se descarta reescribir el histórico para “corregir” estados antiguos.
5. **Bypasses.** Se descarta asumir que un bypass es irrelevante solo porque todavía requiere una Pull Request; si puede saltarse reglas aplicables, no se demuestra la garantía contractual.

## Invariantes

- Solo una garantía demostrada por GitHub puede producir `pass`.
- `protected: true` o la existencia de cualquier ruleset no son suficientes.
- La existencia de cualquier required check no demuestra el gate de calidad de Project Quality.
- `unknown` y `fail` nunca se contabilizan como `protectedMain`.
- La evaluación de proceso no modifica la interpretación de la evidencia técnica ni del histórico antiguo.

## Riesgos, compatibilidad y reversión

- Repositorios que antes aparecían como protegidos pueden pasar a `fail` o `unknown` hasta que exista el gate requerido y la API exponga todos los datos necesarios. Es un endurecimiento intencionado contra falsos verdes.
- La branch protection clásica puede requerir una respuesta con información de bypass explícita; si el endpoint autorizado no la devuelve, Project Quality informará de incertidumbre en vez de sobreafirmar.
- El cambio no añade dependencias ni migraciones. Revertir el commit restaura el evaluador anterior y no exige modificar datos persistentes.
