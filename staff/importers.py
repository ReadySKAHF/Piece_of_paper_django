"""Разбор файлов импорта сотрудников (.csv, .xlsx).

Ожидаемый формат файла — две колонки: ФИО, должность.
Первая строка, похожая на заголовок (например "ФИО" / "Должность"),
распознаётся и пропускается автоматически.
"""

import csv
import io

MAX_ROWS = 10000

HEADER_WHO = {"фио", "фамилия имя отчество", "имя", "сотрудник", "сотрудники", "name", "full name", "employee"}
HEADER_INFO = {"должность", "позиция", "профессия", "position", "job title", "title"}


def _clean(value) -> str:
    return " ".join(str(value if value is not None else "").split())


def _looks_like_header(who: str, info: str) -> bool:
    return who.lower() in HEADER_WHO or info.lower() in HEADER_INFO


def _rows_from_pairs(pairs) -> tuple[list[dict], int]:
    """pairs — итератор (who, info) произвольных типов. Возвращает (строки, пропущено)."""
    rows: list[dict] = []
    skipped = 0
    for idx, pair in enumerate(pairs):
        if idx >= MAX_ROWS:
            break
        raw_who = pair[0] if len(pair) > 0 else None
        raw_info = pair[1] if len(pair) > 1 else None
        who, info = _clean(raw_who), _clean(raw_info)

        if not who and not info:
            continue  # полностью пустая строка — не ошибка, просто пропуск
        if idx == 0 and _looks_like_header(who, info):
            continue
        if not who or not info:
            skipped += 1
            continue
        rows.append({"who": who, "info": info})
    return rows, skipped


def _parse_csv(data: bytes) -> tuple[list[dict], int]:
    text = None
    for encoding in ("utf-8-sig", "cp1251", "utf-8"):
        try:
            text = data.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        raise ValueError("Не удалось определить кодировку файла")

    sample = text[:2048]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
        dialect.delimiter = ";" if sample.count(";") > sample.count(",") else ","

    reader = csv.reader(io.StringIO(text), dialect)
    pairs = (row for row in reader if row)
    return _rows_from_pairs(pairs)


def _parse_xlsx(data: bytes) -> tuple[list[dict], int]:
    import openpyxl

    try:
        workbook = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    except Exception as exc:
        raise ValueError("Не удалось прочитать .xlsx — файл повреждён или это не Excel") from exc

    sheet = workbook.worksheets[0]
    pairs = (row for row in sheet.iter_rows(min_col=1, max_col=2, values_only=True) if row)
    return _rows_from_pairs(pairs)


def parse_import_file(filename: str, data: bytes) -> dict:
    """Возвращает {"rows": [{"who", "info"}, ...], "skipped": n}."""
    name = filename or ""
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""

    if ext == "csv":
        rows, skipped = _parse_csv(data)
    elif ext == "xlsx":
        rows, skipped = _parse_xlsx(data)
    elif ext == "xls":
        raise ValueError("Старый формат .xls не поддерживается — сохраните файл как .xlsx или .csv")
    else:
        raise ValueError("Поддерживаются только файлы .xlsx и .csv")

    if not rows and not skipped:
        raise ValueError("В файле не найдено ни одной строки с данными")

    return {"rows": rows, "skipped": skipped}
