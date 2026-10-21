# Pruebas de Logística / TMS

Las pruebas automatizadas de viajes se guardan aquí, separadas por área:

- `backend/`: creación, validaciones, notas, historial y asignación. Usan dobles en memoria; no se conectan ni escriben en PostgreSQL.
- `frontend/`: conversión y validación de fechas y zonas horarias.

Desde la carpeta `way-to-go`, ejecútalas con:

```sh
node --test tests/logistica/backend/*.test.js tests/logistica/frontend/*.test.ts
```

La revisión visual de pantallas se hace manualmente en modo demo; sus registros se guardan solo en el navegador y no se consideran pruebas automatizadas.
