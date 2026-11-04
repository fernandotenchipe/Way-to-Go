"""Dry run local de Carta Porte 3.1, CFDI 4.0 y SEPOMEX.

Lee XLS originales; no contiene cliente PostgreSQL, red ni SQL ejecutable.
Requiere xlrd==2.0.2 y el inventario local previo. Produce solo resúmenes.
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

from diagnosticar_catalogos_excel import DEFAULTS, ROOT, cell_text, header_for, is_data_row, logical_name, normalized_key


INVENTORY = ROOT / "docs/catalogos/diagnostico_excel_oficiales.json"
REPORT = ROOT / "docs/catalogos/dry_run_importacion.md"
DETAIL = ROOT / "docs/catalogos/dry_run_importacion.json"
TASA_FIELDS = (
    "Rango o fijo", "Valor mínimo", "Valor máximo", "Impuesto", "Factor",
    "Traslado", "Retención", "Fecha inicio de vigencia", "Fecha fin de vigencia",
)
SEP_FIELDS = (
    "codigo_postal", "asentamiento", "tipo_asentamiento", "municipio", "estado",
    "ciudad", "codigo_postal_oficina", "clave_estado", "oficina", "clave_codigo_postal",
    "clave_tipo_asentamiento", "clave_municipio", "id_asentamiento_cpcons", "zona", "clave_ciudad",
)
REQUIRED_SEP = (0, 1, 3, 4, 7, 11, 12)


def stable_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def raw_cell(cell: xlrd.sheet.Cell) -> dict:
    value = None if cell.ctype in (xlrd.XL_CELL_EMPTY, xlrd.XL_CELL_BLANK) else cell.value
    return {"tipo_excel": cell.ctype, "valor": value}


def raw_text(cell: xlrd.sheet.Cell) -> str | None:
    if cell.ctype in (xlrd.XL_CELL_EMPTY, xlrd.XL_CELL_BLANK):
        return None
    if cell.ctype == xlrd.XL_CELL_TEXT:
        return cell.value
    return cell_text(cell)


def date_iso(cell: xlrd.sheet.Cell, datemode: int) -> tuple[str | None, str | None]:
    value = cell_text(cell)
    if not value:
        return None, None
    if value.casefold() in {"por definir", "no aplica", "n/a", "0"}:
        return None, "marcador de fecha sin valor"
    try:
        if cell.ctype in (xlrd.XL_CELL_DATE, xlrd.XL_CELL_NUMBER):
            parts = xlrd.xldate_as_tuple(float(cell.value), datemode)
            parsed = datetime(*parts[:3])
        else:
            parsed = None
            for pattern in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%y"):
                try:
                    parsed = datetime.strptime(value, pattern)
                    break
                except ValueError:
                    pass
            if parsed is None:
                return None, "fecha no interpretable"
        if not 1900 <= parsed.year <= 2200:
            return None, "fecha fuera de rango"
        return parsed.date().isoformat(), None
    except (ValueError, OverflowError, xlrd.XLDateError):
        return None, "fecha no interpretable"


def source_rules(family: str, sheet: xlrd.sheet.Sheet, row_index: int, headers: list[str], continuation: list[xlrd.sheet.Cell] | None = None) -> dict:
    cells = [raw_cell(c) for c in sheet.row(row_index)]
    rules = {
        "fuente": {"familia": family, "hoja": sheet.name, "fila_excel": row_index + 1},
        "encabezados": headers,
        "celdas": cells,
    }
    if continuation is not None:
        rules["continuacion"] = {"fila_excel": row_index + 2, "celdas": [raw_cell(c) for c in continuation]}
    return rules


def sat_identity(logical: str, row: list[xlrd.sheet.Cell], row_number: int, repeated_material: set[str]) -> tuple[str, dict]:
    key = normalized_key(row[0], logical)
    context: dict[str, str | None] = {}
    if logical == "c_Colonia":
        context = {"c_CodigoPostal": cell_text(row[1]) or None}
    elif logical in {"c_Municipio", "c_Localidad"}:
        context = {"c_Estado": cell_text(row[1]) or None}
    elif logical == "c_Estado":
        context = {"c_Pais": cell_text(row[1]) or None}
    elif logical == "c_NumPedimentoAduana":
        context = {"Patente": cell_text(row[1]) or None, "Ejercicio": cell_text(row[2]) or None}
    elif logical == "c_TasaOCuota":
        key = "TASA_O_CUOTA"
        context = {name: (str(row[i].value).strip() if row[i].ctype == xlrd.XL_CELL_NUMBER else cell_text(row[i])) or None for i, name in enumerate(TASA_FIELDS)}
    elif logical == "c_MaterialPeligroso" and key in repeated_material:
        context = {"fila_origen": str(row_number)}
    return key, context


def date_columns(headers: list[str]) -> tuple[int | None, int | None]:
    first = last = None
    for i, header in enumerate(headers):
        h = header.casefold().replace(" ", "")
        if "vigencia" not in h:
            continue
        if "inicio" in h:
            first = i
        elif "fin" in h:
            last = i
    return first, last


def sat_description(logical: str, row: list[xlrd.sheet.Cell]) -> tuple[str, bool]:
    if logical in {"c_Colonia", "c_Municipio", "c_Localidad", "c_Estado"}:
        return cell_text(row[2]), False
    if logical == "c_TasaOCuota":
        text = " ".join(cell_text(row[i]) for i in (0, 2, 3, 4) if cell_text(row[i]))
        return text, True
    if logical == "c_NumPedimentoAduana":
        return "Aduana " + "/".join(cell_text(row[i]) for i in (0, 1, 2)), True
    if logical in {"c_CodigoPostal", "c_PatenteAduanal", "c_NumAutorizacionNaviero"}:
        return cell_text(row[0]), True
    return cell_text(row[1]), False


def sat_record(family: str, logical: str, sheet: xlrd.sheet.Sheet, row_index: int, headers: list[str], datemode: int, repeated_material: set[str]) -> tuple[dict, list[str]]:
    row = sheet.row(row_index)
    key, context = sat_identity(logical, row, row_index + 1, repeated_material)
    description, derived_description = sat_description(logical, row)
    begin_col, end_col = date_columns(headers)
    start, start_warning = date_iso(row[begin_col], datemode) if begin_col is not None else (None, None)
    end, end_warning = date_iso(row[end_col], datemode) if end_col is not None else (None, None)
    continuation = sheet.row(row_index + 1) if logical == "c_TipoDeComprobante" and key == "N" and row_index + 1 < sheet.nrows else None
    rules = source_rules(family, sheet, row_index, headers, continuation)
    record = {
        "catalogo": logical, "clave": key, "clave_contexto": context,
        "descripcion": description, "vigente_desde": start, "vigente_hasta": end,
        "reglas": rules,
    }
    issues = []
    if not key.strip():
        issues.append("clave vacía")
    if not description.strip():
        issues.append("descripción vacía")
    if start_warning and start_warning != "marcador de fecha sin valor":
        issues.append("fecha inicial inválida")
    if end_warning and end_warning != "marcador de fecha sin valor":
        issues.append("fecha final inválida")
    if start and end and end < start:
        issues.append("vigencia final anterior a la inicial")
    if logical == "c_CodigoPostal" and not re.fullmatch(r"[0-9]{5}", key):
        issues.append("código postal SAT inválido")
    if any(value is None for value in context.values()):
        # c_TasaOCuota admite mínimo y fecha final nulos; otros contextos no.
        if logical != "c_TasaOCuota":
            issues.append("discriminante de contexto vacío")
    if logical == "c_TasaOCuota" and any(context[name] is None for name in ("Rango o fijo", "Impuesto", "Factor", "Traslado", "Retención", "Fecha inicio de vigencia")):
        issues.append("discriminante obligatorio de tasa vacío")
    if derived_description:
        record["_descripcion_derivada"] = True
    if start_warning == "marcador de fecha sin valor" or end_warning == "marcador de fecha sin valor":
        record["_fecha_marcador"] = True
    return record, issues


def sep_record(sheet: xlrd.sheet.Sheet, row_index: int) -> tuple[dict, list[str]]:
    row = sheet.row(row_index)
    record = {name: raw_text(row[i]) for i, name in enumerate(SEP_FIELDS)}
    issues = []
    for i in REQUIRED_SEP:
        if record[SEP_FIELDS[i]] is None or not str(record[SEP_FIELDS[i]]).strip():
            issues.append(f"campo requerido vacío: {SEP_FIELDS[i]}")
    for name in ("codigo_postal", "codigo_postal_oficina"):
        value = record[name]
        if value is not None and not re.fullmatch(r"[0-9]{5}", value):
            issues.append(f"formato de cinco dígitos inválido: {name}")
    return record, issues


def file_sha(path: Path) -> str:
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def check_sql_contract() -> dict:
    old = (ROOT / "backend/src/modules/logistica/database/migrations/20261021_carta_porte_catalogos_documentos.sql").read_text(encoding="utf-8")
    new = (ROOT / "backend/src/modules/logistica/database/migrations/20261103_sat_cfdi_sepomex_catalogos.sql").read_text(encoding="utf-8")
    start = new.index("CREATE TABLE tms.sepomex_asentamientos (")
    end = new.index("CREATE INDEX sepomex_asentamientos_cp_idx", start)
    sep_table = new[start:end]
    return {
        "sat_reglas_jsonb": "reglas jsonb NOT NULL" in old,
        "sat_descripcion_requerida": "clave text NOT NULL, descripcion text NOT NULL" in old,
        "sat_contexto_jsonb": "ADD COLUMN clave_contexto jsonb NOT NULL" in new,
        "sat_pk_compuesta": "PRIMARY KEY (version_id, catalogo, clave, clave_contexto)" in new,
        "sep_pk_compuesta": "PRIMARY KEY (version_id, clave_estado, clave_municipio, id_asentamiento_cpcons)" in sep_table,
        "sep_columnas": {name: bool(re.search(r"(?m)^  " + re.escape(name) + r"\s+text\b", sep_table)) for name in SEP_FIELDS},
        "sep_sin_reglas_por_fila": "reglas jsonb" not in sep_table,
    }


def run(paths: dict[str, Path], inventory: dict) -> dict:
    books = {item["family"]: item for item in inventory["sources"]}
    summary = {"families": {}, "sql_contract": check_sql_contract(), "dry_run_only": True}
    for family, path in paths.items():
        if file_sha(path) != books[family]["sha256"]:
            raise ValueError(f"SHA-256 distinto del inventario: {path}")
        book = xlrd.open_workbook(str(path), on_demand=True)
        expected = books[family]
        if book.sheet_names() != [s["sheet"] for s in expected["sheets"]]:
            raise ValueError(f"Hojas distintas del inventario: {path}")
        catalog_data: dict[str, dict] = defaultdict(lambda: {
            "expected": 0, "read": 0, "transformed": 0, "rejected": 0, "duplicates": 0,
            "derived_descriptions": 0, "date_markers": 0, "raw_roundtrip_failures": 0,
            "source_values_not_in_target": 0, "leading_zero_keys": 0, "numeric_keys_padded": 0,
            "dates_converted": 0, "examples": [], "samples": [], "digest": hashlib.sha256(),
        })
        seen: dict[str, set[str]] = defaultdict(set)
        material_counts = Counter()
        if family == "CARTA_PORTE":
            material = book.sheet_by_name("c_MaterialPeligroso")
            material_counts.update(cell_text(material.cell(i, 0)) for i in range(5, material.nrows))
        repeated_material = {key for key, count in material_counts.items() if count > 1}
        material_variants = 0
        metadata = {}
        for sheet, prior in zip(book.sheets(), expected["sheets"]):
            if sheet.name == "Nota" and family == "SEPOMEX":
                note = str(sheet.cell_value(1, 1))
                match = re.search(r"(\d{2}/\d{2}/\d{4})", note)
                metadata["fecha_fuente"] = datetime.strptime(match.group(1), "%d/%m/%Y").date().isoformat() if match else None
                metadata["nota"] = [cell_text(sheet.cell(i, 1)) for i in range(1, sheet.nrows)]
                continue
            logical = logical_name(family, sheet.name)
            _, headers, start = header_for(family, sheet, logical)
            state = catalog_data[logical]
            state["expected"] += prior["rows"]
            metadata[sheet.name] = {
                "encabezados": headers,
                "fila_encabezado": prior["header_row"],
                "filas_previas_originales": [[raw_cell(c) for c in sheet.row(i)] for i in range(start)],
                "avisos_no_registrales": prior.get("excluded_nonempty_rows", []),
            }
            read_sheet = 0
            for index in range(start, sheet.nrows):
                row = sheet.row(index)
                if not is_data_row(family, logical, row):
                    continue
                read_sheet += 1
                state["read"] += 1
                if family == "SEPOMEX":
                    record, issues = sep_record(sheet, index)
                    ident = stable_json([record["clave_estado"], record["clave_municipio"], record["id_asentamiento_cpcons"]])
                    original = [raw_text(c) for c in row]
                    if [record[name] for name in SEP_FIELDS] != original:
                        state["source_values_not_in_target"] += 1
                    if any((record[name] or "").startswith("0") for name in ("codigo_postal", "clave_estado", "clave_municipio", "id_asentamiento_cpcons")):
                        state["leading_zero_keys"] += 1
                else:
                    record, issues = sat_record(family, logical, sheet, index, headers, book.datemode, repeated_material)
                    ident = stable_json([record["clave"], record["clave_contexto"]])
                    raw = [raw_cell(c) for c in row]
                    if json.loads(stable_json(record["reglas"]))["celdas"] != raw:
                        state["raw_roundtrip_failures"] += 1
                    if record.pop("_descripcion_derivada", False):
                        state["derived_descriptions"] += 1
                    if record.pop("_fecha_marcador", False):
                        state["date_markers"] += 1
                    if logical == "c_MaterialPeligroso" and record["clave"] in repeated_material:
                        material_variants += 1
                    if record["clave"].startswith("0"):
                        state["leading_zero_keys"] += 1
                    if row[0].ctype == xlrd.XL_CELL_NUMBER and len(record["clave"]) > len(cell_text(row[0])):
                        state["numeric_keys_padded"] += 1
                    state["dates_converted"] += int(record["vigente_desde"] is not None) + int(record["vigente_hasta"] is not None)
                if ident in seen[logical]:
                    state["duplicates"] += 1
                    issues.append("identidad compuesta duplicada")
                else:
                    seen[logical].add(ident)
                if issues:
                    state["rejected"] += 1
                    if len(state["examples"]) < 8:
                        state["examples"].append({"hoja": sheet.name, "fila": index + 1, "motivos": issues})
                    continue
                state["transformed"] += 1
                if len(state["samples"]) < 2:
                    state["samples"].append({"hoja": sheet.name, "fila": index + 1, "clave": record.get("clave", record.get("codigo_postal")), "contexto": record.get("clave_contexto"), "vigente_desde": record.get("vigente_desde"), "vigente_hasta": record.get("vigente_hasta")})
                state["digest"].update(stable_json(record).encode("utf-8"))
                state["digest"].update(b"\n")
            if read_sheet != prior["rows"]:
                raise ValueError(f"Conteo de {sheet.name}: leído {read_sheet}, esperado {prior['rows']}")
            book.unload_sheet(sheet.name)
        if family == "CARTA_PORTE":
            summary["material_peligroso"] = {"claves_repetidas": len(repeated_material), "filas_de_variantes": material_variants, "filas_extra_sobre_clave_simple": sum(count - 1 for count in material_counts.values() if count > 1)}
        if family == "SEPOMEX" and metadata.get("fecha_fuente") is None:
            raise ValueError("SEPOMEX: no se pudo derivar fecha_fuente obligatoria de Nota")
        summary["families"][family] = {
            "path": str(path), "sha256": expected["sha256"], "metadata": metadata,
            "catalogs": {name: {key: (value.hexdigest() if key == "digest" else value) for key, value in data.items()} for name, data in catalog_data.items()},
        }
        book.release_resources()
    return summary


def render(result: dict) -> str:
    lines = [
        "# Simulación local de importación de catálogos", "",
        "Dry run: se leyeron y transformaron valores en memoria. No se ejecutó SQL, no se abrió una conexión y no se escribieron filas transformadas. La identidad SAT se evalúa por archivo/familia, catálogo, clave y contexto; SEPOMEX por archivo y su llave triple.", "",
        "| Familia | Leídos | Transformados | Rechazados | Esperados | Duplicados finales |", "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    total = Counter()
    for family, data in result["families"].items():
        sums = Counter({field: sum(c[field] for c in data["catalogs"].values()) for field in ("read", "transformed", "rejected", "expected", "duplicates")})
        total.update(sums)
        lines.append(f"| {family} | {sums['read']:,} | {sums['transformed']:,} | {sums['rejected']:,} | {sums['expected']:,} | {sums['duplicates']:,} |")
    lines.append(f"| **Total** | **{total['read']:,}** | **{total['transformed']:,}** | **{total['rejected']:,}** | **{total['expected']:,}** | **{total['duplicates']:,}** |")
    for family, data in result["families"].items():
        lines += ["", f"## {family}: conteo por catálogo", "", "| Catálogo lógico | Leídos | Transformados | Rechazados | Esperados | Identidades repetidas |", "| --- | ---: | ---: | ---: | ---: | ---: |"]
        for name, c in data["catalogs"].items():
            lines.append(f"| `{name}` | {c['read']:,} | {c['transformed']:,} | {c['rejected']:,} | {c['expected']:,} | {c['duplicates']:,} |")
        lines += ["", "SHA-256 del archivo: `" + data["sha256"] + "`. El JSON adjunto incluye los encabezados interpretados, huellas de los registros transformados y ejemplos de cualquier rechazo."]
    material = result["material_peligroso"]
    lines += [
        "", "## Conservación y compatibilidad", "",
        f"Material peligroso: {material['claves_repetidas']} claves repetidas, {material['filas_de_variantes']} filas de variantes y {material['filas_extra_sobre_clave_simple']} filas adicionales. Las variantes usan `fila_origen` y se someten a la misma prueba de unicidad.",
        "En SAT, `reglas` contiene los valores de todas las celdas con su tipo Excel, encabezados, hoja y fila; la fila de continuación del comprobante `N` se conserva en el mismo objeto. Se verificó el recorrido JSON de esos valores. Las fechas de registro se convirtieron a ISO y los valores originales siguen en `reglas`. En SEPOMEX se compararon las 15 celdas de cada fila con sus 15 columnas destino.",
        "",
    ]
    for family, data in result["families"].items():
        cat = data["catalogs"]
        lines.append(f"{family}: {sum(c['raw_roundtrip_failures'] for c in cat.values()):,} fallos de conservación JSON; {sum(c['source_values_not_in_target'] for c in cat.values()):,} filas SEPOMEX con valores no representados; {sum(c['leading_zero_keys'] for c in cat.values()):,} filas con alguna clave inicial `0`; {sum(c['numeric_keys_padded'] for c in cat.values()):,} claves numéricas completadas con ceros; {sum(c['dates_converted'] for c in cat.values()):,} fechas ISO obtenidas; {sum(c['derived_descriptions'] for c in cat.values()):,} descripciones de presentación derivadas; {sum(c['date_markers'] for c in cat.values()):,} filas con fecha marcada `Por definir`/equivalente.")
    checks = result["sql_contract"]
    lines += ["", "Comprobación estática del SQL: " + ", ".join(f"{name}={'sí' if value else 'NO'}" for name, value in checks.items() if name != "sep_columnas") + f"; columnas SEPOMEX encontradas: {sum(checks['sep_columnas'].values())}/15."]
    lines += [
        "", "### Pendientes antes de una carga real", "",
        "- `tms.cp_sat_claves` admite el objeto `clave_contexto` y `reglas`; `tms.sepomex_asentamientos` tiene 15 columnas que corresponden a las 15 de SEPOMEX. Esta comprobación es estática contra los SQL del proyecto, no contra la instancia de Supabase.",
        "- `tms.cp_sat_versiones` exige `version_cfdi`, `revision`, `vigente_desde`, `fuente_url` y, para Carta Porte, `version_complemento`. Los libros incluyen versiones y revisiones **por catálogo**, algunas diferentes dentro de un mismo archivo. Falta definir una revisión e inicio de vigencia **por archivo** sin inventar una revisión oficial, y confirmar `fuente_url` de cada fuente. Los metadatos por hoja caben en `metadatos`.",
        "- `tms.sepomex_versiones` exige `fuente_url`; su `fecha_fuente` sale de la hoja `Nota`. La tabla de asentamientos no guarda hoja/fila ni tipos Excel por fila: sus 15 valores se conservan en columnas, pero la trazabilidad exacta depende de retener el XLS y su SHA-256.",
        "- `c_TasaOCuota` no tiene nombres de propiedades de contexto fijados textualmente en el contrato. El dry run usa los nueve nombres que aparecen en el script; hay que incorporarlos al contrato antes de la importación definitiva.",
        "- Los catálogos sin descripción fuente (`c_CodigoPostal`, `c_NumPedimentoAduana`, `c_PatenteAduanal`, `c_NumAutorizacionNaviero`, `c_TasaOCuota`) requieren una descripción de presentación derivada para satisfacer `descripcion NOT NULL`. Su contenido original permanece íntegro en `reglas`.",
        "- Algunos códigos CFDI están almacenados como número Excel. El dry run aplica anchos conocidos; se debe aprobar esa normalización y verificarla contra el catálogo oficial antes de insertar, en especial claves de pago, impuesto, aduana y productos.",
        "- La fila auxiliar de `c_TipoDeComprobante` y la nota de continuación postal se manejaron explícitamente. El código SEPOMEX `91312` sin equivalente CFDI y las diferencias de descripciones entre archivos permanecen separados; no se descartaron.",
        "", "## Conclusión", "",
        "El resultado anterior prueba la transformación local, las identidades y la compatibilidad de los campos de registro con el SQL del proyecto. Una afirmación de importación real sin pérdida exige resolver los campos obligatorios de versión/procedencia y la política de trazabilidad SEPOMEX; el dry run no comprueba datos ni permisos de Supabase.", "",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--carta-porte", type=Path, default=DEFAULTS["CARTA_PORTE"])
    parser.add_argument("--cfdi", type=Path, default=DEFAULTS["CFDI"])
    parser.add_argument("--sepomex", type=Path, default=DEFAULTS["SEPOMEX"])
    parser.add_argument("--inventory", type=Path, default=INVENTORY)
    parser.add_argument("--report", type=Path, default=REPORT)
    parser.add_argument("--detail", type=Path, default=DETAIL)
    args = parser.parse_args()
    inventory = json.loads(args.inventory.read_text(encoding="utf-8"))
    paths = {"CARTA_PORTE": args.carta_porte, "CFDI": args.cfdi, "SEPOMEX": args.sepomex}
    result = run(paths, inventory)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.detail.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    args.report.write_text(render(result), encoding="utf-8")
    print(f"Reporte: {args.report}\nDetalle: {args.detail}")


if __name__ == "__main__":
    main()
