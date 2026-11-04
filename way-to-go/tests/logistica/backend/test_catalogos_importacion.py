"""Pruebas locales de transformación XLS y manifiesto, sin PostgreSQL."""

import hashlib
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "tools"))

import xlrd  # noqa: E402
from catalogos_importacion import compare_workbooks, row_sha, trace_row, validate_official_copy  # noqa: E402
from simular_importacion_catalogos import date_iso, sat_identity, stable_json  # noqa: E402


def cell(value, kind=xlrd.XL_CELL_TEXT):
    return SimpleNamespace(value=value, ctype=kind)


class FakeSheet:
    def __init__(self, name, rows):
        self.name = name
        self.rows = rows
        self.nrows = len(rows)
        self.ncols = max((len(row) for row in rows), default=0)

    def cell(self, row, column):
        return self.rows[row][column]


class FakeBook:
    def __init__(self, sheets, datemode=0):
        self.sheets = sheets
        self.nsheets = len(sheets)
        self.datemode = datemode

    def sheet_names(self):
        return [sheet.name for sheet in self.sheets]

    def sheet_by_index(self, index):
        return self.sheets[index]

    def release_resources(self):
        pass


class CatalogImportTests(unittest.TestCase):
    def test_official_copy_accepts_distinct_binary_with_identical_typed_workbook_content(self):
        original_book = FakeBook([
            FakeSheet("Catálogo A", [[cell("Clave"), cell("Descripción")],
                [cell("001"), cell("Artículo")]]),
            FakeSheet("Catálogo B", [[cell("Código"), cell(10.0, xlrd.XL_CELL_NUMBER)]]),
        ])
        copied_book = FakeBook([
            FakeSheet("Catálogo A", [[cell("Clave"), cell("Descripción")],
                [cell("001"), cell("Artículo")]]),
            FakeSheet("Catálogo B", [[cell("Código"), cell(10.0, xlrd.XL_CELL_NUMBER)]]),
        ])
        original = Path(__file__).resolve()
        copy = (ROOT / "tools" / "catalogos_importacion.py").resolve()

        def open_book(filename, **_kwargs):
            return original_book if Path(filename) == original else copied_book

        with patch("catalogos_importacion.xlrd.open_workbook", side_effect=open_book):
            evidence = validate_official_copy(original, copy, [
                {"sheet": "Catálogo A", "header_row": 1},
                {"sheet": "Catálogo B", "header_row": 1},
            ])

        self.assertTrue(evidence["aceptada"])
        self.assertTrue(evidence["archivos_fisicos_distintos"])
        self.assertTrue(evidence["mismos_nombres_y_orden_de_hojas"])
        self.assertTrue(evidence["mismas_dimensiones"])
        self.assertTrue(evidence["mismos_encabezados"])
        self.assertTrue(evidence["tipos_y_valores_de_todas_las_celdas_iguales"])
        self.assertEqual(evidence["celdas_comparadas"], 6)
        self.assertNotEqual(evidence["sha256_original"], evidence["sha256_copia"])
        self.assertFalse(evidence["procedencia_sat_demostrada"])

    def test_official_copy_rejects_different_cell_value_or_excel_type(self):
        original_book = FakeBook([FakeSheet("Catálogo", [[cell("Clave"), cell("001")]])])
        value_difference = FakeBook([FakeSheet("Catálogo", [[cell("Clave"), cell("002")]])])
        type_difference = FakeBook([FakeSheet("Catálogo", [[cell("Clave"), cell("001", xlrd.XL_CELL_NUMBER)]])])
        original = Path(__file__).resolve()
        copy = (ROOT / "tools" / "catalogos_importacion.py").resolve()

        for different_book in (value_difference, type_difference):
            def open_book(filename, _different=different_book, **_kwargs):
                return original_book if Path(filename) == original else _different
            with patch("catalogos_importacion.xlrd.open_workbook", side_effect=open_book):
                with self.assertRaises(ValueError) as caught:
                    validate_official_copy(original, copy, [{"sheet": "Catálogo", "header_row": 1}])
            self.assertFalse(caught.exception.evidence["aceptada"])
            self.assertGreater(caught.exception.evidence["diferencias_total"], 0)

    def test_official_copy_rejects_sheet_dimension_header_and_date_system_differences(self):
        original_book = FakeBook([FakeSheet("Catálogo", [[cell("Clave"), cell("001")]])], datemode=0)
        other_books = [
            FakeBook([FakeSheet("Catálogo", [[cell("Encabezado"), cell("001")]])], datemode=0),
            FakeBook([FakeSheet("Catálogo", [[cell("Clave"), cell("001")], [cell("002"), cell("Dato")]])], datemode=0),
            FakeBook([FakeSheet("Otro catálogo", [[cell("Clave"), cell("001")]])], datemode=0),
            FakeBook([FakeSheet("Catálogo", [[cell("Clave"), cell("001")]])], datemode=1),
        ]
        original = Path(__file__).resolve()
        copy = (ROOT / "tools" / "catalogos_importacion.py").resolve()
        for other_book in other_books:
            def open_book(filename, _other=other_book, **_kwargs):
                return original_book if Path(filename) == original else _other
            with patch("catalogos_importacion.xlrd.open_workbook", side_effect=open_book):
                with self.assertRaises(ValueError) as caught:
                    validate_official_copy(original, copy, [{"sheet": "Catálogo", "header_row": 1}])
            self.assertFalse(caught.exception.evidence["aceptada"])

    def test_official_copy_rejects_same_physical_file(self):
        original = Path(__file__).resolve()
        with patch("catalogos_importacion.xlrd.open_workbook") as open_book:
            with self.assertRaises(ValueError) as caught:
                validate_official_copy(original, original, [])
        open_book.assert_not_called()
        self.assertFalse(caught.exception.evidence["archivos_fisicos_distintos"])

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
