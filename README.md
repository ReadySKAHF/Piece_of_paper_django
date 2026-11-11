python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python manage.py migrate

.venv\Scripts\python manage.py import_legacy            # основная таблица employees
.venv\Scripts\python manage.py import_legacy --table имя  # если таблица называлась иначе

PowerShell от администратора:
   `New-NetFirewallRule -DisplayName "Personal 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Private`


import argparse
import json
import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.utils import get_column_letter

JSON_NAME = "personal_data.json"
LIST_SEPARATOR = "; "


def flatten(value, prefix=""):
    if isinstance(value, dict):
        result = {}
        for key, inner in value.items():
            name = f"{prefix}.{key}" if prefix else key
            result.update(flatten(inner, name))
        return result

    if isinstance(value, list):
        if all(not isinstance(item, (dict, list)) for item in value):
            return {prefix: LIST_SEPARATOR.join("" if i is None else str(i) for i in value)}
        return {prefix: json.dumps(value, ensure_ascii=False)}

    return {prefix: value}


def read_record(json_path: Path) -> dict:
    with json_path.open(encoding="utf-8-sig") as file:
        data = json.load(file)
    return flatten(data)


def collect_records(root: Path):
    records = []
    for folder in sorted(p for p in root.iterdir() if p.is_dir()):
        json_path = folder / JSON_NAME
        if not json_path.is_file():
            print(f"[пропуск] нет {JSON_NAME}: {folder.name}")
            continue
        try:
            record = {"Папка": folder.name, **read_record(json_path)}
        except (json.JSONDecodeError, OSError) as error:
            print(f"[ошибка] {json_path}: {error}")
            continue
        records.append(record)
    return records


def save_to_excel(records, output: Path):

    columns = []
    for record in records:
        for key in record:
            if key not in columns:
                columns.append(key)

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Данные"
    sheet.append(columns)
    for record in records:
        sheet.append([record.get(column, "") for column in columns])

    for index, column in enumerate(columns, start=1):
        width = max(len(str(cell.value or "")) for cell in sheet[get_column_letter(index)])
        sheet.column_dimensions[get_column_letter(index)].width = min(width + 2, 60)
    sheet.freeze_panes = "A2"

    workbook.save(output)


def main():
    parser = argparse.ArgumentParser(description="Сбор personal_data.json в Excel")
    parser.add_argument("directory", type=Path, help="директория с папками")
    parser.add_argument("-o", "--output", type=Path, default=Path("result.xlsx"),
                        help="имя выходного файла (по умолчанию result.xlsx)")
    args = parser.parse_args()

    if not args.directory.is_dir():
        sys.exit(f"Директория не найдена: {args.directory}")

    records = collect_records(args.directory)
    if not records:
        sys.exit("Не найдено ни одного подходящего файла.")

    save_to_excel(records, args.output)
    print(f"Готово: обработано {len(records)} записей -> {args.output}")


if __name__ == "__main__":
    main()
