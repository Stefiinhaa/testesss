"""initial backend

Revision ID: init_backend
Revises:
Create Date: 2026-02-02 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'init_backend'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    # Some environments already have the `Usuarios` table created by other migrations or SQL seeds.
    # Skip creation if it already exists to make this migration idempotent in mixed histories.
    if not insp.has_table('Usuarios'):
        op.create_table(
            'Usuarios',
            sa.Column('IdUsuario', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('User', sa.String(length=50), nullable=False, unique=True, index=True),
            sa.Column('Senha', sa.String(length=255), nullable=False),
            sa.Column('Perfil', sa.String(length=20), nullable=False, server_default='aluno'),
            sa.Column('Ativo', sa.Boolean(), nullable=False, server_default=sa.sql.expression.true()),
        )


def downgrade() -> None:
    op.drop_table('Usuarios')
