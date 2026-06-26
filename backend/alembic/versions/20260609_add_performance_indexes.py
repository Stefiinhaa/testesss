"""Add performance indexes on deleted_at and frequently filtered columns.

Improves query performance for ativo/inativo filtering across all entities.

Revision ID: 20260609_perf_idx
Revises: 20260602_cursos_online
Create Date: 2026-06-09
"""
from alembic import op

revision = '20260609_perf_idx'
down_revision = '20260602_cursos_online'
branch_labels = None
depends_on = None

INDEXES = [
    ('idx_alunos_deleted', 'Alunos', ['deleted_at']),
    ('idx_alunos_email', 'Alunos', ['Email']),
    ('idx_chamadas_deleted', 'Chamadas', ['deleted_at']),
    ('idx_chamadas_idaluno', 'Chamadas', ['IdAluno']),
    ('idx_avaliacoes_deleted', 'Avaliacoes', ['deleted_at']),
    ('idx_professores_deleted', 'Professores', ['deleted_at']),
    ('idx_cursos_deleted', 'Cursos', ['deleted_at']),
    ('idx_turmas_deleted', 'Turmas', ['deleted_at']),
    ('idx_interesses_deleted', 'Interesses', ['deleted_at']),
    ('idx_trilhas_deleted', 'Trilhas', ['DeletedAt']),
]


def upgrade() -> None:
    for name, table, columns in INDEXES:
        try:
            op.create_index(name, table, columns)
        except Exception:
            pass  # Index may already exist


def downgrade() -> None:
    for name, table, _columns in INDEXES:
        try:
            op.drop_index(name, table_name=table)
        except Exception:
            pass
