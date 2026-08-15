# Flujo oficial de desarrollo asistido por IA

> Estado: propuesta para revisión escrita.
>
> Este documento define el diseño del flujo. No instala herramientas ni modifica los repositorios consumidores.

## Objetivo

Establecer un método reutilizable para desarrollar cambios asistidos por IA en:

- `AlexFrigenti/gestor-autonomo`;
- `AlexFrigenti/Nexo`;
- `AlexFrigenti/Nucleo`;
- `AlexFrigenti/Nucleo-preview`.

El método debe reducir cambios improvisados, regresiones, alcance no autorizado, código generado sin suficiente verificación y declaraciones de finalización sin evidencia.

## Principios

1. GitHub es la fuente de verdad del estado integrado.
2. `main` permanece estable y protegida.
3. Todo cambio relevante se realiza en una rama específica y mediante Pull Request.
4. La Pull Request se integra mediante merge commit, nunca mediante squash o rebase.
5. El merge requiere revisión del diff, checks correctos y confirmación explícita.
6. La rama remota se elimina después de comprobar la integración.
7. La especificación expresa la intención aprobada; el código y las pruebas muestran el comportamiento implementado; GitHub Actions aporta la evidencia ejecutada.
8. Una capacidad que no aplique a un proyecto se declara como `No aplica`; no se inventan controles.
9. No se instalan herramientas, dependencias ni integraciones solo para cumplir una plantilla.
10. Los secretos, tokens, credenciales y datos reales quedan fuera de documentos, prompts, commits y artefactos.

## Responsabilidad de cada componente

### Spec Kit y SDD

Spec Kit será la herramienta recomendada para estructurar cambios funcionales o complejos mediante artefactos persistentes:

- especificación;
- aclaraciones;
- plan técnico;
- tareas;
- criterios de aceptación;
- checklist o análisis cuando aporten valor.

La adopción de Spec Kit no será un requisito de los workflows de calidad. El estándar define el resultado documental exigible, no una dependencia obligatoria del agente.

La estructura debe seguir siendo comprensible y revisable aunque el trabajo se haya realizado con otra herramienta.

### Superpowers

Superpowers aporta prácticas de ejecución, no el contrato de calidad del repositorio:

- brainstorming antes de diseñar;
- TDD cuando exista lógica comprobable;
- debugging sistemático ante fallos;
- revisión de alcance;
- verificación antes de declarar el trabajo terminado;
- revisión final del diff;
- cierre controlado de la rama.

Estas prácticas deben expresarse como reglas del flujo para que puedan aplicarse con OpenCode u otro agente, aunque la instalación concreta de Superpowers no esté disponible en todos los entornos.

### `AGENTS.md`

Define el comportamiento obligatorio del agente:

- leer el contexto antes de actuar;
- clasificar el cambio;
- crear o localizar los artefactos documentales necesarios;
- no implementar con ambigüedad relevante;
- preservar el alcance;
- ejecutar las validaciones adecuadas;
- distinguir fallos, deuda preexistente y controles no aplicables;
- entregar un informe verificable.

### `CONTRIBUTING.md`

Define el proceso para la persona responsable:

- convertir una necesidad en un alcance pequeño;
- aprobar la especificación;
- trabajar en rama;
- revisar implementación y pruebas;
- abrir la PR;
- revisar checks y diff;
- confirmar el merge;
- cerrar la rama tras la integración.

### GitHub Actions y dashboard

GitHub Actions continúa siendo la fuente de evidencia técnica:

- lint o formato;
- tipos;
- build;
- pruebas;
- cobertura cuando corresponda;
- E2E, integración y smoke cuando correspondan;
- validaciones estáticas;
- artefactos y métricas reales.

Los workflows no deben intentar sustituir el razonamiento de la especificación. El dashboard debe seguir mostrando proceso, evidencia e histórico sin convertir el método en una puntuación artificial.

## Clasificación de cambios

### Nivel T0 — trivial

Puede usar el flujo reducido cuando el cambio:

- no modifica comportamiento;
- no modifica contratos;
- no modifica datos;
- no afecta seguridad, autenticación o integraciones;
- no altera comandos de calidad o despliegue;
- es pequeño y fácilmente reversible.

Ejemplos: corrección textual, ajuste visual aislado, actualización de una etiqueta o modificación documental menor.

Artefactos mínimos:

- breve descripción del alcance;
- diff revisado;
- validación adecuada al cambio.

### Nivel T1 — funcional

Es obligatorio cuando el cambio:

- añade o modifica comportamiento;
- corrige lógica;
- cambia una interacción;
- modifica una salida, contrato o regla de negocio;
- requiere varias decisiones técnicas;
- puede producir una regresión funcional.

Artefactos mínimos:

- `spec.md`;
- `plan.md`;
- `tasks.md`;
- criterios de aceptación;
- pruebas nuevas o actualizadas, o una justificación explícita si una prueba no aplica.

### Nivel T2 — complejo o sensible

Es obligatorio cuando el cambio afecta a:

- migraciones o esquemas;
- autenticación o autorización;
- datos personales;
- facturación o reglas fiscales;
- integraciones externas;
- despliegues;
- varios subsistemas o repositorios;
- cambios con riesgo de pérdida o incompatibilidad de datos.

Además de los artefactos de T1, debe incluir:

- decisiones técnicas y alternativas descartadas;
- riesgos y mitigaciones;
- contratos o invariantes afectados;
- plan de pruebas ampliado;
- estrategia de compatibilidad, migración o reversión cuando proceda;
- checklist de revisión.

Un cambio inicialmente clasificado como T0 o T1 debe elevarse de nivel si durante el análisis aparecen estos riesgos.

