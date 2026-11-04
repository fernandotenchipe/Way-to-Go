"""Prepare immutable per-catalog CFDI JSONL files under the private backend."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from catalogos_importacion import SOURCES, prepare  # noqa: E402
from simular_importacion_catalogos import INVENTORY  # noqa: E402


def sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def export_cfdi(excel: Path, output_root: Path, report_path: Path) -> dict:
    inventory = json.loads(INVENTORY.read_text(encoding="utf-8"))
    source = SOURCES["CFDI"]
    input_sha = sha256(excel)
    if input_sha != source["sha256"]:
        raise ValueError(f"SHA-256 del Excel no coincide con el inventario CFDI: {input_sha}")
    final_dir = output_root / "4.0" / input_sha
    if final_dir.exists():
        raise FileExistsError(f"El paquete privado ya existe; no se sobrescribe: {final_dir}")
    final_dir.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="wtg-cfdi-", dir=final_dir.parent) as temporary:
        temporary_root = Path(temporary)
        stage = temporary_root / "stage"
        prepared = prepare("CFDI", excel, inventory, stage)
        if sha256(excel) != source["sha256"]:
            raise ValueError("El Excel CFDI cambió durante la preparación; no se publicaron los JSON")
        totals = prepared["totales"]
        if totals != {"esperados": 362381, "leidos": 362381, "transformados": 362381, "rechazados": 0}:
            raise ValueError(f"Conteos CFDI no coinciden con inventario: {totals}")

        catalogs_dir = temporary_root / "package"
        catalogs_dir.mkdir()
        catalog_counts: Counter[str] = Counter()
        handles: dict[str, object] = {}
        try:
            with Path(prepared["registros_jsonl"]).open("r", encoding="utf-8") as source_file:
                for line in source_file:
                    record = json.loads(line)
                    catalog = record.get("catalogo")
                    if not isinstance(catalog, str) or not catalog or Path(catalog).name != catalog:
                        raise ValueError("Nombre de catálogo CFDI inválido en los datos preparados")
                    handle = handles.get(catalog)
                    if handle is None:
                        handle = (catalogs_dir / f"{catalog}.jsonl").open("w", encoding="utf-8", newline="\n")
                        handles[catalog] = handle
                    handle.write(line if line.endswith("\n") else line + "\n")
                    catalog_counts[catalog] += 1
        finally:
            for handle in handles.values():
                handle.close()

        expected: Counter[str] = Counter()
        for item in next(source_item for source_item in inventory["sources"] if source_item["family"] == "CFDI")["sheets"]:
            expected[item["logical"]] += item["rows"]
        if dict(catalog_counts) != expected:
            raise ValueError(f"Conteos por catálogo diferentes del inventario oficial: esperados={dict(expected)}, generados={dict(catalog_counts)}")

        manifest = {
            "formato": "wtg-cfdi-jsonl-v1",
            "familia": "CFDI",
            "version_cfdi": "4.0",
            "sha256_excel": input_sha,
            "archivo_original": excel.name,
            "registros_esperados": 362381,
            "registros_exportados": sum(catalog_counts.values()),
            "registros_rechazados": totals["rechazados"],
            "fuente_url": source["url"],
            "catalogos": {},
        }
        for catalog in sorted(catalog_counts):
            catalog_file = catalogs_dir / f"{catalog}.jsonl"
            manifest["catalogos"][catalog] = {
                "archivo": catalog_file.name,
                "registros": catalog_counts[catalog],
                "sha256": sha256(catalog_file),
                "bytes": catalog_file.stat().st_size,
            }
        manifest_path = catalogs_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        manifest_sha = sha256(manifest_path)

        # Re-verify all generated lines before publishing the package directory.
        verified_total = 0
        for catalog, metadata in manifest["catalogos"].items():
            file = catalogs_dir / metadata["archivo"]
            if sha256(file) != metadata["sha256"]:
                raise ValueError(f"Hash generado no coincide: {catalog}")
            with file.open("r", encoding="utf-8") as stream:
                count = sum(1 for line in stream if line.strip())
            if count != metadata["registros"]:
                raise ValueError(f"Conteo de JSONL incorrecto: {catalog}")
            verified_total += count
        if verified_total != 362381:
            raise ValueError(f"Se generaron {verified_total} registros; se esperaban 362381")
        if sha256(excel) != input_sha:
            raise ValueError("El Excel CFDI cambió antes de publicar los JSON")

        os.replace(catalogs_dir, final_dir)
        result = {
            "estado": "listo",
            "modo": "local_json",
            "excel": str(excel.resolve()),
            "sha256_excel": input_sha,
            "conteos": totals,
            "registros_por_catalogo": dict(sorted(catalog_counts.items())),
            "directorio_privado": str(final_dir.resolve()),
            "manifest": str((final_dir / "manifest.json").resolve()),
            "sha256_manifest": manifest_sha,
            "archivos_jsonl": len(catalog_counts),
            "integridad_verificada": True,
            "conectado_a_supabase": False,
        }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--excel", type=Path, default=Path.home() / "Downloads/catCFDI_V_4_20261029.xls")
    parser.add_argument("--output-root", type=Path, default=ROOT / "backend/private-data/cfdi")
    parser.add_argument("--report", type=Path, default=ROOT / "reportes/cfdi-json-local.json")
    args = parser.parse_args()
    result = export_cfdi(args.excel, args.output_root, args.report)
    print(f"{result['conteos']['transformados']} registros CFDI listos en {result['directorio_privado']}; reporte {args.report}")


if __name__ == "__main__":
    main()
