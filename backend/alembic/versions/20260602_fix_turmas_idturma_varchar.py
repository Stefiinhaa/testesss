"""Fix Turmas.IdTurma from CHAR(36) to VARCHAR(36)

Resolve FK mismatch entre Turmas.IdTurma (CHAR(36) com padding) e
Alunos.IdTurma (VARCHAR(36) sem padding) que causava IntegrityError
ao criar alunos com IdTurma de IDs curtos (<36 chars).

Revision ID: 20260602_fix_turmas
Revises: 20260518_add_trilha_and_aluno_trilha
Create Date: 2026-06-02
"""
from alembic import op
import sqlalchemy as sa

revision = '20260602_fix_turmas'
down_revision = 'add_trilha_models'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("SET FOREIGN_KEY_CHECKS=0")
    op.alter_column(
        'Turmas', 'IdTurma',
        existing_type=sa.CHAR(36),
        type_=sa.VARCHAR(36),
        existing_nullable=False,
    )
    op.alter_column(
        'Turmas', 'IdProfessor',
        existing_type=sa.CHAR(36),
        type_=sa.VARCHAR(36),
        existing_nullable=True,
    )
    op.alter_column(
        'Cursos', 'IdCurso',
        existing_type=sa.CHAR(36),
        type_=sa.VARCHAR(36),
        existing_nullable=False,
    )
    op.alter_column(
        'Professores', 'IdProfessor',
        existing_type=sa.CHAR(36),
        type_=sa.VARCHAR(36),
        existing_nullable=False,
    )
    op.alter_column(
        'Aulas', 'IdAula',
        existing_type=sa.CHAR(36),
        type_=sa.VARCHAR(36),
        existing_nullable=False,
    )
    op.alter_column(
        'Aulas', 'IdTurma',
        existing_type=sa.CHAR(36),
        type_=sa.VARCHAR(36),
        existing_nullable=True,
    )
    op.alter_column(
        'Usuarios', 'IdAluno',
        existing_type=sa.CHAR(36),
        type_=sa.VARCHAR(36),
        existing_nullable=True,
    )
    op.execute("SET FOREIGN_KEY_CHECKS=1")


def downgrade() -> None:
    op.execute("SET FOREIGN_KEY_CHECKS=0")
    op.alter_column('Turmas', 'IdTurma', existing_type=sa.VARCHAR(36), type_=sa.CHAR(36), existing_nullable=False)
    op.alter_column('Turmas', 'IdProfessor', existing_type=sa.VARCHAR(36), type_=sa.CHAR(36), existing_nullable=True)
    op.alter_column('Cursos', 'IdCurso', existing_type=sa.VARCHAR(36), type_=sa.CHAR(36), existing_nullable=False)
    op.alter_column('Professores', 'IdProfessor', existing_type=sa.VARCHAR(36), type_=sa.CHAR(36), existing_nullable=False)
    op.alter_column('Aulas', 'IdAula', existing_type=sa.VARCHAR(36), type_=sa.CHAR(36), existing_nullable=False)
    op.alter_column('Aulas', 'IdTurma', existing_type=sa.VARCHAR(36), type_=sa.CHAR(36), existing_nullable=True)
    op.alter_column('Usuarios', 'IdAluno', existing_type=sa.VARCHAR(36), type_=sa.CHAR(36), existing_nullable=True)
    op.execute("SET FOREIGN_KEY_CHECKS=1")
