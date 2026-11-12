import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../../../app/ui/CartaPortePreview.tsx', import.meta.url), 'utf8');
const printStyles = source.match(/const printStyles = `([\s\S]*?)`;/)?.[1];
const fiscalEditor = await readFile(new URL('../../../app/ui/CartaPorteFiscalEditor.tsx', import.meta.url), 'utf8');
const logisticsApi = await readFile(new URL('../../../app/services/logistics-api.ts', import.meta.url), 'utf8');

test('Carta Porte fluye entre hojas sin saltos obligatorios por sección', () => {
  assert.ok(printStyles, 'debe existir la hoja de estilos de impresión');
  assert.match(printStyles, /@page\s*\{[\s\S]*size:\s*letter/);
  assert.match(printStyles, /\.carta-porte-complement-sheet\s*\{[^}]*break-before:\s*auto[^}]*page-break-before:\s*auto/);
  assert.match(printStyles, /\.carta-porte-conditions\s*\{[^}]*break-before:\s*auto[^}]*page-break-before:\s*auto/);
  assert.doesNotMatch(printStyles, /break-before:\s*page|page-break-before:\s*always/);
});

test('las tablas extensas repiten encabezado y conservan filas completas', () => {
  assert.match(printStyles, /\.carta-porte-table thead\s*\{\s*display:\s*table-header-group/);
  assert.match(printStyles, /\.carta-porte-table tr\s*\{\s*break-inside:\s*avoid;\s*page-break-inside:\s*avoid/);
  assert.match(printStyles, /\.carta-porte-merchandise-block\s*\{\s*break-inside:\s*auto;\s*page-break-inside:\s*auto/);
  assert.doesNotMatch(printStyles, /\.carta-porte-merchandise-block\s*\{\s*break-inside:\s*avoid/);
});

test('el documento imprimible omite avisos técnicos sin quitar campos pendientes del panel', () => {
  assert.doesNotMatch(source, /Campos pendientes reportados|operador\.rfc|document\.precarga\?\.faltantes|carta-porte-pending/);
  assert.match(source, /const missing = \(value: unknown\) => value === null \|\| value === undefined \|\| value === '' \? 'Pendiente'/);
  assert.match(source, /<Field label="RFC" value=\{figure\.rfc\}\/?>/);
  assert.match(fiscalEditor, /validation\.pending_fields\.map/);
  assert.match(fiscalEditor, /validation\.structural_errors/);
  assert.match(fiscalEditor, /validation\.fiscal_errors/);
  assert.match(fiscalEditor, /validation\.warnings/);
  assert.match(fiscalEditor, /Consultar validación sin guardar/);
  assert.match(logisticsApi, /dry_run:\s*true/);
});

test('la paginación es común a CFDI I y T y las tablas conservan crecimiento dinámico', () => {
  assert.match(source, /invoice\.tipo_comprobante === 'T'/);
  assert.match(source, /BORRADOR — SIN VALIDEZ FISCAL/);
  assert.match(printStyles, /@top-center\s*\{\s*content:\s*"BORRADOR — SIN VALIDEZ FISCAL"/);
  assert.match(printStyles, /counter\(page\)/);
  assert.match(printStyles, /\.carta-porte-table thead\s*\{\s*display:\s*table-header-group/);
  assert.match(printStyles, /\.carta-porte-table tr\s*\{\s*break-inside:\s*avoid/);
  assert.doesNotMatch(printStyles, /max-pages|page-count|height:\s*\d+(?:px|pt|in)/);
});
