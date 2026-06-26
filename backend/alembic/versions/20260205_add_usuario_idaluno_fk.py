"""add usuario.IdAluno FK

Revision ID: add_usuario_idaluno_fk
Revises: 20260204_merge_backend_heads
Create Date: 2026-02-05 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_usuario_idaluno_fk'
down_revision = 'merge_backend_heads'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    # Add column if missing
    if insp.has_table('Usuarios'):
        cols = [c['name'] for c in insp.get_columns('Usuarios')]
        if 'IdAluno' not in cols:
            op.add_column('Usuarios', sa.Column('IdAluno', sa.CHAR(length=36), nullable=True))
            # create FK only if Alunos table exists
            if insp.has_table('Alunos'):
                try:
                    op.create_foreign_key('fk_usuarios_idaluno_alunos', 'Usuarios', 'Alunos', ['IdAluno'], ['IdAluno'])
                except Exception:
                    # best-effort: ignore if constraint exists
                    pass


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if insp.has_table('Usuarios'):
        cols = [c['name'] for c in insp.get_columns('Usuarios')]
        if 'IdAluno' in cols:
            # drop fk if exists
            try:
                op.drop_constraint('fk_usuarios_idaluno_alunos', 'Usuarios', type_='foreignkey')
            except Exception:
                pass
            op.drop_column('Usuarios', 'IdAluno')
