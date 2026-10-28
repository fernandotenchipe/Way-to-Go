# Pruebas de Logística / TMS

Las pruebas automatizadas de viajes se guardan aquí, separadas por área:

- `backend/`: creación, validaciones, notas, historial, asignación y permisos locales de Operadores. Usan dobles en memoria; no se conectan ni escriben en PostgreSQL.
- `frontend/`: conversión y validación de fechas y zonas horarias.

Desde la carpeta `way-to-go`, ejecútalas con:

```sh
node --test tests/logistica/backend/*.test.js tests/logistica/frontend/*.test.ts
```

Si Windows impide que `node --test` abra un proceso secundario, la prueba de Operadores se puede ejecutar directamente con `node tests/logistica/backend/operators-local.test.js`.

La revisión visual de pantallas se hace manualmente en modo demo; sus registros se guardan solo en el navegador y no se consideran pruebas automatizadas.
