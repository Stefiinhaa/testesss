import io
import traceback
import csv
from datetime import datetime

import pandas as pd
from fastapi import APIRouter, Form, HTTPException, UploadFile
from sqlalchemy import inspect, text
from sqlalchemy.sql import sqltypes

from scripts.sql_import_utils import build_upsert_insert, normalize_sql_identifier, normalize_table_name
from shared.database import engine


router = APIRouter()
SOURCE_LINE_COLUMN = "__SourceLine__"


def _decode_uploaded_text(raw_content: bytes) -> str:
    if not raw_content:
        return ""

    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return raw_content.decode(encoding)
        except UnicodeDecodeError:
            continue

    raise HTTPException(
        status_code=400,
        detail="Não foi possível ler o CSV. Salve o arquivo em UTF-8 ou ANSI/Windows-1252 e tente novamente.",
    )


def _detect_separator(content: str) -> str:
    first_lines = "\n".join(content.splitlines()[:5])
    try:
        dialect = csv.Sniffer().sniff(first_lines, delimiters=";,\t")
        return dialect.delimiter
    except csv.Error:
        if first_lines.count(";") >= first_lines.count(","):
            return ";"
        return ","


def _is_value_compatible_with_type(value: str | None, column_type) -> bool:
    text_value = _normalize_scalar_text(value)
    if text_value is None:
        return True

    if isinstance(column_type, sqltypes.DateTime):
        parsed = pd.to_datetime(text_value, dayfirst=True, errors="coerce")
        return not pd.isna(parsed)
    if isinstance(column_type, sqltypes.Date):
        parsed = pd.to_datetime(text_value, dayfirst=True, errors="coerce")
        return not pd.isna(parsed)
    if isinstance(column_type, (sqltypes.Integer, sqltypes.BigInteger, sqltypes.SmallInteger)):
        numeric = pd.to_numeric(text_value, errors="coerce")
        return not pd.isna(numeric)
    if isinstance(column_type, (sqltypes.Numeric, sqltypes.Float, sqltypes.DECIMAL)):
        numeric = pd.to_numeric(text_value, errors="coerce")
        return not pd.isna(numeric)
    return True


def _build_expanded_header_candidates(raw_header: list[str], schema_columns: list[str]) -> list[list[str]]:
    candidates = [raw_header]
    normalized_header = [normalize_sql_identifier(column) or str(column).strip() for column in raw_header]
    schema_index = {column: idx for idx, column in enumerate(schema_columns)}

    expanded_header: list[str] = []

    for idx, original_column in enumerate(raw_header):
        expanded_header.append(original_column)
        current_normalized = normalized_header[idx]
        current_position = schema_index.get(current_normalized)
        if current_position is None:
            continue

        next_position = None
        for next_idx in range(idx + 1, len(normalized_header)):
            candidate_position = schema_index.get(normalized_header[next_idx])
            if candidate_position is None:
                continue
            if candidate_position > current_position:
                next_position = candidate_position
                break

        if next_position is None:
            continue

        gap_columns = schema_columns[current_position + 1:next_position]
        if 0 < len(gap_columns) <= 4:
            expanded_header.extend(gap_columns)

    if expanded_header != raw_header:
        candidates.append(expanded_header)

    return candidates


def _score_header_candidate(candidate_header: list[str], rows: list[list[str]], column_types: dict[str, object]) -> int:
    score = 0
    sample_rows = [row for row in rows if any(str(cell).strip() for cell in row)][:20]
    normalized_candidate = [normalize_sql_identifier(column) or str(column).strip() for column in candidate_header]

    for row in sample_rows:
        if len(row) > len(candidate_header):
            score -= 50 * (len(row) - len(candidate_header))
            continue

        padded_row = row + [""] * (len(candidate_header) - len(row))
        for column_name, value in zip(normalized_candidate, padded_row):
            column_type = column_types.get(column_name)
            if column_type is None:
                continue
            score += 2 if _is_value_compatible_with_type(value, column_type) else -5

    return score


def _resolve_header_against_schema(raw_header: list[str], rows: list[list[str]], column_types: dict[str, object]) -> list[str]:
    schema_columns = list(column_types.keys())
    candidates = _build_expanded_header_candidates(raw_header, schema_columns)
    if len(candidates) == 1:
        return raw_header

    best_candidate = max(candidates, key=lambda candidate: _score_header_candidate(candidate, rows, column_types))
    return best_candidate


