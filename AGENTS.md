# Instrucciones para agentes de IA

## Contexto obligatorio

Antes de actuar:

1. Identifica el repositorio y la rama.
2. Lee README, contexto técnico, reglas de contribución y limitaciones.
3. Comprueba el estado del árbol.
4. Revisa la implementación y las pruebas relacionadas.
5. Expón el alcance antes de modificar archivos si existe ambigüedad.


## Flujo de desarrollo asistido por IA

Antes de modificar archivos, identifica repositorio, rama base, objetivo, exclusiones y nivel T0/T1/T2. Lee el README, el contexto técnico, AGENTS.md, CONTRIBUTING.md y las instrucciones específicas.

- T0: alcance breve, diff revisado y validación adecuada.
- T1: spec.md, plan.md, tasks.md, criterios de aceptación y pruebas relacionadas.
- T2: lo anterior más decisiones, riesgos, invariantes o contratos afectados y plan de pruebas ampliado.

Para T1/T2 no implementes con ambigüedad relevante: plantea las decisiones y actualiza los artefactos si el alcance cambia. Usa TDD cuando exista lógica comprobable, debugging sistemático ante fallos y verificación completa antes de declarar el trabajo terminado. Relaciona cada criterio de aceptación con una prueba, validación determinista o revisión manual explícita.

## Reglas de trabajo

- Nunca trabajes directamente sobre `main`.
- Usa una rama específica por cambio.
- No amplíes el alcance por iniciativa propia.
- No inventes requisitos técnicos que el proyecto no necesita.
- No introduzcas migraciones, dependencias, endpoints o integraciones sin justificar su necesidad.
- No incluyas datos personales, documentos reales, secretos, tokens ni credenciales.
- No hagas merge ni despliegue sin confirmación explícita cuando el flujo del proyecto lo exija.
- Conserva los cambios existentes y no reviertas trabajo ajeno.
- Revisa el diff completo antes de cerrar la tarea.

## Validación

Ejecuta las validaciones definidas por el repositorio:

- lint o formato;
- tipos;
- build;
- pruebas;
- cobertura;
- integración, E2E o smoke cuando correspondan.

Distingue siempre entre:

- validación que ha pasado;
- deuda técnica preexistente;
- fallo introducido por el cambio;
- validación que no aplica.

No declares una tarea terminada basándote únicamente en que el código compila.

## Entrega

El informe final debe incluir:

- archivos modificados;
- comportamiento añadido o corregido;
- pruebas ejecutadas;
- resultados;
- riesgos y limitaciones;
- rama y commit;
- si queda pendiente PR, merge, despliegue o revisión humana.
