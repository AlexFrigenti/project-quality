# Contribuir a los proyectos

## Antes de empezar

1. Lee el README y la documentación de contexto del repositorio.
2. Comprueba la rama actual y el estado del árbol.
3. Revisa las instrucciones específicas del proyecto.
4. Define un alcance pequeño y verificable.
5. No uses datos reales, secretos o credenciales.

## Flujo recomendado

1. Parte de `main` actualizada.
2. Crea una rama con nombre descriptivo.
3. Implementa únicamente el alcance acordado.
4. Añade o actualiza las pruebas relacionadas.
5. Ejecuta las validaciones del proyecto.
6. Revisa el diff completo.
7. Abre una Pull Request hacia `main`.
8. Atiende los checks y la revisión.
9. Fusiona solo cuando el estado sea correcto y exista autorización para hacerlo.

## Checklist de validación

La PR debe indicar qué se ha ejecutado entre:

- lint o formato;
- comprobación de tipos;
- build;
- pruebas unitarias;
- cobertura;
- pruebas de integración;
- E2E;
- smoke del artefacto;
- validaciones visuales o manuales.

Si una comprobación no aplica, hay que explicarlo. No se deben crear comandos ficticios para obtener un check verde.

## Cambios sensibles

Requieren una revisión especialmente cuidadosa:

- migraciones o cambios de esquema;
- autenticación y autorización;
- datos personales;
- secretos y configuración;
- pagos o facturación;
- integraciones externas;
- despliegues;
- cambios que puedan afectar a datos existentes.

## Revisión final

Antes de pedir la revisión:

- confirma que no hay archivos ajenos al alcance;
- revisa que no se han incluido credenciales;
- comprueba que la documentación coincide con el comportamiento;
- confirma que la rama no modifica directamente `main`;
- deja anotados los riesgos y los siguientes pasos.
