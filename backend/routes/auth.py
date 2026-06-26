from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select
from shared.database import get_session
from shared.models import Usuario
from shared.security import verificar_senha
from shared.auth_utils import create_access_token
from shared.auth_utils import extract_token_from_request, revoke_token
from shared.security import gerar_hash_senha
from shared.email_utils import send_password_reset_email
from shared.database import engine
from shared.models import PasswordReset
from shared.config import settings
from datetime import datetime, timezone, timedelta
import secrets
from fastapi import Request
import logging
from shared.logging_utils import mask_identifier
from pydantic import BaseModel, EmailStr, Field, field_validator
from shared.rate_limit import enforce_rate_limit


"""Roteiro de autenticação e recuperação de senha.

Este módulo expõe endpoints para:
- Login (`/login` e `/token`) que retornam um JWT Bearer.
- Solicitação de reset de senha (`/esqueci-senha`) que gera um token temporário
  e envia por e-mail (mensagem neutra retornada para não vazar existência).
- Confirmação de reset (`/reset-senha`) que valida o token e atualiza a senha.

Segurança e observações:
- Não há endpoint público de registro; contas são gerenciadas internamente.
- Mensagens retornadas em endpoints de reset são deliberadamente neutras para
  evitar enumerar usuários existentes.
"""


router = APIRouter(tags=["Autenticação"])


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=16, max_length=512)
    senha: str = Field(min_length=8, max_length=256)

    @field_validator("senha")
    @classmethod
    def senha_complexity(cls, v: str) -> str:
        if not any(not c.isalpha() for c in v):
            raise ValueError("Senha deve conter pelo menos um número ou caractere especial.")
        return v


def rate_limit_login(request: Request):
    enforce_rate_limit(request, scope="auth-login", limit=10, window_seconds=60)


def rate_limit_forgot_password(request: Request):
    enforce_rate_limit(request, scope="auth-forgot-password", limit=5, window_seconds=300)


def rate_limit_reset_password(request: Request):
    enforce_rate_limit(request, scope="auth-reset-password", limit=10, window_seconds=300)


@router.post("/auth/token")
@router.post("/token")
@router.post("/auth/login")
@router.post("/login")  # Dois endpoints (apelidos) para conveniência de clientes
def login(
    request: Request,
    response: Response,
    _: None = Depends(rate_limit_login),
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session),
):
    """Autentica usuário e retorna um token JWT.

    - Recebe `username` e `password` via `OAuth2PasswordRequestForm`.
    - Não divulga se o login ou a senha foram incorretos individualmente.
    - Registra tentativas de login de forma mascarada para investigação sem
      expor dados sensíveis em logs.
    """
    usuario = session.exec(select(Usuario).where(Usuario.User == form_data.username)).first()

    login_logger = logging.getLogger("app.auth")
    masked = mask_identifier(form_data.username or "")

    login_logger.info(
        "login attempt",
        extra={
            "username_masked": masked,
            "password_length": len(form_data.password or ""),
            "user_found": bool(usuario),
        },
    )
    verified = False
    try:
        if usuario:
            verified = verificar_senha(form_data.password, usuario.Senha)
    except Exception as e:
        login_logger.warning(
            "password verification error",
            extra={"username_masked": masked, "error_type": type(e).__name__},
        )
        verified = False

    if not usuario or not verified:
        login_logger.info(
            "login failed",
            extra={"username_masked": masked, "verified": verified, "user_found": bool(usuario)},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha incorretos",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not usuario.Ativo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Este usuário está desativado. Entre em contato com o suporte.",
        )

    dados_token = {"sub": usuario.User, "id": usuario.IdUsuario, "perfil": usuario.Perfil}
    token_acesso = create_access_token(data=dados_token)
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token_acesso,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite.lower(),
        max_age=60 * 60 * 24,
        path='/',
    )
    login_logger.info("login success", extra={"user_id": usuario.IdUsuario, "username_masked": masked})

    return {"access_token": token_acesso, "token_type": "bearer", "perfil": usuario.Perfil}


@router.post("/auth/logout")
@router.post("/logout")
def logout(request: Request, response: Response):
    token = extract_token_from_request(request)
    if token:
        revoke_token(token)
    response.delete_cookie(key=settings.session_cookie_name, path='/')
    return {"message": "Sessão encerrada."}


@router.post("/auth/esqueci-senha")
@router.post("/esqueci-senha")
def esqueci_senha(
    request: Request,
    payload: ForgotPasswordRequest,
    _: None = Depends(rate_limit_forgot_password),
    session: Session = Depends(get_session),
):
    """Gera token temporário para reset de senha e envia email.

    - Recebe JSON com `{ "email": "user@example.com" }`.
    - Retorna mensagem neutra mesmo quando o e-mail não existe.
    - Persiste um `PasswordReset` com expiração curta (1 hora).
    """
    email = payload.email

    usuario = session.exec(select(Usuario).where(Usuario.User == email)).first()

    logger = logging.getLogger("app.auth")
    logger.info("password reset requested", extra={"email_masked": mask_identifier(email)})

    if not usuario:
        # Mensagem neutra para evitar enumerar contas
        return {"message": "Se o e-mail estiver cadastrado, o link chegará em instantes."}

    # Cria tabela se necessário e persiste token seguro
    from sqlmodel import SQLModel
    SQLModel.metadata.create_all(engine)

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)

    reset = PasswordReset(Login=email, Token=token, ExpiresAt=expires_at)
    session.add(reset)
    session.commit()

    # Envia e-mail com instruções (ambiente dev pode não ter SMTP configurado)
    send_password_reset_email(email, token, email)

    return {"message": "Se o e-mail estiver cadastrado, o link chegará em instantes."}


@router.post("/auth/reset-senha")
@router.post("/reset-senha")
def reset_senha(
    request: Request,
    payload: ResetPasswordRequest,
    _: None = Depends(rate_limit_reset_password),
    session: Session = Depends(get_session),
):
    """Valida token de reset e atualiza a senha do usuário.

    - Espera JSON `{ "token": "...", "senha": "novaSenha" }`.
    - Remove o token após uso e atualiza o hash da senha usando `gerar_hash_senha()`.
    - Retorna mensagens amigáveis para clientes REST.
    """
    token = payload.token
    nova_senha = payload.senha

    logger = logging.getLogger("app.auth")
    logger.info("password reset attempt", extra={"token_masked": token[:6] + "...", "body_present": True})

    statement = select(PasswordReset).where(PasswordReset.Token == token)
    record = session.exec(statement).first()
    if not record:
        raise HTTPException(status_code=400, detail="Token inválido ou expirado")

    if record.ExpiresAt:
        expires_at = record.ExpiresAt
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

        if expires_at < datetime.now(timezone.utc):
            session.delete(record)
            session.commit()
            raise HTTPException(status_code=400, detail="Token expirado")

    usuario = session.exec(select(Usuario).where(Usuario.User == record.Login)).first()
    if not usuario:
        raise HTTPException(status_code=400, detail="Usuário não encontrado")

    try:
        usuario.Senha = gerar_hash_senha(nova_senha)
    except ValueError as ve:
        # Repassa erro de validação para cliente (ex: senha muito longa)
        raise HTTPException(status_code=400, detail=str(ve))
    session.add(usuario)
    session.delete(record)
    try:
        session.commit()
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception:
        session.rollback()
        raise

    return {"message": "Senha atualizada com sucesso."}


# Observação: Registro público removido — contas são criadas apenas pelo admin internamente.
