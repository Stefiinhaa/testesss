from sqlmodel import Session, create_engine, select
from shared.models import Professor, Curso, Turma
import os
from datetime import date

# Pega a URL do banco do seu .env. NÃO coloque credenciais reais no código.
DATABASE_URL = os.getenv("DATABASE_URL")
if isinstance(DATABASE_URL, str):
    DATABASE_URL = DATABASE_URL.strip()
if not DATABASE_URL:
    engine = None
else:
    engine = create_engine(DATABASE_URL)

def seed_data():
    if engine is None:
        print("[seed] DATABASE_URL not set; skipping backend seed.")
        return

    with Session(engine) as session:
        # 1. Inserir Professores
        professores = [
            Professor(IdProfessor='0fb01c08', NomeProfessor='LUCIANA AKEMI', EmailProfessor='luakemi8@gmail.com', WhatsApp=False),
            Professor(IdProfessor='5c5b5bb1', NomeProfessor='JOSÉ CARLOS SCAQUETT', EmailProfessor='josecarlosscaquett@gmail.com', WhatsApp=False),
            Professor(IdProfessor='38ccf343', NomeProfessor='ERIKA BARRADO', EmailProfessor='erika.barrado@sp.senai.br', WhatsApp=False)
        ]

        # 2. Inserir Cursos
        cursos = [
            Curso(IdCurso='cur001', NomeCurso='AMS'),
            Curso(IdCurso='cur002', NomeCurso='AWS'),
            Curso(IdCurso='cur003', NomeCurso='CCNA V7: Introduction To Networks')
        ]

        # Adiciona ao banco ignorando duplicatas se você rodar o script duas vezes
        for p in professores:
            if not session.get(Professor, p.IdProfessor): session.add(p)
        for c in cursos:
            if not session.get(Curso, c.IdCurso): session.add(c)

        session.commit()

        # 3. Inserir Turmas (Precisa dos professores já commitados)
        turmas = [
            Turma(IdTurma='a564f15d', NomeTurma='3º Ano 2024 - Grupo 01', AnoTurma=date(2024, 3, 11), IdProfessor='0fb01c08'),
            Turma(IdTurma='bcc38f1f', NomeTurma='AWS', AnoTurma=date(2023, 11, 29), IdProfessor='5c5b5bb1')
        ]

        for t in turmas:
            if not session.get(Turma, t.IdTurma): session.add(t)

        session.commit()
        print("✅ Dados iniciais inseridos com sucesso!")

if __name__ == "__main__":
    seed_data()
    # Executa seed_admin.py para garantir admin
    import subprocess
    subprocess.run(["python", os.path.join(os.path.dirname(__file__), "../scripts/seed_admin.py")])
