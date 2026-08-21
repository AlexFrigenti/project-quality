# Especificación: Verdad de la evidencia y fallos explícitos del collector

## Contexto y problema

Una auditoría read-only identificó dos debilidades relacionadas en `scripts/collect-quality-evidence.mjs` (base `origin/main` `e192175`), ambas confirmadas por inspección y reproducibles de forma determinista:

### R1 — conclusión autodeclarada

El collector selecciona runs completados cuyo `head_sha` coincide con el HEAD actual, pero no contrasta:

- `run.conclusion` real con `report.conclusion` declarado en el artifact;
- `report.run.attempt` con `run.run_attempt`.

Escenarios defectuosos actuales (el collector los acepta como evidencia válida):

1. artifact con `passed` y run con `failure` (por ejemplo, un job posterior al quality falla, o un step posterior a la subida del artifact);
2. run `cancelled` o `timed_out` con artifact previamente publicado;
3. re-run con nuevo attempt: el artifact de un attempt anterior se consume aunque el estado final del run corresponda a otro attempt.

### R2 — artifact ilegible tratado como pendiente

Durante la iteración de candidatos, cualquier error de descarga, descompresión, falta del archivo esperado, JSON corrupto o violación del contrato se absorbe con un `catch {}` vacío y termina produciendo el estado genérico `pending` ("Evidencia pendiente para el commit actual"). Lo mismo ocurre si la consulta de artifacts de un run falla o si ningún run del HEAD tiene artifact disponible. Resultado: "no existe evidencia todavía" es indistinguible de "existe evidencia candidata pero no puede leerse ni validarse".

## Objetivo

Que GitHub sea la fuente de verdad de la evidencia publicada:

- una evidencia no puede considerarse actual/válida cuando contradice la conclusión real del workflow correspondiente;
- los attempts/re-runs quedan asociados correctamente a la evidencia consumida;
- un artifact existente pero ilegible, corrupto o inválido no se representa como ausencia inocua de evidencia;
- el dashboard distingue ambas situaciones sin sobreestimar la calidad.

## Alcance

### Incluye

- Contrato de selección y consistencia del collector (`collectQualityEvidence`).
- Distinción entre `pending` (ausencia real) y `unavailable` (evidencia candidata no utilizable) con mensajes precisos.
- Punto de inyección de dependencias de red/lectura para pruebas deterministas.
- Pruebas de regresión que demuestren los comportamientos defectuosos originales.
- Ajuste mínimo de etiqueta en `dashboard/index.html` para no mostrar "Sin evidencia" cuando hay causa conocida.
- Actualización de la documentación contractual afectada (`QUALITY_METRICS.md`, `DASHBOARD.md`).

### Fuera de alcance

- Definición de protección de `main`, identidad/retención del histórico, refactor global del collector, deuda CRLF de `test-node-quality-workflow.mjs`, diseño visual del dashboard, consolidación de contratos.

## Usuarios y escenarios

- Mantenedor que consulta el dashboard: necesita saber si un commit está validado, aún sin validar, o si existe evidencia que Project Quality no ha podido utilizar (con causa).
- Histórico persistente: solo debe consolidar estados veraces; los estados no utilizables ya se excluyen de la foto validada.

## Requisitos funcionales

1. Un candidato solo puede devolverse como `current` si se cumplen todos los vínculos con su run:
   - `parsed.project.repository === repository`;
   - `summary.commit.sha === currentCommitSha`;
   - `summary.commit.branch === defaultBranch`;
   - `summary.run.id === run.id`;
   - `summary.run.attempt === run.run_attempt`;
   - par conclusión válido: `(run.conclusion === "success" && summary.conclusion === "passed") || (run.conclusion === "failure" && summary.conclusion === "failed")`.
2. Cualquier otra combinación de conclusiones (incluye `cancelled`, `timed_out`, `skipped`, reportes `unknown`) rechaza el candidato con una causa explícita; nunca se publica como evidencia válida.
3. El run completado más reciente del SHA actual es autoritativo: es el único que se evalúa. No existe retroceso a ejecuciones anteriores completadas del mismo SHA, ni siquiera cuando una anterior sería consistente.
4. Si el run completado más reciente del SHA actual no resulta utilizable (contradicción de conclusión, intento incorrecto, descarga/descompresión/parsing/validación, falta del artifact o consulta fallida), el collector devuelve `unavailable` con la causa explícita, sin sustituirlo por ejecuciones anteriores.
5. Si no existe ningún run completado para el SHA actual, el comportamiento es el actual: `pending`. Las ejecuciones en curso no se evalúan ni bloquean.
6. La firma pública de `collectQualityEvidence`, `pendingQualityEvidence`, `sanitizeQualityMetrics` y `buildQualitySummary` no cambia; la inyección de red/lectura es opcional (`deps`) con valores por defecto de producción.

## Criterios de aceptación

- [ ] Artifact `passed` + run `failure` no produce `current`; produce `unavailable` con causa de contradicción.
- [ ] Run `cancelled` con artifact no produce `current`.
- [ ] Artifact de un attempt anterior (`report.run.attempt !== run.run_attempt`) no se consume.
- [ ] Par `(success, passed)` sigue produciendo `current` (no sobre-corrección).
- [ ] Par `(failure, failed)` sigue produciendo `current` con conclusión `failed` (los fallos reales siguen visibles, no se transforman en pendientes).
- [ ] Descarga fallida, ZIP ilegible, archivo ausente, JSON corrupto e informe que viola el contrato producen `unavailable` con causa (antes: `pending`).
- [ ] Run más reciente contradictorio, cancelado, ilegible o sin artifact con un run anterior consistente del mismo SHA: prevalece el más reciente y el resultado es `unavailable` (sin retroceso).
- [ ] Sin runs completados del SHA: se mantiene `pending`.
- [ ] Las pruebas usan fixtures deterministas (sin red real) y habrían fallado contra la implementación original.
- [ ] Suites afectadas en verde; `git diff --check` limpio.

## Casos de error y límites

- Fallo de la API al listar runs: `unavailable` (sin cambio).
- Fallo de la API al listar artifacts del run más reciente con SHA coincidente: causa registrada; resultado `unavailable`.
- Mensaje de causa acotado a 200 caracteres (límite que ya aplica el histórico sanitizado).
- Repositorios privados: sin cambio de sanitización; los mensajes no contienen URLs ni datos sensibles.

## Decisiones pendientes

Ninguna abierta. Decisión adoptada: reutilizar el estado `unavailable` existente en lugar de crear un estado nuevo (los consumidores `validate-dashboard`, `persist-quality-history` y ambos HTML ya lo soportan).

## Riesgos y restricciones

- Repos auditados cuyos workflows antiguos completaban sin publicar artifact pasarán de `pending` a `unavailable`; es el comportamiento buscado (causa conocida frente a ausencia inocua) pero cambia la etiqueta visible.
- Si el run completado más reciente de un SHA resulta ilegible o contradictorio, el commit se muestra sin evidencia utilizable aunque existan ejecuciones anteriores válidas del mismo SHA: es la consecuencia deliberada de hacer autoritativo el run más reciente. La reejecución o un nuevo push restablecen la evidencia.
