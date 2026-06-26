"""Adiciona coluna CursosOnline (TEXT) na tabela Trilhas

Revision ID: 20260602_cursos_online
Revises: 20260602_fix_turmas
Create Date: 2026-06-02
"""
from alembic import op
import sqlalchemy as sa

revision = '20260602_cursos_online'
down_revision = '20260602_fix_turmas'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('Trilhas', sa.Column('CursosOnline', sa.TEXT(), nullable=True))


def downgrade() -> None:
    op.drop_column('Trilhas', 'CursosOnline')
