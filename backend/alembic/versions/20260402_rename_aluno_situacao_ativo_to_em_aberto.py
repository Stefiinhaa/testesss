"""rename aluno situacao ativo to em aberto

Revision ID: rename_aluno_situacao_em_aberto
Revises: add_aluno_funcao_field
Create Date: 2026-04-02 00:10:00.000000
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'rename_aluno_situacao_em_aberto'
down_revision = 'add_aluno_funcao_field'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE Alunos SET Situacao = 'Em Aberto' WHERE Situacao = 'Ativo'")


def downgrade() -> None:
    op.execute("UPDATE Alunos SET Situacao = 'Ativo' WHERE Situacao = 'Em Aberto'")
