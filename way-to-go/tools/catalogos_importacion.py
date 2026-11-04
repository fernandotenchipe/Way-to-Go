"""Prepara catálogos oficiales para carga o ejecuta un dry run sin red.

Dependencia de lectura XLS: xlrd==2.0.2. La carga PostgreSQL vive en
backend/tools/importar-catalogos.mjs; este módulo nunca abre conexiones.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

import xlrd

from diagnosticar_catalogos_excel import DEFAULTS, ROOT, cell_text, header_for, is_data_row, logical_name
from simular_importacion_catalogos import (
    INVENTORY, SEP_FIELDS, file_sha, raw_cell, sat_record, sep_record, stable_json,
)


SOURCES = {
    "CARTA_PORTE": {
        "sha256": "2ea8101bc84df18773f47dd8d5aa1309c81854e51e1e5b55387e0f1aeed18afe",
        "fecha": "2024-12-13", "version_complemento": "3.1", "version_cfdi": "4.0",
        "url": "http://omawww.sat.gob.mx/tramitesyservicios/Paginas/documentos/CatalogosCartaPorte31.xls",
    },
    "CFDI": {
        "sha256": "ca9536cc4e4af64e2f2e0afc527f08bd0d1601e9d30a25d93dc4dcc4e256573b",
        "fecha": "2026-10-29", "version_complemento": None, "version_cfdi": "4.0",
        "url": "http://omawww.sat.gob.mx/tramitesyservicios/Paginas/documentos/catCFDI_V_4_20261029.xls",
    },
    "SEPOMEX": {
        "sha256": "5d5e29332b6f699d0ef5a4bf1c06ca12089605cd58012b5950d995b0f0a1fd1a",
        "fecha": "2026-10-19",
        "url": "https://www.correosdemexico.gob.mx/SSLServicios/ConsultaCP/CodigoPostal_Exportar.aspx",
    },
}


def row_sha(cells: list[xlrd.sheet.Cell]) -> str:
    return hashlib.sha256(stable_json([raw_cell(cell) for cell in cells]).encode("utf-8")).hexdigest()


def trace_row(record: dict, sheet_name: str, one_based_row: int, cells: list[xlrd.sheet.Cell]) -> dict:
    return {
        "clave_estado": record["clave_estado"],
        "clave_municipio": record["clave_municipio"],
        "id_asentamiento_cpcons": record["id_asentamiento_cpcons"],
        "hoja_origen": sheet_name,
        "fila_excel": one_based_row,
        "sha256_fila": row_sha(cells),
    }


def verify_inventory(inventory: dict, family: str, path: Path) -> dict:
    prior = next((item for item in inventory["sources"] if item["family"] == family), None)
    if prior is None:
        raise ValueError(f"Falta {family} en el inventario")
    source = SOURCES[family]
    if prior["sha256"] != source["sha256"]:
        raise ValueError(f"Inventario y contrato SHA-256 no coinciden para {family}")
    actual = file_sha(path)
    if actual != source["sha256"]:
        raise ValueError(f"SHA-256 inesperado para {family}: {actual}")
    if path.stat().st_size != prior["bytes"]:
        raise ValueError(f"Tamaño inesperado para {family}")
    return prior


def prepare(family: str, path: Path, inventory: dict, stage: Path | None = None) -> dict:
    if family not in SOURCES:
        raise ValueError(f"Familia no admitida: {family}")
    prior = verify_inventory(inventory, family, path)
    book = xlrd.open_workbook(str(path), on_demand=True)
    if book.sheet_names() != [item["sheet"] for item in prior["sheets"]]:
        raise ValueError(f"Hojas distintas del inventario para {family}")
    if stage is not None:
        stage.mkdir(parents=True, exist_ok=True)
    records_path = stage / "registros.jsonl" if stage else None
    manifest_path = stage / "manifiesto.jsonl" if stage and family == "SEPOMEX" else None
    records_file = records_path.open("w", encoding="utf-8", newline="\n") if records_path else None
    manifest_file = manifest_path.open("w", encoding="utf-8", newline="\n") if manifest_path else None
    counts = defaultdict(lambda: {"esperados": 0, "leidos": 0, "transformados": 0, "rechazados": 0})
    errors = []
    identities: set[str] = set()
    metadata: dict = {"archivo_original": path.name, "catalogos": {}}
    manifest_count = 0
    try:
        repeated_material: set[str] = set()
        if family == "CARTA_PORTE":
            material = book.sheet_by_name("c_MaterialPeligroso")
            keys = Counter(cell_text(material.cell(i, 0)) for i in range(5, material.nrows))
            repeated_material = {key for key, count in keys.items() if count > 1}
            book.unload_sheet(material.name)
        for prior_sheet in prior["sheets"]:
            sheet = book.sheet_by_name(prior_sheet["sheet"])
            if family == "SEPOMEX" and sheet.name == "Nota":
                note = [cell_text(sheet.cell(i, 1)) for i in range(1, sheet.nrows)]
                matches = [re.search(r"(\d{2}/\d{2}/\d{4})", text) for text in note]
                dates = [datetime.strptime(m.group(1), "%d/%m/%Y").date().isoformat() for m in matches if m]
                if not dates or dates[0] != SOURCES[family]["fecha"]:
                    raise ValueError("La fecha de Nota SEPOMEX no coincide con el contrato")
                metadata["nota"] = note
                book.unload_sheet(sheet.name)
                continue
            logical = logical_name(family, sheet.name)
            _, headers, start = header_for(family, sheet, logical)
            data = counts[logical]
            data["esperados"] += prior_sheet["rows"]
            metadata["catalogos"][sheet.name] = {
                "catalogo": logical, "encabezados": headers,
                "fila_encabezado": prior_sheet["header_row"],
                "filas_previas_originales": [[raw_cell(c) for c in sheet.row(i)] for i in range(start)],
                "avisos_no_registrales": prior_sheet.get("excluded_nonempty_rows", []),
            }
            sheet_read = 0
            for index in range(start, sheet.nrows):
                row = sheet.row(index)
                if not is_data_row(family, logical, row):
                    continue
                sheet_read += 1
                data["leidos"] += 1
                if family == "SEPOMEX":
                    record, issues = sep_record(sheet, index)
                    identity = stable_json([record["clave_estado"], record["clave_municipio"], record["id_asentamiento_cpcons"]])
                else:
                    record, issues = sat_record(family, logical, sheet, index, headers, book.datemode, repeated_material)
                    record.pop("_descripcion_derivada", None)
                    record.pop("_fecha_marcador", None)
                    identity = stable_json([logical, record["clave"], record["clave_contexto"]])
                if identity in identities:
                    issues.append("identidad compuesta duplicada")
                else:
                    identities.add(identity)
                if issues:
                    data["rechazados"] += 1
                    if len(errors) < 100:
                        errors.append({"hoja": sheet.name, "fila_excel": index + 1, "errores": issues})
                    continue
                data["transformados"] += 1
                if records_file:
                    records_file.write(stable_json(record) + "\n")
                if manifest_file:
                    manifest_file.write(stable_json(trace_row(record, sheet.name, index + 1, row)) + "\n")
                    manifest_count += 1
            if sheet_read != prior_sheet["rows"]:
                raise ValueError(f"{sheet.name}: {sheet_read} filas leídas; se esperaban {prior_sheet['rows']}")
            book.unload_sheet(sheet.name)
        if family == "SEPOMEX" and "nota" not in metadata:
            raise ValueError("Falta Nota SEPOMEX")
    finally:
        if records_file:
            records_file.close()
        if manifest_file:
            manifest_file.close()
        book.release_resources()
    totals = {name: sum(item[name] for item in counts.values()) for name in ("esperados", "leidos", "transformados", "rechazados")}
    if totals["esperados"] != sum(item["rows"] for item in prior["sheets"]):
        raise ValueError("El total esperado difiere del inventario")
    result = {
        "familia": family, "sha256": SOURCES[family]["sha256"], "fuente_url": SOURCES[family]["url"],
        "fecha_fuente": SOURCES[family]["fecha"], "archivo_original": str(path),
        "conteos": dict(counts), "totales": totals, "errores": errors,
        "metadatos": metadata,
        "registros_jsonl": str(records_path) if records_path else None,
        "manifiesto_jsonl": str(manifest_path) if manifest_path else None,
    }
    if manifest_path:
        result["manifiesto_filas"] = manifest_count
        result["manifiesto_sha256"] = file_sha(manifest_path)
    if records_path:
        result["registros_sha256"] = file_sha(records_path)
        result["registros_bytes"] = records_path.stat().st_size
    return result


def _same_typed_value(left: object, right: object) -> bool:
    if type(left) is not type(right):
        return False
    if isinstance(left, float) and math.isnan(left):
        return isinstance(right, float) and math.isnan(right)
    return left == right


def _same_cell(left: xlrd.sheet.Cell, right: xlrd.sheet.Cell) -> bool:
    return left.ctype == right.ctype and _same_typed_value(left.value, right.value)


def compare_workbooks(original_path: Path, copy_path: Path, expected_sheets: list[dict]) -> dict:
    """Compara el contenido leído del XLS sin tratarlo como prueba de procedencia."""
    original_path = original_path.resolve(strict=True)
    copy_path = copy_path.resolve(strict=True)
    original_sha = file_sha(original_path)
    copy_sha = file_sha(copy_path)
    physically_distinct = not os.path.samefile(original_path, copy_path)
    evidence = {
        "archivo_original": str(original_path), "sha256_original": original_sha,
        "copia": str(copy_path), "sha256_copia": copy_sha,
        "archivos_fisicos_distintos": physically_distinct,
        "mismos_nombres_y_orden_de_hojas": False, "mismas_dimensiones": False,
        "mismos_encabezados": False, "mismo_sistema_de_fechas": False,
        "tipos_y_valores_de_todas_las_celdas_iguales": False,
        "hojas_comparadas": 0, "celdas_comparadas": 0,
        "diferencias_total": 0, "diferencias": [],
        "sha256_original_tras_comparacion": None, "sha256_copia_tras_comparacion": None,
        "procedencia_sat_demostrada": False,
        "nota": "La igualdad del contenido leído no demuestra que la copia provenga del SAT.",
    }
    if not physically_distinct:
        evidence["diferencias"].append({"tipo": "identidad_fisica", "detalle": "La copia y el original apuntan al mismo archivo físico."})
        evidence["diferencias_total"] = 1
        evidence["aceptada"] = False
        return evidence

    original = xlrd.open_workbook(str(original_path), on_demand=True)
    copied = xlrd.open_workbook(str(copy_path), on_demand=True)
    header_rows = {item["sheet"]: int(item["header_row"]) - 1 for item in expected_sheets}
    same_names_order = original.sheet_names() == copied.sheet_names()
    evidence["mismos_nombres_y_orden_de_hojas"] = same_names_order
    evidence["mismo_sistema_de_fechas"] = original.datemode == copied.datemode
    dimensions_equal = same_names_order and original.nsheets == copied.nsheets
    headers_equal = same_names_order
    cell_values_equal = same_names_order
    differences = evidence["diferencias"]
    difference_count = 0

    def record_difference(detail: dict) -> None:
        nonlocal difference_count
        difference_count += 1
        if len(differences) < 100:
            differences.append(detail)

    if not same_names_order:
        record_difference({"tipo": "hojas", "original": original.sheet_names(), "copia": copied.sheet_names()})
    if original.datemode != copied.datemode:
        record_difference({"tipo": "sistema_de_fechas", "original": original.datemode, "copia": copied.datemode})

    copy_by_name = {copied.sheet_by_index(index).name: copied.sheet_by_index(index) for index in range(copied.nsheets)}
    compared_cells = 0
    for original_index in range(original.nsheets):
        source_sheet = original.sheet_by_index(original_index)
        copied_sheet = copy_by_name.get(source_sheet.name)
        if copied_sheet is None:
            dimensions_equal = False
            headers_equal = False
            cell_values_equal = False
            continue
        evidence["hojas_comparadas"] += 1
        dims_match = source_sheet.nrows == copied_sheet.nrows and source_sheet.ncols == copied_sheet.ncols
        if not dims_match:
            dimensions_equal = False
            record_difference({"tipo": "dimensiones", "hoja": source_sheet.name,
                "original": {"filas": source_sheet.nrows, "columnas": source_sheet.ncols},
                "copia": {"filas": copied_sheet.nrows, "columnas": copied_sheet.ncols}})
        header_row = header_rows.get(source_sheet.name)
        if header_row is not None:
            if header_row >= source_sheet.nrows or header_row >= copied_sheet.nrows:
                headers_equal = False
                record_difference({"tipo": "encabezado_ausente", "hoja": source_sheet.name,
                    "fila_excel": header_row + 1})
            else:
                header_match = source_sheet.ncols == copied_sheet.ncols and all(
                    _same_cell(source_sheet.cell(header_row, column), copied_sheet.cell(header_row, column))
                    for column in range(min(source_sheet.ncols, copied_sheet.ncols)))
                if not header_match:
                    headers_equal = False
                    record_difference({"tipo": "encabezado_distinto", "hoja": source_sheet.name,
                        "fila_excel": header_row + 1})
        for row in range(max(source_sheet.nrows, copied_sheet.nrows)):
            for column in range(max(source_sheet.ncols, copied_sheet.ncols)):
                compared_cells += 1
                in_source = row < source_sheet.nrows and column < source_sheet.ncols
                in_copy = row < copied_sheet.nrows and column < copied_sheet.ncols
                if not in_source or not in_copy:
                    cell_values_equal = False
                    record_difference({"tipo": "celda_ausente", "hoja": source_sheet.name,
                        "fila_excel": row + 1, "columna_excel": column + 1,
                        "en_original": in_source, "en_copia": in_copy})
                    continue
                left, right = source_sheet.cell(row, column), copied_sheet.cell(row, column)
                if not _same_cell(left, right):
                    cell_values_equal = False
                    record_difference({"tipo": "celda_distinta", "hoja": source_sheet.name,
                        "fila_excel": row + 1, "columna_excel": column + 1,
                        "original": {"tipo_excel": left.ctype, "valor": left.value},
                        "copia": {"tipo_excel": right.ctype, "valor": right.value}})
    original.release_resources()
    copied.release_resources()
    evidence["mismas_dimensiones"] = dimensions_equal
    evidence["mismos_encabezados"] = headers_equal
    evidence["tipos_y_valores_de_todas_las_celdas_iguales"] = cell_values_equal
    evidence["celdas_comparadas"] = compared_cells
    evidence["diferencias_total"] = difference_count
    evidence["sha256_original_tras_comparacion"] = file_sha(original_path)
    evidence["sha256_copia_tras_comparacion"] = file_sha(copy_path)
    hashes_stable = (evidence["sha256_original_tras_comparacion"] == original_sha and
                     evidence["sha256_copia_tras_comparacion"] == copy_sha)
    evidence["archivos_sin_cambios_durante_comparacion"] = hashes_stable
    evidence["sha256_distintos"] = original_sha != copy_sha
    evidence["aceptada"] = all((physically_distinct, same_names_order, dimensions_equal,
        headers_equal, evidence["mismo_sistema_de_fechas"], cell_values_equal, hashes_stable))
    return evidence


def validate_official_copy(original_path: Path, copy_path: Path, expected_sheets: list[dict]) -> dict:
    evidence = compare_workbooks(original_path, copy_path, expected_sheets)
    if not evidence["aceptada"]:
        error = ValueError("La copia SAT no coincide completamente en hojas, dimensiones, encabezados, tipos y valores del XLS original")
        error.evidence = evidence
        raise error
    return evidence


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("dry-run", "prepare"), required=True)
    parser.add_argument("--family", choices=(*SOURCES, "ALL"), default="ALL")
    parser.add_argument("--carta-porte", type=Path, default=DEFAULTS["CARTA_PORTE"])
    parser.add_argument("--cfdi", type=Path, default=DEFAULTS["CFDI"])
    parser.add_argument("--sepomex", type=Path, default=DEFAULTS["SEPOMEX"])
    parser.add_argument("--inventory", type=Path, default=INVENTORY)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--stage", type=Path)
    parser.add_argument("--official-copy", type=Path)
    args = parser.parse_args()
    if args.mode == "prepare" and (args.stage is None or args.family == "ALL"):
        parser.error("prepare requiere --stage y una sola --family")
    if args.official_copy is not None and args.family != "CARTA_PORTE":
        parser.error("--official-copy solo se admite con --family CARTA_PORTE")
    inventory = json.loads(args.inventory.read_text(encoding="utf-8"))
    paths = {"CARTA_PORTE": args.carta_porte, "CFDI": args.cfdi, "SEPOMEX": args.sepomex}
    families = list(SOURCES) if args.family == "ALL" else [args.family]
    results = []
    try:
        for family in families:
            result = prepare(family, paths[family], inventory, args.stage)
            results.append(result)
            if args.official_copy is not None:
                try:
                    result["comparacion_copia_oficial"] = validate_official_copy(
                        paths[family], args.official_copy, next(item["sheets"] for item in inventory["sources"] if item["family"] == family))
                except ValueError as exc:
                    if getattr(exc, "evidence", None) is not None:
                        result["comparacion_copia_oficial"] = exc.evidence
                    raise
        report = {"modo": args.mode, "familias": results, "total_leidos": sum(r["totales"]["leidos"] for r in results),
                  "total_transformados": sum(r["totales"]["transformados"] for r in results),
                  "total_rechazados": sum(r["totales"]["rechazados"] for r in results)}
        if report["total_rechazados"]:
            raise ValueError(f"Se rechazaron {report['total_rechazados']} filas; no se permite importar")
    except Exception as exc:
        report = {"modo": args.mode, "familias": results, "error": str(exc)}
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        raise
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{report['total_leidos']} leídos, {report['total_transformados']} transformados, 0 rechazados. Reporte: {args.report}")


if __name__ == "__main__":
    main()
