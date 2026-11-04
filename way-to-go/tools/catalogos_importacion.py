"""Prepara catálogos oficiales para carga o ejecuta un dry run sin red.

Dependencia de lectura XLS: xlrd==2.0.2. La carga PostgreSQL vive en
backend/tools/importar-catalogos.mjs; este módulo nunca abre conexiones.
"""

from __future__ import annotations

import argparse
import hashlib
import json
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
    args = parser.parse_args()
    if args.mode == "prepare" and (args.stage is None or args.family == "ALL"):
        parser.error("prepare requiere --stage y una sola --family")
    inventory = json.loads(args.inventory.read_text(encoding="utf-8"))
    paths = {"CARTA_PORTE": args.carta_porte, "CFDI": args.cfdi, "SEPOMEX": args.sepomex}
    families = list(SOURCES) if args.family == "ALL" else [args.family]
    results = []
    try:
        for family in families:
            results.append(prepare(family, paths[family], inventory, args.stage))
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
