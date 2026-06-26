"""populate Usuarios.IdAluno from Alunos by email

Revision ID: populate_usuario_idaluno
Revises: add_usuario_idaluno_fk
Create Date: 2026-02-05 00:30:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'populate_usuario_idaluno'
down_revision = 'add_usuario_idaluno_fk'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table('Usuarios') or not insp.has_table('Alunos'):
        # nothing to do if tables missing
        return
    # safe, idempotent update: only fill NULL IdAluno where emails match
    # op.get_bind() returns a SQLAlchemy Connection; execute directly on it
    conn = bind
    conn.execute(sa.text(
        """
        UPDATE Usuarios u
        JOIN Alunos a ON u.User = a.Email
        SET u.IdAluno = a.IdAluno
        WHERE (u.IdAluno IS NULL OR u.IdAluno = '')
        """
    ))


def downgrade() -> None:
    # no-op: do not remove data on downgrade
    pass
