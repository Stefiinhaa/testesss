from pydantic import BaseModel, EmailStr, field_validator


def _validate_password_complexity(v: str | None) -> str | None:
    """Senha deve ter ao menos 8 caracteres e 1 dígito ou caractere especial.
    Strings vazias passam aqui — a rota valida 'obrigatória' separadamente.
    """
    if not v:
        return v
    if len(v) < 8:
        raise ValueError("Senha deve ter pelo menos 8 caracteres.")
    if not any(not c.isalpha() for c in v):
        raise ValueError("Senha deve conter pelo menos um número ou caractere especial.")
    return v


class UsuarioCreate(BaseModel):
    login: EmailStr | None = None
    user: EmailStr | None = None
    senha: str | None = None
    senha_hash: str | None = None
    perfil: str = "aluno"
    id_aluno: str | None = None

    @field_validator("senha")
    @classmethod
    def senha_complexity(cls, v):
        return _validate_password_complexity(v)


class UsuarioUpdate(BaseModel):
    login: EmailStr | None = None
    user: EmailStr | None = None
    senha: str | None = None
    senha_hash: str | None = None
    perfil: str | None = None
    ativo: bool | None = None
    id_aluno: str | None = None

    @field_validator("senha")
    @classmethod
    def senha_complexity(cls, v):
        return _validate_password_complexity(v)


class UsuarioOut(BaseModel):
    id_usuario: int
    login: str
    perfil: str
    ativo: bool
