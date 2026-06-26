"""add professor whatsapp and matricula data conclusao

Revision ID: add_prof_whatsapp_matricula_conc
Revises: add_usuario_idaluno_fk
Create Date: 2026-03-25 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_prof_whatsapp_matricula_conc'
down_revision = 'add_usuario_idaluno_fk'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if insp.has_table('Professores'):
        cols = [c['name'] for c in insp.get_columns('Professores')]
        if 'WhatsApp' not in cols:
            op.add_column('Professores', sa.Column('WhatsApp', sa.Boolean(), nullable=False, server_default=sa.text('0')))
            op.alter_column('Professores', 'WhatsApp', server_default=None)

    if insp.has_table('Matriculas'):
        cols = [c['name'] for c in insp.get_columns('Matriculas')]
        if 'DataConclusao' not in cols:
            op.add_column('Matriculas', sa.Column('DataConclusao', sa.Date(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if insp.has_table('Matriculas'):
        cols = [c['name'] for c in insp.get_columns('Matriculas')]
        if 'DataConclusao' in cols:
            op.drop_column('Matriculas', 'DataConclusao')

    if insp.has_table('Professores'):
        cols = [c['name'] for c in insp.get_columns('Professores')]
        if 'WhatsApp' in cols:
            op.drop_column('Professores', 'WhatsApp')
