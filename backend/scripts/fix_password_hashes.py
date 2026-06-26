#!/usr/bin/env python3
"""Converte senhas legadas para hash quando possível.

Comportamento:
- mantém intactas as senhas já reconhecidas pelo `passlib`
- converte senhas em texto puro conhecidas dos usuários seed
- opcionalmente converte outros logins via env `DEFAULT_PASSWORD_BY_LOGIN`
  no formato `login1=senha1;login2=senha2`
- gera um resumo final sem falhar quando encontrar casos desconhecidos
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Dict

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlmodel import Session, select

from shared.database import engine
from shared.models import Usuario
from shared.seed_defaults import get_seed_credentials
from shared.security import gerar_hash_senha, pwd_context


KNOWN_DEFAULT_PASSWORDS: Dict[str, str] = {}


def _load_env_password_map() -> Dict[str, str]:
    raw = os.getenv("DEFAULT_PASSWORD_BY_LOGIN", "").strip()
    if not raw:
        return {}

    parsed: Dict[str, str] = {}
    for item in raw.split(";"):
        item = item.strip()
        if not item or "=" not in item:
            continue
        login, password = item.split("=", 1)
        login = login.strip()
        password = password.strip()
        if login and password:
            parsed[login] = password
    return parsed


def main() -> None:
    seed_credentials = get_seed_credentials()
    password_map = {
        seed_credentials['admin_user']: seed_credentials['admin_password'],
        seed_credentials['aluno_user']: seed_credentials['aluno_password'],
        **KNOWN_DEFAULT_PASSWORDS,
        **_load_env_password_map(),
    }

    scanned = 0
    updated = 0
    already_hashed = 0
    skipped_unknown = 0

    with Session(engine) as session:
        users = session.exec(select(Usuario)).all()

        for user in users:
            scanned += 1
            stored = (user.Senha or "").strip()
            login = (user.User or "").strip()

            if not stored:
                skipped_unknown += 1
                print(f"[fix_password_hashes] senha vazia para {login or '<sem login>'}; ignorando")
                continue

            if pwd_context.identify(stored):
                already_hashed += 1
                continue

            plain_password = password_map.get(login)
            if not plain_password:
                skipped_unknown += 1
                print(f"[fix_password_hashes] senha legada para {login}, mas sem senha conhecida para converter")
                continue

            user.Senha = gerar_hash_senha(plain_password)
            session.add(user)
            updated += 1
            print(f"[fix_password_hashes] senha convertida para {login}")

        if updated:
            session.commit()

    print(
        "[fix_password_hashes] resumo:",
        f"scanned={scanned}",
        f"updated={updated}",
        f"already_hashed={already_hashed}",
        f"skipped_unknown={skipped_unknown}",
    )


if __name__ == "__main__":
    main()
