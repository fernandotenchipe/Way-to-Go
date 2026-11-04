"""Pruebas locales de transformación XLS y manifiesto, sin PostgreSQL."""

import hashlib
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "tools"))

import xlrd  # noqa: E402
from catalogos_importacion import row_sha, trace_row  # noqa: E402
from simular_importacion_catalogos import date_iso, sat_identity, stable_json  # noqa: E402


def cell(value, kind=xlrd.XL_CELL_TEXT):
    return SimpleNamespace(value=value, ctype=kind)


class CatalogImportTests(unittest.TestCase):
    def test_tasa_contexto_tiene_nueve_propiedades_y_serial_original(self):
        row = [cell("Fijo"), cell("", xlrd.XL_CELL_EMPTY), cell(0.0, xlrd.XL_CELL_NUMBER),
               cell("IVA"), cell("Tasa"), cell("Sí"), cell("No"),
               cell(44562.0, xlrd.XL_CELL_NUMBER), cell("", xlrd.XL_CELL_EMPTY)]
        key, context = sat_identity("c_TasaOCuota", row, 7, set())
        self.assertEqual(key, "TASA_O_CUOTA")
        self.assertEqual(len(context), 9)
        self.assertEqual(context["Valor mínimo"], None)
        self.assertEqual(context["Valor máximo"], "0.0")
        self.assertEqual(context["Fecha inicio de vigencia"], "44562.0")
        self.assertEqual(date_iso(row[7], 0)[0], "2022-01-01")

    def test_material_peligroso_repetido_preserva_cada_fila(self):
        row = [cell("1001")]
        self.assertEqual(sat_identity("c_MaterialPeligroso", row, 7, {"1001"})[1], {"fila_origen": "7"})
        self.assertEqual(sat_identity("c_MaterialPeligroso", row, 8, {"1001"})[1], {"fila_origen": "8"})

    def test_manifiesto_hash_de_quince_celdas_tipeadas(self):
        cells = [cell("00123"), cell(5.0, xlrd.XL_CELL_NUMBER)] + [cell("", xlrd.XL_CELL_EMPTY)] * 13
        record = {"clave_estado": "01", "clave_municipio": "001", "id_asentamiento_cpcons": "0001"}
        trace = trace_row(record, "Aguascalientes", 2, cells)
        self.assertEqual(trace["fila_excel"], 2)
        self.assertEqual(trace["hoja_origen"], "Aguascalientes")
        self.assertEqual(trace["sha256_fila"], row_sha(cells))
        original = [{"tipo_excel": c.ctype, "valor": None if c.ctype == xlrd.XL_CELL_EMPTY else c.value} for c in cells]
        self.assertEqual(trace["sha256_fila"], hashlib.sha256(stable_json(original).encode("utf-8")).hexdigest())


if __name__ == "__main__":
    unittest.main()
