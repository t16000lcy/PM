from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

import pandas as pd


DEFAULT_SHEET = "Backend_Cleaned"
PUBLIC_STATUSES = {"approved"}


def _clean_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    return str(value).strip()


def _split_list(value: Any) -> list[str]:
    text = _clean_value(value)
    if not text:
        return []
    parts = []
    for item in text.replace("\n", ";").split(";"):
        item = item.strip(" \t\r\n,;")
        if item and item not in parts:
            parts.append(item)
    return parts


def _record_from_row(row: pd.Series) -> dict[str, Any]:
    return {
        "id": _clean_value(row.get("id")),
        "cancerTypeEn": _clean_value(row.get("cancer_type_en")),
        "cancerTypeZh": _clean_value(row.get("cancer_type_zh")),
        "gene": _clean_value(row.get("gene")).upper(),
        "variant": _clean_value(row.get("variant")),
        "variantDisplay": _clean_value(row.get("variant_display")),
        "tier": _clean_value(row.get("tier")),
        "variantType": _clean_value(row.get("variant_type")),
        "diseaseRelatedDrugs": _split_list(row.get("disease_related_drugs")),
        "nonDiseaseRelatedDrugs": _split_list(row.get("non_disease_related_drugs")),
        "summaryPatient": _clean_value(row.get("summary_patient")),
        "summaryProfessional": _clean_value(row.get("summary_professional")),
        "pmids": _split_list(row.get("pmid_list")),
        "ncts": _split_list(row.get("nct_list")),
        "reviewStatus": _clean_value(row.get("review_status")),
        "lastUpdated": _clean_value(row.get("last_updated")),
    }


def build_database(input_path: Path, output_dir: Path, sheet_name: str = DEFAULT_SHEET) -> dict[str, Any]:
    df = pd.read_excel(input_path, sheet_name=sheet_name)
    df = df.fillna("")

    records = [_record_from_row(row) for _, row in df.iterrows()]
    public_records = [record for record in records if record["reviewStatus"] in PUBLIC_STATUSES]

    genes = sorted({record["gene"] for record in public_records if record["gene"]})
    cancers = sorted(
        {
            f"{record['cancerTypeZh']}｜{record['cancerTypeEn']}"
            for record in public_records
            if record["cancerTypeZh"] or record["cancerTypeEn"]
        }
    )
    tiers = sorted({record["tier"] for record in public_records if record["tier"]})

    payload = {
        "metadata": {
            "sourceFile": input_path.name,
            "sheet": sheet_name,
            "totalRows": len(records),
            "publicRows": len(public_records),
            "hiddenRows": len(records) - len(public_records),
            "geneCount": len(genes),
            "cancerCount": len(cancers),
            "tierCount": len(tiers),
        },
        "filters": {
            "genes": genes,
            "cancers": cancers,
            "tiers": tiers,
        },
        "records": public_records,
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "variants.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (output_dir / "variants.min.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Build website JSON database from curated variant Excel.")
    parser.add_argument("--input", required=True, type=Path, help="Path to curated Excel workbook.")
    parser.add_argument("--output", default=Path("web/data"), type=Path, help="Output directory for JSON files.")
    parser.add_argument("--sheet", default=DEFAULT_SHEET, help="Workbook sheet name.")
    args = parser.parse_args()

    payload = build_database(args.input, args.output, args.sheet)
    print(f"source={payload['metadata']['sourceFile']}")
    print(f"rows={payload['metadata']['totalRows']}")
    print(f"public_rows={payload['metadata']['publicRows']}")
    print(f"genes={payload['metadata']['geneCount']}")
    print(f"cancers={payload['metadata']['cancerCount']}")
    print(f"output={args.output / 'variants.json'}")


if __name__ == "__main__":
    main()
