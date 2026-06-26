"""add split phone fields

Revision ID: add_split_phone_fields
Revises: rename_aluno_situacao_em_aberto
Create Date: 2026-04-09 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_split_phone_fields'
down_revision = 'rename_aluno_situacao_em_aberto'
branch_labels = None
depends_on = None


def _digits_expr(column_name: str) -> str:
    return f"REGEXP_REPLACE(COALESCE({column_name}, ''), '[^0-9]', '')"


def _local_phone_expr(column_name: str) -> str:
    digits = _digits_expr(column_name)
    return (
        f"CASE "
        f"WHEN CHAR_LENGTH({digits}) >= 13 THEN RIGHT({digits}, 11) "
        f"WHEN CHAR_LENGTH({digits}) = 12 THEN RIGHT({digits}, 10) "
        f"ELSE {digits} END"
    )


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    aluno_digits = _digits_expr('FoneCelular')
    aluno_local = _local_phone_expr('FoneCelular')
    professor_digits = _digits_expr('Telefone')
    professor_local = _local_phone_expr('Telefone')

    if insp.has_table('Alunos'):
        cols = [c['name'] for c in insp.get_columns('Alunos')]
        if 'FoneCelularDDI' not in cols:
            op.add_column('Alunos', sa.Column('FoneCelularDDI', sa.String(length=4), nullable=True))
        if 'FoneCelularDDD' not in cols:
            op.add_column('Alunos', sa.Column('FoneCelularDDD', sa.String(length=4), nullable=True))
        if 'FoneCelularNumero' not in cols:
            op.add_column('Alunos', sa.Column('FoneCelularNumero', sa.String(length=12), nullable=True))
        op.execute(sa.text(
            f"UPDATE Alunos "
            f"SET FoneCelularDDI = CASE "
            f"WHEN CHAR_LENGTH({aluno_digits}) > CHAR_LENGTH({aluno_local}) THEN LEFT({aluno_digits}, LEAST(4, CHAR_LENGTH({aluno_digits}) - CHAR_LENGTH({aluno_local}))) "
            f"WHEN CHAR_LENGTH({aluno_local}) >= 10 THEN '55' "
            f"ELSE NULL END "
            f"WHERE CHAR_LENGTH({aluno_digits}) > 0 AND COALESCE(FoneCelularDDI, '') = ''"
        ))
        op.execute(sa.text(
            f"UPDATE Alunos "
            f"SET FoneCelularDDD = LEFT({aluno_local}, 2) "
            f"WHERE CHAR_LENGTH({aluno_local}) >= 10 AND COALESCE(FoneCelularDDD, '') = ''"
        ))
        op.execute(sa.text(
            f"UPDATE Alunos "
            f"SET FoneCelularNumero = CASE "
            f"WHEN CHAR_LENGTH({aluno_local}) >= 10 THEN SUBSTRING({aluno_local}, 3, 12) "
            f"ELSE LEFT({aluno_local}, 12) END "
            f"WHERE CHAR_LENGTH({aluno_digits}) > 0 AND COALESCE(FoneCelularNumero, '') = ''"
        ))

    if insp.has_table('Professores'):
        cols = [c['name'] for c in insp.get_columns('Professores')]
        if 'TelefoneDDI' not in cols:
            op.add_column('Professores', sa.Column('TelefoneDDI', sa.String(length=4), nullable=True))
        if 'TelefoneDDD' not in cols:
            op.add_column('Professores', sa.Column('TelefoneDDD', sa.String(length=4), nullable=True))
        if 'TelefoneNumero' not in cols:
            op.add_column('Professores', sa.Column('TelefoneNumero', sa.String(length=12), nullable=True))
        op.execute(sa.text(
            f"UPDATE Professores "
            f"SET TelefoneDDI = CASE "
            f"WHEN CHAR_LENGTH({professor_digits}) > CHAR_LENGTH({professor_local}) THEN LEFT({professor_digits}, LEAST(4, CHAR_LENGTH({professor_digits}) - CHAR_LENGTH({professor_local}))) "
            f"WHEN CHAR_LENGTH({professor_local}) >= 10 THEN '55' "
            f"ELSE NULL END "
            f"WHERE CHAR_LENGTH({professor_digits}) > 0 AND COALESCE(TelefoneDDI, '') = ''"
        ))
        op.execute(sa.text(
            f"UPDATE Professores "
            f"SET TelefoneDDD = LEFT({professor_local}, 2) "
            f"WHERE CHAR_LENGTH({professor_local}) >= 10 AND COALESCE(TelefoneDDD, '') = ''"
        ))
        op.execute(sa.text(
            f"UPDATE Professores "
            f"SET TelefoneNumero = CASE "
            f"WHEN CHAR_LENGTH({professor_local}) >= 10 THEN SUBSTRING({professor_local}, 3, 12) "
            f"ELSE LEFT({professor_local}, 12) END "
            f"WHERE CHAR_LENGTH({professor_digits}) > 0 AND COALESCE(TelefoneNumero, '') = ''"
        ))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if insp.has_table('Professores'):
        cols = [c['name'] for c in insp.get_columns('Professores')]
        for col in ['TelefoneNumero', 'TelefoneDDD', 'TelefoneDDI']:
            if col in cols:
                op.drop_column('Professores', col)

    if insp.has_table('Alunos'):
        cols = [c['name'] for c in insp.get_columns('Alunos')]
        for col in ['FoneCelularNumero', 'FoneCelularDDD', 'FoneCelularDDI']:
            if col in cols:
                op.drop_column('Alunos', col)
