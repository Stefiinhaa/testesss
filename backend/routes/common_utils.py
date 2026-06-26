import json

from fastapi import HTTPException, status


STATUS_MATRICULA_EQUIVALENCIAS = {
    'ativo': 'Ativo',
    'trancado': 'Trancado',
    'concluido': 'Concluído',
    'concluído': 'Concluído',
    'cancelado': 'Cancelado',
}


def ensure_admin(usuario_logado: dict):
    perfil = str(usuario_logado.get("perfil") or "").strip().lower()
    if perfil not in {"admin", "administrador"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado")


def parse_values(raw: str | None) -> list[str]:
    if raw is None:
        return []
    if hasattr(raw, "default"):
        raw = raw.default
    if raw is None:
        return []
    normalized = str(raw).strip()
    if normalized.startswith('[') and normalized.endswith(']'):
        try:
            values = json.loads(normalized)
        except json.JSONDecodeError:
            values = None
        if isinstance(values, list):
            return list(dict.fromkeys(str(part).strip() for part in values if str(part).strip()))
    values = [part.strip() for part in str(raw).split(",") if part and part.strip()]
    return list(dict.fromkeys(values))


def normalize_matricula_status_read(value) -> str:
    raw_value = str(getattr(value, 'value', value) or '').strip()
    if not raw_value:
        return ''
    return STATUS_MATRICULA_EQUIVALENCIAS.get(raw_value.lower(), raw_value)
