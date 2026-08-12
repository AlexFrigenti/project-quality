# Instrucciones para agentes de IA

## Contexto obligatorio

Antes de actuar:

1. Identifica el repositorio y la rama.
2. Lee README, contexto técnico, reglas de contribución y limitaciones.
3. Comprueba el estado del árbol.
4. Revisa la implementación y las pruebas relacionadas.
5. Expón el alcance antes de modificar archivos si existe ambigüedad.

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
