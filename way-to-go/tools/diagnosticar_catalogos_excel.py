"""Inventario local y de solo lectura de los tres XLS oficiales.

Requiere: python -m pip install xlrd==2.0.2
Ejemplo: python tools/diagnosticar_catalogos_excel.py --carta-porte ... --cfdi ... --sepomex ...
No abre conexiones ni genera comandos SQL. Solo escribe el reporte indicado.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

import xlrd


ROOT = Path(__file__).resolve().parents[1]
DEFAULTS = {
    "CARTA_PORTE": Path.home() / "Downloads/CatalogosCartaPorte31.xls",
    "CFDI": Path.home() / "Downloads/catCFDI_V_4_20261029.xls",
    "SEPOMEX": Path.home() / "Downloads/CPdescargaxls/CPdescarga.xls",
}
REPORT = ROOT / "docs/catalogos/diagnostico_excel_oficiales.md"
DETAIL = ROOT / "docs/catalogos/diagnostico_excel_oficiales.json"
SPECIAL = {
    "c_Colonia": (0, 1),
    "c_Municipio": (0, 1),
    "c_Localidad": (0, 1),
    "c_Estado": (0, 1),
    "c_NumPedimentoAduana": (0, 1, 2),
    "c_TasaOCuota": tuple(range(9)),
}
KEY_WIDTHS = {
    "c_FormaPago": 2,
    "c_TipoRelacion": 2,
    "c_Impuesto": 3,
    "c_Aduana": 2,
    "c_RegimenFiscal": 3,
    "c_ClaveProdServ": 8,
    "c_ClaveProdServCP": 8,
    "c_CodigoPostal": 5,
}
HEADER_ROWS = {
    ("CFDI", "c_FormaPago"): 5,
    ("CFDI", "c_MetodoPago"): 5,
    ("CFDI", "c_ClaveUnidad"): 5,
    ("CFDI", "c_RegimenFiscal"): 5,
    ("CFDI", "c_CodigoPostal"): 5,
    ("CFDI", "c_TasaOCuota"): 4,
}


def cell_text(cell: xlrd.sheet.Cell) -> str:
    if cell.ctype in (xlrd.XL_CELL_EMPTY, xlrd.XL_CELL_BLANK):
        return ""
    if cell.ctype == xlrd.XL_CELL_NUMBER:
        return str(int(cell.value)) if cell.value == int(cell.value) else format(cell.value, ".15g")
    return str(cell.value).strip()


def logical_name(family: str, sheet: str) -> str:
    name = sheet.strip()
    if family == "CFDI":
        name = re.sub(r"_Parte_[12]$", "", name)
    if name.lower().startswith("c_colonia_"):
        return "c_Colonia"
    if name.lower() == "c_localidad":
        return "c_Localidad"
    if name.lower() == "c_municipio":
        return "c_Municipio"
    return name


def header_for(family: str, sheet: xlrd.sheet.Sheet, logical: str) -> tuple[int, list[str], int]:
    if family == "SEPOMEX":
        return 0, [cell_text(c) for c in sheet.row(0)], 1
    index = HEADER_ROWS.get((family, logical), 4)
    if family == "CFDI" and logical == "c_CodigoPostal":
        first = [cell_text(c) for c in sheet.row(5)]
        second = [cell_text(c) for c in sheet.row(6)]
        headers = [" / ".join(x for x in (first[j], second[j]) if x) for j in range(sheet.ncols)]
        return 5, headers, 7
    if family == "CFDI" and logical == "c_TasaOCuota":
        headers = [cell_text(c) for c in sheet.row(4)]
        headers[1] = "c_TasaOCuota / Valor mínimo"
        headers[2] = "c_TasaOCuota / Valor máximo"
        return 4, headers, 6
    if family == "CFDI" and logical == "c_UsoCFDI":
        headers = [cell_text(c) for c in sheet.row(4)]
        headers[2] = "Aplica para tipo persona / Física"
        headers[3] = "Aplica para tipo persona / Moral"
        return 4, headers, 6
    if family == "CFDI" and logical == "c_TipoDeComprobante":
        headers = [cell_text(c) for c in sheet.row(4)]
        headers[2] = "Valor máximo / NS"
        headers[3] = "Valor máximo / NdS"
        return 4, headers, 5
    return index, [cell_text(c) for c in sheet.row(index)], index + 1


def date_state(cell: xlrd.sheet.Cell, datemode: int) -> str:
    if cell_text(cell) == "":
        return "empty"
    value = cell_text(cell)
    if value.casefold() in {"por definir", "no aplica", "n/a", "0"}:
        return "placeholder"
    try:
        if cell.ctype in (xlrd.XL_CELL_DATE, xlrd.XL_CELL_NUMBER):
            year, month, day, *_ = xlrd.xldate_as_tuple(float(cell.value), datemode)
            if not 1900 <= year <= 2200:
                return "invalid"
            datetime(year, month, day)
        else:
            parsed = False
            for pattern in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%y"):
                try:
                    datetime.strptime(value, pattern)
                    parsed = True
                    break
                except ValueError:
                    pass
            if not parsed:
                return "invalid"
    except (ValueError, OverflowError, xlrd.XLDateError):
        return "invalid"
    return "valid"


def normalized_key(cell: xlrd.sheet.Cell, catalog: str) -> str:
    value = cell_text(cell)
    if cell.ctype == xlrd.XL_CELL_NUMBER and catalog in KEY_WIDTHS and value.isdigit():
        return value.zfill(KEY_WIDTHS[catalog])
    return value


def is_data_row(family: str, logical: str, row: list[xlrd.sheet.Cell]) -> bool:
    key = cell_text(row[0])
    if family == "SEPOMEX":
        return bool(key)
    if logical == "c_TasaOCuota":
        return key in {"Fijo", "Rango"}
    if logical == "c_CodigoPostal":
        return bool(key) and not key.casefold().startswith(("continúa", "continua"))
    return bool(key) and not key.casefold().startswith(("continúa", "continua", "nota:"))


def identity(family: str, logical: str, row: list[xlrd.sheet.Cell]) -> tuple[str, ...]:
    if family == "SEPOMEX":
        return tuple(cell_text(row[i]) for i in (7, 11, 12))
    if logical == "c_TasaOCuota":
        return ("TASA_O_CUOTA",) + tuple(cell_text(c) for c in row[:9])
    indices = SPECIAL.get(logical, (0,))
    return tuple(normalized_key(row[i], logical) if i == 0 else cell_text(row[i]) for i in indices)


def col_type(cell: xlrd.sheet.Cell) -> str:
    return {
        xlrd.XL_CELL_TEXT: "texto",
        xlrd.XL_CELL_NUMBER: "número",
        xlrd.XL_CELL_DATE: "fecha Excel",
        xlrd.XL_CELL_BOOLEAN: "booleano",
        xlrd.XL_CELL_ERROR: "error Excel",
    }.get(cell.ctype, "vacío")


def scan_book(family: str, path: Path) -> dict:
    with path.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
    book = xlrd.open_workbook(str(path), on_demand=True)
    result = {"family": family, "path": str(path), "sha256": digest, "bytes": path.stat().st_size, "sheets": [], "logical": {}}
    identities: dict[str, dict[tuple[str, ...], tuple[str, int]]] = defaultdict(dict)
    primary: dict[str, Counter] = defaultdict(Counter)
    duplicates: dict[str, list[dict]] = defaultdict(list)
    for sheet in book.sheets():
        if family == "SEPOMEX" and sheet.name == "Nota":
            result["sheets"].append({"sheet": "Nota", "logical": None, "rows": 0, "header_row": 1, "worksheet_rows": sheet.nrows, "worksheet_cols": sheet.ncols, "columns": [{"name": cell_text(c), "types": ["texto"]} for c in sheet.row(0)], "metadata": [cell_text(sheet.cell(i, 1)) for i in range(1, sheet.nrows)]})
            book.unload_sheet(sheet.name)
            continue
        logical = logical_name(family, sheet.name)
        header_index, headers, start = header_for(family, sheet, logical)
        cols = [{"name": headers[i] or f"(sin encabezado, columna {i+1})", "types": Counter(), "empty": 0} for i in range(sheet.ncols)]
        required = [7, 11, 12, 0, 1, 3, 4] if family == "SEPOMEX" else ([0, 3, 4, 5, 6, 7] if logical == "c_TasaOCuota" else list(SPECIAL.get(logical, (0,))))
        if family != "SEPOMEX" and logical != "c_TasaOCuota" and len(headers) > 1 and headers[1].casefold() in {"descripción", "descripcion", "nombre", "remolque o semirremolque", "descripción del tipo de transporte", "descripción del tipo de estación", "tipo de carro", "tipo de contenedor", "nacionalidad", "nombre del asentamiento"}:
            required.append(1)
        if family != "SEPOMEX" and logical == "c_Colonia":
            required.append(2)
        if family != "SEPOMEX" and logical == "c_Estado":
            required.append(2)
        required = sorted(set(required))
        blanks = Counter()
        invalid_dates = Counter()
        placeholders = Counter()
        numeric_keys = 0
        invalid_postal_codes = 0
        excluded = []
        count = 0
        date_indices = [i for i, h in enumerate(headers) if "vigencia" in h.casefold() or h.casefold() in {"fechainiciovigencia", "fechafinvigencia"}]
        metadata_dates = {}
        if family != "SEPOMEX":
            for metadata_row in range(header_index):
                labels = [cell_text(c) for c in sheet.row(metadata_row)]
                if any("versión" in label.casefold() or "revisión" in label.casefold() for label in labels) and metadata_row + 1 < header_index:
                    metadata_dates = {
                        label: date_state(sheet.cell(metadata_row + 1, i), book.datemode)
                        for i, label in enumerate(labels) if "fecha" in label.casefold()
                    }
                    break
        for row_index in range(start, sheet.nrows):
            row = sheet.row(row_index)
            if not is_data_row(family, logical, row):
                if any(cell_text(c) for c in row) and len(excluded) < 8:
                    excluded.append({"row": row_index + 1, "sample": " | ".join(cell_text(c)[:70] for c in row[:3])})
                continue
            count += 1
            if (family == "SEPOMEX" or logical == "c_CodigoPostal") and not re.fullmatch(r"\d{5}", cell_text(row[0])):
                invalid_postal_codes += 1
            for i, cell in enumerate(row):
                if cell_text(cell):
                    cols[i]["types"][col_type(cell)] += 1
                else:
                    cols[i]["empty"] += 1
            for i in required:
                if not cell_text(row[i]):
                    blanks[headers[i] or f"columna {i+1}"] += 1
            for i in date_indices:
                state = date_state(row[i], book.datemode)
                if state == "invalid":
                    invalid_dates[headers[i] or f"columna {i+1}"] += 1
                elif state == "placeholder":
                    placeholders[headers[i] or f"columna {i+1}"] += 1
            if family != "SEPOMEX" and row[0].ctype == xlrd.XL_CELL_NUMBER:
                numeric_keys += 1
            ident = identity(family, logical, row)
            if ident in identities[logical]:
                if len(duplicates[logical]) < 12:
                    prior_sheet, prior_row = identities[logical][ident]
                    duplicates[logical].append({"identity": ident, "first": f"{prior_sheet}:{prior_row}", "again": f"{sheet.name}:{row_index+1}"})
            else:
                identities[logical][ident] = (sheet.name, row_index + 1)
            if family != "SEPOMEX":
                primary[logical][normalized_key(row[0], logical)] += 1
        entry = {
            "sheet": sheet.name, "logical": logical, "rows": count, "header_row": header_index + 1,
            "worksheet_rows": sheet.nrows, "worksheet_cols": sheet.ncols,
            "columns": [{"name": c["name"], "types": dict(c["types"]), "empty": c["empty"]} for c in cols],
            "required_blanks": dict(blanks), "invalid_dates": dict(invalid_dates),
            "date_placeholders": dict(placeholders), "numeric_primary_keys": numeric_keys,
            "invalid_postal_codes": invalid_postal_codes,
            "metadata_dates": metadata_dates,
            "excluded_nonempty_rows": excluded,
        }
        result["sheets"].append(entry)
        book.unload_sheet(sheet.name)
    for logical, seen in identities.items():
        nonunique_primary = sum(n-1 for n in primary[logical].values() if n > 1)
        result["logical"][logical] = {
            "rows": sum(s["rows"] for s in result["sheets"] if s["logical"] == logical),
            "unique_identities": len(seen), "duplicate_identities": sum(s["rows"] for s in result["sheets"] if s["logical"] == logical) - len(seen),
            "duplicate_examples": duplicates[logical], "repeated_primary_rows": nonunique_primary,
            "primary_key_variants": sum(n > 1 for n in primary[logical].values()),
        }
    return result


def cross_checks(books: list[dict]) -> dict:
    """Compara identidades oficiales sin fusionar familias ni crear datos."""
    wanted = {"c_Colonia", "c_Municipio", "c_Localidad", "c_CodigoPostal"}
    mapped: dict[str, dict[str, dict[tuple[str, ...], str]]] = {}
    sep_postals: set[str] = set()
    for info in books:
        family = info["family"]
        book = xlrd.open_workbook(info["path"], on_demand=True)
        data: dict[str, dict[tuple[str, ...], str]] = defaultdict(dict)
        for sheet in book.sheets():
            logical = logical_name(family, sheet.name)
            if family == "SEPOMEX":
                if sheet.name != "Nota":
                    sep_postals.update(cell_text(sheet.cell(i, 0)) for i in range(1, sheet.nrows))
            elif logical in wanted:
                _, _, start = header_for(family, sheet, logical)
                for i in range(start, sheet.nrows):
                    row = sheet.row(i)
                    if not is_data_row(family, logical, row):
                        continue
                    key = identity(family, logical, row)
                    data[logical][key] = cell_text(row[2] if logical != "c_CodigoPostal" else row[1])
            book.unload_sheet(sheet.name)
        mapped[family] = data
    cp, cfdi = mapped["CARTA_PORTE"], mapped["CFDI"]
    shared = {}
    for logical in ("c_Colonia", "c_Municipio", "c_Localidad"):
        left, right = cp[logical], cfdi[logical]
        common = left.keys() & right.keys()
        differences = [k for k in common if left[k] != right[k]]
        normalize = lambda v: " ".join(unicodedata.normalize("NFKC", v).casefold().split())
        shared[logical] = {
            "carta_porte": len(left), "cfdi": len(right), "common_keys": len(common),
            "only_carta_porte": len(left.keys() - right.keys()),
            "only_cfdi": len(right.keys() - left.keys()),
            "different_descriptions": len(differences),
            "different_after_space_case_normalization": sum(normalize(left[k]) != normalize(right[k]) for k in differences),
            "difference_examples": [{"key": k, "carta_porte": left[k], "cfdi": right[k]} for k in differences[:6]],
        }
    cfdi_postals = {k[0] for k in cfdi["c_CodigoPostal"]}
    colony_postals = {k[1] for k in cp["c_Colonia"]}
    return {
        "shared_sat_catalogs": shared,
        "postal_coverage": {
            "cfdi_unique_postals": len(cfdi_postals),
            "sepomex_unique_postals": len(sep_postals),
            "carta_porte_colony_unique_postals": len(colony_postals),
            "sepomex_not_in_cfdi": len(sep_postals - cfdi_postals),
            "sepomex_not_in_cfdi_examples": sorted(sep_postals - cfdi_postals)[:10],
            "carta_porte_colony_not_in_cfdi": len(colony_postals - cfdi_postals),
            "cfdi_not_in_sepomex": len(cfdi_postals - sep_postals),
        },
    }


def fmt_columns(columns: list[dict]) -> str:
    return "; ".join(f"{i+1}. {c['name']} ({'/'.join(c['types']) or 'vacío'}{f', {c["empty"]} vacíos' if c.get('empty') else ''})" for i, c in enumerate(columns))


def render(books: list[dict], checks: dict) -> str:
    lines = ["# Diagnóstico local de los tres Excel oficiales", "", "Inventario reproducible y de solo lectura sobre los archivos indicados. No comprueba el contenido de Supabase ni ejecuta importación. Los conteos excluyen títulos, metadatos, encabezados y avisos de continuación; la hoja `Nota` de SEPOMEX aporta 0 registros.", "", "## Fuentes y totales", "", "| Familia | Archivo | SHA-256 | Hojas | Registros |", "| --- | --- | --- | ---: | ---: |"]
    for b in books:
        total = sum(s["rows"] for s in b["sheets"])
        lines.append(f"| {b['family']} | `{b['path']}` | `{b['sha256']}` | {len(b['sheets'])} | {total:,} |")
    lines += ["", "## Conteos esperados por hoja", ""]
    for b in books:
        lines += [f"### {b['family']}", "", "| Hoja física | Catálogo lógico | Fila del encabezado | Registros | Identidades duplicadas (catálogo completo) |", "| --- | --- | ---: | ---: | ---: |"]
        for s in b["sheets"]:
            d = b["logical"].get(s["logical"], {}).get("duplicate_identities", 0)
            lines.append(f"| `{s['sheet']}` | `{s['logical'] or '—'}` | {s['header_row']} | {s['rows']:,} | {d:,} |")
        lines.append("")
    lines += ["## Estructura y tipos de columnas", "", "Los tipos reflejan celdas de datos del Excel: texto, número o fecha Excel. `vacío` indica una columna sin valores de datos; el número de vacíos se calcula entre registros, no entre filas de título.", ""]
    for b in books:
        lines += [f"### {b['family']}", ""]
        for s in b["sheets"]:
            lines.append(f"- **{s['sheet']}** ({s['rows']:,} registros; ancho físico {s['worksheet_cols']}): {fmt_columns(s['columns'])}.")
        lines.append("")
    lines += ["## Cruces entre archivos", "", "Las coincidencias se comparan por clave compuesta. Son referencias de distintas versiones/familias y se conservan por separado.", "", "| Catálogo | Carta Porte | CFDI | Claves comunes | Solo Carta Porte | Solo CFDI | Descripciones diferentes |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"]
    for name, values in checks["shared_sat_catalogs"].items():
        lines.append(f"| `{name}` | {values['carta_porte']:,} | {values['cfdi']:,} | {values['common_keys']:,} | {values['only_carta_porte']:,} | {values['only_cfdi']:,} | {values['different_descriptions']:,} |")
    lines.append("")
    for name, values in checks["shared_sat_catalogs"].items():
        if values["different_descriptions"]:
            lines.append(f"{name}: {values['different_after_space_case_normalization']:,} descripciones siguen siendo diferentes tras normalizar espacios, Unicode y mayúsculas. Ejemplos: `{json.dumps(values['difference_examples'], ensure_ascii=False)}`.")
    coverage = checks["postal_coverage"]
    lines += ["", f"Códigos postales distintos: CFDI {coverage['cfdi_unique_postals']:,}; SEPOMEX {coverage['sepomex_unique_postals']:,}; colonias Carta Porte {coverage['carta_porte_colony_unique_postals']:,}. SEPOMEX sin correspondencia en CFDI: {coverage['sepomex_not_in_cfdi']:,} ({', '.join(coverage['sepomex_not_in_cfdi_examples'])}); colonias Carta Porte sin CP CFDI: {coverage['carta_porte_colony_not_in_cfdi']:,}; CP CFDI sin asentamiento SEPOMEX: {coverage['cfdi_not_in_sepomex']:,}.", ""]
    lines += ["## Alertas detectadas", ""]
    for b in books:
        lines += [f"### {b['family']}", ""]
        for s in b["sheets"]:
            issues = []
            if s.get("required_blanks"):
                issues.append("obligatorios vacíos: " + json.dumps(s["required_blanks"], ensure_ascii=False))
            if s.get("invalid_dates"):
                issues.append("fechas inválidas: " + json.dumps(s["invalid_dates"], ensure_ascii=False))
            if s.get("date_placeholders"):
                issues.append("fechas con marcador textual: " + json.dumps(s["date_placeholders"], ensure_ascii=False))
            if s.get("numeric_primary_keys"):
                issues.append(f"claves primarias numéricas: {s['numeric_primary_keys']:,} (revisar ceros iniciales)")
            if s.get("invalid_postal_codes"):
                issues.append(f"códigos postales sin cinco dígitos: {s['invalid_postal_codes']:,}")
            if s.get("metadata_dates") and any(state in {"invalid", "placeholder"} for state in s["metadata_dates"].values()):
                issues.append("fechas de metadatos: " + json.dumps(s["metadata_dates"], ensure_ascii=False))
            if s.get("excluded_nonempty_rows"):
                issues.append("filas no registrales excluidas: " + json.dumps(s["excluded_nonempty_rows"], ensure_ascii=False))
            if issues:
                lines.append(f"- **{s['sheet']}**: " + "; ".join(issues) + ".")
        for logical, info in b["logical"].items():
            if info["duplicate_identities"] or info["repeated_primary_rows"]:
                lines.append(f"- **{logical} (consolidado)**: {info['duplicate_identities']:,} identidades compuestas duplicadas; {info['repeated_primary_rows']:,} filas con clave principal repetida; {info['primary_key_variants']:,} claves principales con variantes. Ejemplos: {json.dumps(info['duplicate_examples'][:5], ensure_ascii=False)}.")
        lines.append("")
    lines += [
        "## Revisión del contrato `sat-catalogos-contexto.md`", "",
        f"Se inventariaron {len(books[0]['logical'])} catálogos lógicos de Carta Porte y {len(books[1]['logical'])} de CFDI. Las identidades compuestas del contrato cubren `c_Colonia`, `c_Municipio`, `c_Localidad`, `c_Estado`, `c_NumPedimentoAduana` y `c_TasaOCuota`. Las otras hojas tienen identidad principal única, salvo las nueve repeticiones de `c_MaterialPeligroso`, que el contrato conserva con `fila_origen` en todas las variantes de cada clave repetida. La llave SEPOMEX `(clave_estado, clave_municipio, id_asentamiento_cpcons)` es única en las 32 hojas de datos.", "",
        "El contrato requiere un anexo operativo antes de cargar: especificar ancho y normalización de claves que Excel guardó como números (`c_FormaPago` a 2 dígitos, `c_TipoRelacion` a 2, `c_Impuesto` a 3, `c_Aduana` a 2, `c_RegimenFiscal` a 3 y productos a 8), mantener como texto los códigos ya textuales y los ceros de SEPOMEX. Para `c_TasaOCuota`, fijar los nombres exactos y el orden de los nueve discriminantes y usar JSON `null` para mínimo o fin de vigencia vacíos. El número de fila de `c_MaterialPeligroso` debe ser el de la hoja original, empezando en 1, y conservar también la pestaña en `reglas`.", "",
        "## Reglas especiales y resolución sin pérdida", "",
        "1. **Pestañas partidas:** consolidar `c_Colonia_1/2/3` y `C_Colonia_1/2/3` por familia; consolidar `c_CodigoPostal_Parte_1/2`. Excluir solo el aviso de continuación y las filas de título; guardar hoja y fila de origen en `reglas`. Nunca fusionar registros de familias o versiones diferentes.",
        "2. **Claves compuestas:** construir el contexto del contrato y comprobar unicidad antes de insertar. `c_MaterialPeligroso` conserva las nueve variantes repetidas mediante `fila_origen`; `c_TasaOCuota` y `c_NumPedimentoAduana` no presentan colisiones con su contexto.",
        "3. **Encabezados y registros multilínea:** `c_CodigoPostal` y `c_TasaOCuota` tienen dos niveles de encabezado; `c_UsoCFDI` separa Física/Moral en otra fila. `c_TipoDeComprobante` tiene una fila sin clave entre `N` y `P` con valores máximos adicionales: asociarla al registro `N` como atributos originales, no crear una clave vacía ni descartarla.",
        "4. **Fechas:** interpretar fechas Excel con el modo de fecha del libro y fechas textuales `dd/mm/aaaa`; guardar el valor original en `reglas`. Los `Por definir` de tres catálogos Carta Porte representan vigencia no especificada, no una fecha; conservar el texto y usar fecha nula. Los campos opcionales vacíos de vigencia también son nulos.",
        "5. **Códigos y descripciones entre fuentes:** conservar las 438 descripciones de colonia y cuatro de localidad que difieren entre Carta Porte y CFDI en sus versiones respectivas. Los 15 municipios adicionales de CFDI permanecen allí. No hacer `upsert` cruzado ni sustituir SEPOMEX por el catálogo SAT de CP.",
        "6. **Cobertura postal:** conservar el código SEPOMEX sin correspondencia CFDI como asentamiento de SEPOMEX, marcado para revisión; la validación fiscal debe consultar la versión CFDI vigente. La ausencia de asentamientos SEPOMEX para muchos códigos CFDI no implica invalidar esos códigos fiscales.",
        "7. **Catálogos sin fechas por fila:** usar las fechas de metadatos de la hoja cuando correspondan y dejar en `reglas` su procedencia; no inventar vigencias por registro. La fecha de SEPOMEX sale de su hoja `Nota`.",
        "",
        "## Decisión previa a la importación", "",
        "Los tres archivos son legibles y el barrido no encontró vacíos en las columnas obligatorias definidas para cada tipo de hoja, fechas inválidas ni colisiones de las llaves compuestas finales de SEPOMEX, colonias, municipios, localidades, estados, tasas o pedimentos. **Todavía no conviene una carga automática desatendida:** primero hay que documentar y probar las reglas de claves numéricas, filas auxiliares, variantes de material peligroso y diferencias entre fuentes. El análisis no asegura que todas las relaciones comerciales/fiscales puedan resolverse solo con estos tres archivos; no se consultó Supabase.",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--carta-porte", type=Path, default=DEFAULTS["CARTA_PORTE"])
    parser.add_argument("--cfdi", type=Path, default=DEFAULTS["CFDI"])
    parser.add_argument("--sepomex", type=Path, default=DEFAULTS["SEPOMEX"])
    parser.add_argument("--report", type=Path, default=REPORT)
    parser.add_argument("--detail", type=Path, default=DETAIL)
    args = parser.parse_args()
    books = [scan_book(f, p) for f, p in (("CARTA_PORTE", args.carta_porte), ("CFDI", args.cfdi), ("SEPOMEX", args.sepomex))]
    checks = cross_checks(books)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.detail.parent.mkdir(parents=True, exist_ok=True)
    args.detail.write_text(json.dumps({"sources": books, "cross_checks": checks}, ensure_ascii=False, indent=2), encoding="utf-8")
    args.report.write_text(render(books, checks), encoding="utf-8")
    print(f"Reporte: {args.report}\nDetalle: {args.detail}")


if __name__ == "__main__":
    main()
