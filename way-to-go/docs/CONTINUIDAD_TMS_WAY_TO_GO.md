# Way To Go — nota de continuidad técnica

**Propósito:** retomar el proyecto en una conversación nueva sin volver a recorrer el historial de este chat. Leer esta nota y después comprobar el estado real del repositorio y los procesos; los puertos, PID, paquetes y datos remotos pueden cambiar.

**Proyecto:** `C:\fer\wtg\Way-to-Go\way-to-go`  
**Frontend:** Next.js + React + TypeScript (`app/`)  
**Backend:** Node.js (`backend/`)  
**Base de datos:** Supabase/PostgreSQL. Nunca copiar secretos del `.env` a esta nota.

## Reglas operativas acordadas

- No tocar frontend si el pedido es solo backend, ni a la inversa.
- No ejecutar migraciones ni modificar catálogos salvo autorización expresa.
- No hacer escrituras a Supabase sin autorización expresa y limitada a los registros concretos.
- Para tareas de lectura, usar GET y dejar claro cuando algo no se pudo comprobar.
- No crear otro documento ni convertir borradores existentes automáticamente.
- No timbrar, no llamar al PAC y no generar XML fiscal/UUID/QR fiscales.
- El borrador de QA del viaje 4 no debe modificarse salvo petición expresa. Los datos ficticios QA no son válidos para operaciones reales.
- No mostrar, copiar ni registrar credenciales o secretos del `.env`.
- No forzar el cierre de procesos. En Windows, si el proceso del servidor no se puede detener normalmente, pedir al usuario que use la terminal que lo inició.

## Estado funcional conocido

### Catálogos CFDI 4.0

- El proyecto ya cuenta con un convertidor existente: `tools/preparar_cfdi_local.py` y dependencias en `tools/requirements-catalogos.txt`.
- Se descargó/previó el Excel oficial SAT `catCFDI_V_4_20261029.xls`, SHA-256 esperado `ca9536cc4e4af64e2f2e0afc527f08bd0d1601e9d30a25d93dc4dcc4e256573b`.
- El objetivo de conversión fue 362,381 filas, 25 catálogos y cero rechazados; la salida local prevista es `backend/private-data/cfdi/4.0/` con JSONL y `manifest.json`.
- El backend usa el proveedor local vía `CFDI_CATALOG_PROVIDER=local`. No subir los archivos privados a Git ni importarlos a Supabase sin autorización.
- Node y Python se instalaron en esta máquina durante la configuración; las sesiones fnm/PowerShell pueden variar. En el PowerShell del usuario, `npm.cmd` puede ser necesario si la política bloquea `npm.ps1`.

### Backend TMS / Carta Porte

- El backend escucha normalmente en `127.0.0.1:3001`; `/health` ha respondido HTTP 200. Verificar PID y ruta antes de cualquier reinicio.
- Se revisaron rutas existentes de viajes, mercancías, Carta Porte, catálogos y sesión. La integración usa APIs bajo `/api/logistica/...` desde Next.
- La lógica fiscal implementada distingue escenarios de servicio de transporte a terceros (normalmente CFDI tipo I) y traslado de bienes propios (tipo T). Modalidad de unidad `PROPIO` no demuestra propiedad de mercancía.
- Para CFDI tipo T, la validación contempla reglas específicas; mercancías del complemento Carta Porte son distintas de conceptos fiscales CFDI.
- Cambios previos reportados incluyen recuperación de `escenario_fiscal` sin inferirlo (retorna `null` si no se puede recuperar), edición del cliente del viaje con PATCH y salvaguardas de recálculo para conservar importes NULL cuando cambian ubicaciones/transporte.
- Para ejecutar pruebas automatizadas del frontend con Node se han usado `node --test tests/logistica/frontend/*.test.ts`; también `node node_modules/typescript/bin/tsc --noEmit` y `node node_modules/eslint/bin/eslint.js <archivos>`.

### Registros QA existentes (solo contexto; volver a consultar antes de actuar)

- Viaje QA: folio `4`. El viaje 2 se usa como referencia de aislamiento y no debe alterarse.
- Cliente QA del viaje 4: `87242033-02f3-440e-8c89-18b920412c32`.
- Domicilio QA Monterrey: `c4322141-12d7-425d-879b-b49e4eadae73`.
- Domicilio QA Saltillo: `a16d79d1-991e-4610-b642-73b99fe34c0d`.
- Emisor ficticio QA: `25386a34-70c9-4bf3-a792-0da908d86614`. Es un registro ficticio y no representa la identidad fiscal de Way To Go.
- Carta Porte existente: `fff7135d-3171-4ae9-bcde-4c9b393f5166`.
- CFDI relacionado: `c93ff264-89bc-4e8a-b4fd-c9739bd9d3a9`.
- Versión SAT Carta Porte 3.1: `edf31d04-86e4-4780-9bbb-6121bc6b5d38`.
- Unidad QA anteriormente mostrada en la vista previa: `58e47156-32ca-44b7-b5c7-2d3ac35c607a`; número económico `DEMO-QA-CP31-4-20261111`, placas `QA-SIN-VALIDEZ-04`, configuración `C2`, permiso `TPAF03`. Datos ficticios, sin validez para despachos.
- Operador QA: `DEMO-QA-CP31-FIGURA-4`; RFC falta. No registrar ni inventar identidad fiscal.
- Mercancías Carta Porte del viaje 4: (1) Pinturas y tapa poros, ProdServCP `31211500`, unidad `H87`, 10 unidades / 10 kg, peligroso `1263`, embalaje `1A1`; (2) Madera, ProdServCP `11121600`, unidad `H87`, cantidad 2 / 35 kg. Total: 2 mercancías, 45 kg.
- La Carta Porte se mostró como tipo `T`, estado `BORRADOR`, revisión `16`, sin UUID fiscal. El escenario fiscal no viene en la respuesta (`null`); no deducirlo por el tipo ni por la unidad. No hay conceptos CFDI guardados.
- Los importes del CFDI (`subtotal`, `descuento`, `impuestos_trasladados`, `impuestos_retenidos`, `total`) fueron reparados a `NULL`. No revertirlos a cero. `numero_total_mercancias=2` y `peso_bruto_total=45.000` corresponden a las mercancías.

