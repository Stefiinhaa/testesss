"""add aluno whatsapp and normalize matricula status

Revision ID: add_aluno_whatsapp_norm_status
Revises: merge_backend_post_aluno_heads
Create Date: 2026-03-31 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_aluno_whatsapp_norm_status'
down_revision = 'merge_backend_post_aluno_heads'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if insp.has_table('Alunos'):
        cols = [c['name'] for c in insp.get_columns('Alunos')]
        if 'WhatsApp' not in cols:
            op.add_column('Alunos', sa.Column('WhatsApp', sa.Boolean(), nullable=False, server_default=sa.text('0')))
            op.alter_column('Alunos', 'WhatsApp', server_default=None)

    if insp.has_table('Matriculas'):
        op.execute(
            sa.text(
                "UPDATE Matriculas SET StatusMatricula = 'Concluído' WHERE StatusMatricula IN ('Concluido', 'Concluído')"
            )
        )

    if insp.has_table('Alunos'):
        op.execute(
            sa.text(
                "UPDATE Alunos SET Situacao = 'Concluído' WHERE Situacao IN ('Concluido', 'Concluído')"
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if insp.has_table('Alunos'):
        cols = [c['name'] for c in insp.get_columns('Alunos')]
        if 'WhatsApp' in cols:
            op.drop_column('Alunos', 'WhatsApp')

    if insp.has_table('Matriculas'):
        op.execute(
            sa.text(
                "UPDATE Matriculas SET StatusMatricula = 'Concluido' WHERE StatusMatricula = 'Concluído'"
            )
        )

    if insp.has_table('Alunos'):
        op.execute(
            sa.text(
                "UPDATE Alunos SET Situacao = 'Concluido' WHERE Situacao = 'Concluído'"
            )
        )
