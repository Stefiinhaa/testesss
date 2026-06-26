"""create schema backend

Revision ID: create_schema_backend
Revises: baseline_backend
Create Date: 2026-02-02 20:30:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'create_schema_backend'
down_revision = 'baseline_backend'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE IF NOT EXISTS `Usuarios` (
      `IdUsuario` int NOT NULL AUTO_INCREMENT,
      `User` varchar(50) NOT NULL,
      `Senha` varchar(255) NOT NULL,
      `Perfil` enum('admin','aluno') NOT NULL,
      `Ativo` tinyint(1) DEFAULT '1',
      PRIMARY KEY (`IdUsuario`),
      UNIQUE KEY `User` (`User`)
    ) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS `Usuarios`")
