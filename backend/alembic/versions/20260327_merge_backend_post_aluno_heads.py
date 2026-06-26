"""merge backend heads after aluno destaque

Revision ID: merge_backend_post_aluno_heads
Revises: populate_usuario_idaluno, add_aluno_destaque_fields
Create Date: 2026-03-27 00:30:00.000000
"""

# revision identifiers, used by Alembic.
revision = 'merge_backend_post_aluno_heads'
down_revision = ('populate_usuario_idaluno', 'add_aluno_destaque_fields')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