def _build_dataframe_from_csv(content: str, sep: str, column_types: dict[str, object] | None = None) -> pd.DataFrame:
    reader = csv.reader(io.StringIO(content), delimiter=sep)
    rows = list(reader)
    if not rows:
        raise HTTPException(status_code=400, detail='Nenhum dado encontrado no CSV.')

    header = [str(cell).strip() for cell in rows[0]]
    if not any(header):
        raise HTTPException(status_code=400, detail='Cabeçalho do CSV vazio ou inválido.')

    body_rows = [[str(cell).strip() for cell in row] for row in rows[1:]]
    if column_types:
        header = _resolve_header_against_schema(header, body_rows, column_types)

    expected_columns = len(header)
    data_rows: list[list[str]] = []
    source_lines: list[int] = []
    mismatches: list[tuple[int, int]] = []

    for line_number, row in enumerate(body_rows, start=2):
        normalized_row = row
        if not any(normalized_row):
            continue
        if len(normalized_row) > expected_columns:
            mismatches.append((line_number, len(normalized_row)))
            continue
        if len(normalized_row) < expected_columns:
            normalized_row = normalized_row + [""] * (expected_columns - len(normalized_row))
        data_rows.append(normalized_row)
        source_lines.append(line_number)

    if mismatches:
        details = "; ".join(
            f"linha {line_number} com {column_count} colunas" for line_number, column_count in mismatches[:5]
        )
        raise HTTPException(
            status_code=400,
            detail=(
                f"CSV desalinhado: o cabeçalho tem {expected_columns} colunas, mas {details}. "
                "Isso normalmente indica cabeçalho faltando ou separador extra dentro de algum campo."
            ),
        )

    if not data_rows:
        raise HTTPException(status_code=400, detail='Nenhum dado encontrado no CSV.')

    df = pd.DataFrame(data_rows, columns=header, dtype=str)
    df[SOURCE_LINE_COLUMN] = source_lines
    return df


def _normalize_dataframe_columns(df: pd.DataFrame) -> pd.DataFrame:
    rename_map: dict[str, str] = {}
    normalized_columns: set[str] = set()
    for original_column in df.columns:
        if original_column == SOURCE_LINE_COLUMN:
            continue
        normalized_column = normalize_sql_identifier(str(original_column))
        if not normalized_column:
            continue
        if normalized_column in normalized_columns:
            raise HTTPException(
                status_code=400,
                detail=f"Coluna duplicada após normalização para PascalCase: {normalized_column}",
            )
        rename_map[original_column] = normalized_column
        normalized_columns.add(normalized_column)
    return df.rename(columns=rename_map)


def _coerce_value(value):
    return None if pd.isna(value) else value


def _normalize_scalar_text(value) -> str | None:
    value = _coerce_value(value)
    if value is None:
        return None

    text_value = str(value).strip()
    if not text_value or text_value.lower() in {"nan", "none", "null"}:
        return None
    if text_value.endswith(".0") and text_value[:-2].lstrip("-").isdigit():
        return text_value[:-2]
    return text_value


def _coerce_date_value(value, column_name: str, include_time: bool):
    text_value = _normalize_scalar_text(value)
    if text_value is None:
        return None

    explicit_formats = [
        "%d/%m/%Y",
        "%d/%m/%y",
        "%Y-%m-%d",
        "%d/%m/%Y %H:%M",
        "%d/%m/%Y %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d %H:%M:%S",
    ]

    parsed = None
    for fmt in explicit_formats:
        try:
            parsed = datetime.strptime(text_value, fmt)
            break
        except ValueError:
            continue

    if parsed is None:
        pandas_parsed = pd.to_datetime(text_value, dayfirst=True, errors="coerce")
        if not pd.isna(pandas_parsed):
            parsed = pandas_parsed.to_pydatetime()

    if parsed is None:
        kind = "data/hora" if include_time else "data"
        raise HTTPException(
            status_code=400,
            detail=f"Valor inválido para {column_name}: {text_value}. Informe a {kind} em formato válido, como DD/MM/AAAA ou AAAA-MM-DD.",
        )

    return parsed if include_time else parsed.date()


def _coerce_numeric_value(value, column_name: str, integer_only: bool):
    text_value = _normalize_scalar_text(value)
    if text_value is None:
        return None

    numeric = pd.to_numeric(text_value, errors="coerce")
    if pd.isna(numeric):
        tipo = "inteiro" if integer_only else "numérico"
        raise HTTPException(
            status_code=400,
            detail=f"Valor inválido para {column_name}: {text_value}. Informe um valor {tipo} válido.",
        )

    return int(numeric) if integer_only else float(numeric)


def _coerce_value_for_column(value, column_type, column_name: str):
    value = _coerce_value(value)
    if value is None:
        return None

    if isinstance(column_type, sqltypes.DateTime):
        return _coerce_date_value(value, column_name, include_time=True)
    if isinstance(column_type, sqltypes.Date):
        return _coerce_date_value(value, column_name, include_time=False)
    if isinstance(column_type, (sqltypes.Integer, sqltypes.BigInteger, sqltypes.SmallInteger)):
        return _coerce_numeric_value(value, column_name, integer_only=True)
    if isinstance(column_type, (sqltypes.Numeric, sqltypes.Float, sqltypes.DECIMAL)):
        return _coerce_numeric_value(value, column_name, integer_only=False)

    return _normalize_scalar_text(value)