## Ciclo de trabajo

### 1. Entrada y alcance

Antes de modificar archivos:

- identificar repositorio y rama;
- leer `README.md`, `AGENTS.md`, `CONTRIBUTING.md` y contexto técnico;
- describir problema, objetivo y resultado esperado;
- documentar explícitamente lo que queda fuera;
- clasificar el cambio como T0, T1 o T2.

Si existen varias funcionalidades independientes, deben separarse en trabajos distintos.

### 2. Especificación

Para T1 y T2:

- describir el comportamiento deseado;
- identificar usuarios, entradas, salidas e invariantes;
- definir criterios de aceptación observables;
- enumerar casos normales, errores y límites;
- registrar las preguntas que requieran decisión humana;
- evitar fijar tecnología en la especificación salvo que sea una restricción real.

La especificación debe aprobarse antes de implementar cuando el cambio tenga ambigüedad relevante.

### 3. Diseño y plan

El plan debe traducir la especificación a cambios concretos:

- archivos que se modificarán;
- límites de cada componente;
- dependencias existentes que se reutilizarán;
- orden de implementación;
- estrategia de pruebas;
- validaciones locales y de CI;
- riesgos conocidos.

No debe incluir refactorizaciones ajenas ni tareas no justificadas por la especificación.

### 4. Tareas y pruebas

Las tareas deben ser pequeñas, trazables y verificables. Cada criterio de aceptación debe relacionarse con una prueba, una validación determinista o una revisión manual explícita.

Cuando exista lógica comprobable, se prioriza:

1. escribir o actualizar la prueba;
2. comprobar que falla por el motivo esperado cuando sea una funcionalidad nueva;
3. implementar el cambio mínimo;
4. comprobar que pasa;
5. ejecutar la regresión relevante.

### 5. Implementación

Durante la implementación:

- trabajar solo en la rama del cambio;
- respetar el plan aprobado;
- no ampliar el alcance por iniciativa propia;
- detenerse y actualizar la especificación si aparece una decisión nueva;
- no inventar comandos, métricas, dependencias o controles;
- conservar cambios ajenos existentes.

### 6. Verificación local

Antes de abrir la PR:

- ejecutar las validaciones aplicables;
- revisar resultados y artefactos;
- comprobar que los tests cubren los criterios de aceptación;
- ejecutar build, smoke, E2E, cobertura u otros controles cuando correspondan;
- revisar `git status`, diff completo y diff contra `main`;
- comprobar que no hay secretos, datos reales ni archivos fuera de alcance.

### 7. Pull Request

La PR debe incluir:

- nivel T0, T1 o T2;
- objetivo y alcance;
- elementos fuera de alcance;
- enlace o ruta de la especificación;
- criterios de aceptación;
- relación entre criterios y pruebas;
- validaciones locales ejecutadas;
- checks esperados de GitHub Actions;
- riesgos, limitaciones y deuda preexistente;
- confirmación de revisión del diff.

### 8. Integración y cierre

Solo se integra cuando:

- los checks obligatorios pasan;
- los controles no aplicables están explicados;
- el diff ha sido revisado;
- no quedan decisiones abiertas;
- el usuario confirma el merge cuando el flujo lo exige.

La integración se realiza mediante merge commit. Después se verifica `main`, se elimina la rama remota y se sincroniza el clon local cuando exista.

## Artefactos y trazabilidad

Los artefactos de T1 y T2 se conservarán en una carpeta propia del cambio:

```text
specs/NNN-feature-name/
  spec.md
  plan.md
  tasks.md
  research.md        # solo cuando sea necesario
  checklist.md       # T2 o cuando aporte una comprobación real
```

Los nombres pueden adaptarse a la integración concreta del agente, pero no debe perderse la relación entre:

```text
necesidad → especificación → criterio de aceptación → tarea → prueba → check de CI → PR
```

No se exige crear `research.md`, modelos, contratos o diagramas cuando no aporten información real.

## Qué se automatiza y qué no

### Se mantiene automatizado

- validación del código;
- ejecución de pruebas;
- cálculo de métricas reales;
- validación de `quality-metrics.json`;
- publicación de artefactos;
- auditoría de repositorios;
- dashboard e histórico;
- protección de `main`.

### Se mantiene bajo revisión humana y del agente

- decidir si el cambio es T0, T1 o T2;
- aprobar la intención;
- resolver ambigüedades;
- decidir si una comprobación no aplica;
- revisar alcance, riesgos y diseño;
- confirmar el merge.

En esta primera implantación no se añadirá un check automático que bloquee una PR únicamente por no contener una especificación. Primero se probará el flujo en un repositorio consumidor y se automatizarán después solo las reglas que hayan demostrado ser estables.

## Fuera de alcance

Este diseño no:

- instala Spec Kit, Pi, Superpowers ni nuevas dependencias;
- modifica todavía los repositorios consumidores;
- cambia los gates técnicos existentes;
- añade puntuaciones artificiales;
- adopta Stacked PR;
- obliga a todos los proyectos a tener la misma arquitectura;
- sustituye GitHub Actions por validaciones documentales;
- convierte la especificación en una excusa para generar documentación sin valor.

## Resultado esperado

Tras la implantación documental, cualquier cambio relevante deberá poder responder de forma trazable:

1. ¿Qué problema se quería resolver?
2. ¿Qué comportamiento se aprobó?
3. ¿Qué queda fuera?
4. ¿Qué archivos y decisiones forman parte del plan?
5. ¿Qué pruebas cubren los criterios?
6. ¿Qué checks de GitHub verificaron el resultado?
7. ¿Qué riesgos o limitaciones permanecen?