## Frontend y último bloqueo resuelto

- `CreatedTripSummary.tsx` tenía una sola barrera `Promise.all` para viaje, registro operativo, sesión, evidencias y catálogos. Aunque viaje y registro son suficientes para mostrar el expediente/Carta Porte, cualquier solicitud accesoria pendiente mantenía la vista en «Consultando ficha del viaje…».
- Se desacoplaron esas cargas. El viaje habilita la vista; registro, sesión, evidencias y catálogos se cargan en paralelo. Si sesión no se confirma, el expediente queda en modo de consulta.
- Archivos de ese arreglo:
  - `app/ui/CreatedTripSummary.tsx`
  - `app/services/trip-view.ts`
  - `tests/logistica/frontend/trip-view.test.ts`
- La prueba de regresión deja pendientes registro/sesión/evidencias/catálogos y confirma que la carga del viaje no espera esas solicitudes.
- TypeScript, ESLint y esa prueba pasaron en la última revisión.
- El proceso de Next observado fue PID `34944`, puerto 3000. Windows denegó el cierre desde el entorno de Codex; no se forzó. El proceso inició el 12/11/2026 por la mañana. Confirmar de nuevo antes de reiniciar.
- Next registró inicialmente errores de compilación de una versión intermedia del cambio; después registró `Compiled in 220ms`. También registró bloqueo de HMR/recursos dev al abrir la app por `127.0.0.1` (`Blocked cross-origin request`).
- **Solución práctica verificada:** usar `http://localhost:3000`, no `http://127.0.0.1:3000`. En `localhost`, el viaje 4 terminó de cargar y se pudo abrir la pestaña Carta Porte, sin reiniciar el backend ni modificar datos.
- La pestaña Carta Porte mostró el borrador existente, dos mercancías, ubicaciones, unidad/figura, datos pendientes e importes NULL como pendientes.

## PDF — comprobación pendiente

- La vista previa visual sí abrió y mostró los datos guardados, representando los importes NULL como `Pendiente · NULL` y mostrando `BORRADOR — SIN VALIDEZ FISCAL` en la vista previa.
- Se hizo clic en «Descargar PDF» en el navegador integrado. El botón pasó brevemente por «Preparando PDF…» y volvió a su estado normal; el navegador integrado no mostró ni expuso un diálogo de impresión, no apareció una pestaña PDF y no se guardó un PDF.
- Por lo tanto, no se ha comprobado que «Guardar como PDF» preserve secciones/paginación ni que la leyenda aparezca en todas las páginas. No declarar estas pruebas aprobadas.
- Para completar en navegador normal (Edge): abrir `http://localhost:3000/logistica/viajes/4` → pestaña **Carta Porte** → **Vista previa** → **Descargar PDF** → elegir **Guardar como PDF** → guardar y revisar todas las páginas. Si el diálogo no abre, permitir ventanas emergentes solo para `localhost` o entregar al usuario el control para resolverlo. Adjuntar el PDF/capturas para revisión visual.

## Estado de archivos al guardar esta nota

En la última inspección aparecían cambios de trabajo pendientes en:

- `app/ui/CartaPortePreview.tsx`
- `app/ui/TripCartaPortePanel.tsx`
- `app/ui/CreatedTripSummary.tsx`
- `app/services/trip-view.ts` (nuevo)
- `tests/logistica/frontend/trip-view.test.ts` (nuevo)

Algunas modificaciones de `CartaPortePreview.tsx` y `TripCartaPortePanel.tsx` ya estaban presentes antes de la última tarea. No descartarlas, revertirlas ni atribuirlas a la corrección de carga sin revisar el diff.

## Punto de continuación recomendado

1. Leer esta nota y revisar `git status`/diff para distinguir trabajo del usuario de cambios propios.
2. Confirmar que `http://localhost:3000/logistica/viajes/4` siga mostrando el expediente y Carta Porte.
3. Completar la comprobación del PDF en un navegador con diálogo de impresión accesible. No modificar código ni datos solo para simular una verificación visual.
4. Si se requiere reiniciar Next, primero pedir al usuario cerrar la terminal original con `Ctrl+C`; no intentar forzar el PID desde un entorno con acceso denegado. No reiniciar backend.
