"""add aluno destaque fields

Revision ID: add_aluno_destaque_fields
Revises: add_prof_whatsapp_matricula_conc
Create Date: 2026-03-27 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_aluno_destaque_fields'
down_revision = 'add_prof_whatsapp_matricula_conc'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if insp.has_table('Alunos'):
        cols = [c['name'] for c in insp.get_columns('Alunos')]
        if 'AlunoDestaque' not in cols:
            op.add_column('Alunos', sa.Column('AlunoDestaque', sa.Boolean(), nullable=False, server_default=sa.text('0')))
            op.alter_column('Alunos', 'AlunoDestaque', server_default=None)
        if 'DescricaoDestaque' not in cols:
            op.add_column('Alunos', sa.Column('DescricaoDestaque', sa.String(length=1000), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if insp.has_table('Alunos'):
        cols = [c['name'] for c in insp.get_columns('Alunos')]
        if 'DescricaoDestaque' in cols:
            op.drop_column('Alunos', 'DescricaoDestaque')
        if 'AlunoDestaque' in cols:
            op.drop_column('Alunos', 'AlunoDestaque')