def _prepare_upsert(conn, table_name: str, incoming_columns: list[str]) -> tuple[list[str], dict[str, object], object]:
    inspector = inspect(conn)
    available_tables = set(inspector.get_table_names())
    if table_name not in available_tables:
        raise HTTPException(status_code=400, detail=f"Tabela inválida para importação: {table_name}")

    existing_columns = {column["name"]: column for column in inspector.get_columns(table_name)}
    unknown_columns = [column for column in incoming_columns if column not in existing_columns]
    if unknown_columns:
        raise HTTPException(
            status_code=400,
            detail=f"Colunas não reconhecidas para {table_name}: {', '.join(unknown_columns)}",
        )

    pk_columns = inspector.get_pk_constraint(table_name).get("constrained_columns") or []
    if len(pk_columns) != 1:
        raise HTTPException(status_code=400, detail=f"Tabela {table_name} sem chave primária simples para upsert")

    values_sql = ", ".join(f":{column}" for column in incoming_columns)
    upsert_sql = build_upsert_insert(table_name, incoming_columns, values_sql, pk_columns[0])
    column_types = {column: existing_columns[column]["type"] for column in incoming_columns}
    return incoming_columns, column_types, text(upsert_sql)


def _get_table_column_types(table_name: str) -> dict[str, object]:
    inspector = inspect(engine)
    available_tables = set(inspector.get_table_names())
    if table_name not in available_tables:
        raise HTTPException(status_code=400, detail=f"Tabela inválida para importação: {table_name}")
    return {column["name"]: column["type"] for column in inspector.get_columns(table_name)}


def _looks_like_date_value(value) -> bool:
    text_value = _normalize_scalar_text(value)
    if text_value is None:
        return True
    parsed = pd.to_datetime(text_value, dayfirst=True, errors="coerce")
    return not pd.isna(parsed)


def _looks_like_turno_value(value) -> bool:
    text_value = _normalize_scalar_text(value)
    if text_value is None:
        return True
    return text_value.casefold() in {
        "manhã",
        "manha",
        "tarde",
        "noite",
        "matutino",
        "vespertino",
        "noturno",
        "integral",
        "ead",
    }


def _build_row_alignment_hint(row: dict[str, object]) -> str | None:
    turno = row.get("Turno")
    setor = row.get("Setor")
    data_ingresso = row.get("DataIngresso")
    data_conclusao = row.get("DataConclusao")
    trabalho = row.get("Trabalho")

    hints: list[str] = []

    if not _looks_like_turno_value(turno) and _looks_like_turno_value(setor):
        hints.append("`Turno` e `Setor` parecem deslocados.")

    if not _looks_like_date_value(data_ingresso) and (_looks_like_date_value(trabalho) or str(_normalize_scalar_text(data_conclusao) or "").isdigit()):
        hints.append(
            "Há indício de valor extra após `EscolaAtual` ou de coluna vazia faltando perto do final da linha."
        )

    if not hints:
        return None

    return " ".join(hints)


@router.post('/importar-csv')
def importar_csv(file: UploadFile, table: str = Form(...), overwrite: bool = Form(False)):
    try:
        raw_content = file.file.read()
        content = _decode_uploaded_text(raw_content)
        if not content.strip():
            raise HTTPException(status_code=400, detail='Arquivo CSV vazio.')

        normalized_table = normalize_table_name(table)
        sep = _detect_separator(content)
        table_column_types = _get_table_column_types(normalized_table)
        df = _build_dataframe_from_csv(content, sep, table_column_types)

        source_lines = df[SOURCE_LINE_COLUMN].tolist() if SOURCE_LINE_COLUMN in df.columns else [None] * len(df)
        if SOURCE_LINE_COLUMN in df.columns:
            df = df.drop(columns=[SOURCE_LINE_COLUMN])

        df = _normalize_dataframe_columns(df)
        rows = df.to_dict(orient='records')

        with engine.begin() as conn:
            columns, column_types, statement = _prepare_upsert(conn, normalized_table, list(df.columns))
            if normalized_table in {"Alunos", "Professores"}:
                conn.execute(text('SET FOREIGN_KEY_CHECKS = 0'))
            try:
                if overwrite:
                    conn.execute(text(f'DELETE FROM {normalized_table}'))
                for row, source_line in zip(rows, source_lines):
                    params = {}
                    for column in columns:
                        try:
                            params[column] = _coerce_value_for_column(row.get(column), column_types[column], column)
                        except HTTPException as exc:
                            if source_line is not None:
                                detail = getattr(exc, 'detail', str(exc))
                                alignment_hint = _build_row_alignment_hint(row)
                                if alignment_hint:
                                    detail = f"{detail} {alignment_hint}"
                                raise HTTPException(
                                    status_code=exc.status_code,
                                    detail=f"{detail} Linha do CSV: {source_line}.",
                                ) from exc
                            raise
                    conn.execute(statement, params)
            finally:
                if normalized_table in {"Alunos", "Professores"}:
                    conn.execute(text('SET FOREIGN_KEY_CHECKS = 1'))

        return {"message": "Importação concluída com sucesso."}
    except HTTPException:
        raise
    except Exception as e:
        print("Erro ao importar CSV:", e)
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
