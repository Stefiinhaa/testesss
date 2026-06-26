"""add aluno funcao field

Revision ID: add_aluno_funcao_field
Revises: add_aluno_whatsapp_norm_status
Create Date: 2026-04-02 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_aluno_funcao_field'
down_revision = 'add_aluno_whatsapp_norm_status'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if insp.has_table('Alunos'):
        cols = [c['name'] for c in insp.get_columns('Alunos')]
        if 'Funcao' not in cols:
            op.add_column('Alunos', sa.Column('Funcao', sa.String(length=150), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if insp.has_table('Alunos'):
        cols = [c['name'] for c in insp.get_columns('Alunos')]
        if 'Funcao' in cols:
            op.drop_column('Alunos', 'Funcao')
