from datetime import datetime

import pandas as pd
from fastapi import APIRouter, HTTPException
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from pydantic import BaseModel
from sqlalchemy import inspect, text
from sqlalchemy.sql import sqltypes

from scripts.sql_import_utils import build_upsert_insert, normalize_sql_identifier, normalize_table_name
from shared.database import engine

router = APIRouter()


class ImportGoogleSheetsRequest(BaseModel):
    sheetId: str
    sheetRange: str
    googleToken: str
    table: str = "Alunos"
    overwrite: bool = True


def _normalize_dataframe_columns(df: pd.DataFrame) -> pd.DataFrame:
    rename_map: dict[str, str] = {}
    normalized_columns: set[str] = set()
    for original_column in df.columns:
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


@router.post('/importar-google-sheets')
def importar_google_sheets(req: ImportGoogleSheetsRequest):
    try:
        creds = Credentials(token=req.googleToken)
        service = build('sheets', 'v4', credentials=creds)
        sheet = service.spreadsheets()
        result = sheet.values().get(spreadsheetId=req.sheetId, range=req.sheetRange or 'Sheet1').execute()
        values = result.get('values', [])
        if not values:
            raise HTTPException(status_code=400, detail='Nenhum dado encontrado na planilha.')
        df = pd.DataFrame(values[1:], columns=values[0])
        if df.empty:
            raise HTTPException(status_code=400, detail='Nenhum dado encontrado na planilha.')

        normalized_table = normalize_table_name(req.table)
        df = _normalize_dataframe_columns(df)
        rows = df.to_dict(orient='records')

        with engine.begin() as conn:
            columns, column_types, statement = _prepare_upsert(conn, normalized_table, list(df.columns))
            if normalized_table in {"Alunos", "Professores"}:
                conn.execute(text('SET FOREIGN_KEY_CHECKS = 0'))
            try:
                if req.overwrite:
                    conn.execute(text(f'DELETE FROM {normalized_table}'))
                for row in rows:
                    params = {
                        column: _coerce_value_for_column(row.get(column), column_types[column], column)
                        for column in columns
                    }
                    conn.execute(statement, params)
            finally:
                if normalized_table in {"Alunos", "Professores"}:
                    conn.execute(text('SET FOREIGN_KEY_CHECKS = 1'))

        return {"message": "Importação concluída com sucesso."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
