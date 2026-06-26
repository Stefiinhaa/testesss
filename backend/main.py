
# Garante que os diretórios necessários existem antes de qualquer import do FastAPI/StaticFiles
import os
os.makedirs("uploads/alunos", exist_ok=True)
os.makedirs("uploads/professores", exist_ok=True)

import logging
import logging.config
import time
import uuid
import socket
from fnmatch import fnmatch
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from backend.routes import (
    auth,
    usuarios,
    alunos,
    professores,
    turmas,
    cursos,
    interesses,
    trilhas,
    chamadas,
    avaliacoes,
    alunos_interesses,
    aulas,
    importar_google_sheets,
    importar_csv,
)
from shared.config import settings
from shared.logging_config import LOGGING_CONFIG
from shared.logging_utils import redact_headers, has_body
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from shared.database import engine


# Inicialização da API com dados do config.py
app = FastAPI(
    title=settings.app_name,
    description="API FullEduca - Gestão Educacional e Controle de Acesso",
    docs_url="/docs" if settings.enable_docs else None,
    redoc_url="/redoc" if settings.enable_docs else None,
    openapi_url="/openapi.json" if settings.enable_docs else None,
)

# Montar os caminhos para serem acessados via requisição GET HTTP (Traefik não dá stripPrefix na rota de escape)
app.mount("/static/alunos", StaticFiles(directory="uploads/alunos"), name="alunos_imagens")
app.mount("/static/professores", StaticFiles(directory="uploads/professores"), name="professores_imagens")

MAX_REQUEST_BYTES = 5_242_880  # 5 MB
DEFAULT_ALLOWED_HOSTS = ["localhost", "127.0.0.1", "testserver"]
HEALTHCHECK_BYPASS_PATHS = {"/health"}


def wait_for_db(host: str, port: int, retries: int = 30, delay: float = 2.0):
    """Bloqueia a inicialização até que o host:port esteja aceitando conexões.

    Uso: evita que a aplicação levante antes do MySQL estar pronto quando o contêiner
    é reiniciado. Não substitui um healthcheck externo, mas melhora robustez local.
    """
    port = int(port)
    for attempt in range(1, retries + 1):
        try:
            with socket.create_connection((host, port), timeout=2):
                logging.getLogger(__name__).info("DB disponível em %s:%s (tentativa %d)", host, port, attempt)
                return True
        except Exception as exc:
            logging.getLogger(__name__).warning(
                "DB não disponível em %s:%s — tentativa %d/%d (%s: %s)",
                host,
                port,
                attempt,
                retries,
                exc.__class__.__name__,
                exc,
            )
            time.sleep(delay)
    logging.getLogger(__name__).error("Não foi possível conectar ao DB em %s:%s após %d tentativas", host, port, retries)
    return False


def wait_for_db_query(retries: int = 10, delay: float = 2.0):
    """Valida conexão autenticada e execução de query simples no DB."""
    for attempt in range(1, retries + 1):
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            logging.getLogger(__name__).info("Conexão autenticada com DB validada (tentativa %d)", attempt)
            return True
        except Exception as exc:
            logging.getLogger(__name__).warning(
                "DB indisponível para query (tentativa %d/%d) (%s: %s)",
                attempt,
                retries,
                exc.__class__.__name__,
                exc,
            )
            time.sleep(delay)
    logging.getLogger(__name__).error("Não foi possível validar query no DB após %d tentativas", retries)
    return False


def _normalize_host_header(host_header: str | None) -> str:
    host = str(host_header or "").strip().lower()
    if not host:
        return ""
    if host.startswith("[") and "]" in host:
        return host[1:host.index("]")]
    return host.split(":", 1)[0]


def _extract_host_candidates(headers) -> list[str]:
    candidates = []
    for header_name in ("x-forwarded-host", "x-original-host", "host"):
        raw_value = headers.get(header_name)
        if not raw_value:
            continue
        for item in str(raw_value).split(","):
            normalized = _normalize_host_header(item)
            if normalized and normalized not in candidates:
                candidates.append(normalized)
    return candidates


def _is_allowed_host(headers) -> bool:
    candidates = _extract_host_candidates(headers)
    if not candidates:
        return False

    allowed_hosts = (settings.allowed_hosts or []) + DEFAULT_ALLOWED_HOSTS
    for allowed in allowed_hosts:
        normalized_allowed = _normalize_host_header(allowed)
        if not normalized_allowed:
            continue
        for candidate in candidates:
            if normalized_allowed == "*" or candidate == normalized_allowed or fnmatch(candidate, normalized_allowed):
                return True
    return False


def _describe_allowed_hosts() -> str:
    allowed_hosts = (settings.allowed_hosts or []) + DEFAULT_ALLOWED_HOSTS
    normalized = []
    for allowed in allowed_hosts:
        item = _normalize_host_header(allowed)
        if item and item not in normalized:
            normalized.append(item)
    return ",".join(normalized)



@app.on_event("startup")
def on_startup():
    # Inicializa logging centralizado
    logging.config.dictConfig(LOGGING_CONFIG)
    root_logger = logging.getLogger(__name__)
    # Tentativa de aguardar o DB antes de aceitar tráfego para reduzir erros em reinícios
    try:
        db_host = settings.db_host
        db_port = settings.db_port
        if not wait_for_db(db_host, db_port, retries=30, delay=2):
            raise RuntimeError(f"DB TCP indisponível em {db_host}:{db_port}")
        if not wait_for_db_query(retries=10, delay=2):
            raise RuntimeError("DB sem conexão autenticada/consulta na inicialização")
    except Exception:
        logging.getLogger(__name__).exception("Erro ao aguardar DB na inicialização")
        raise


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    """Converte ValueError técnicos (ex: bcrypt 72-bytes) em mensagens de cliente amigáveis.
    Evita expor mensagens técnicas da biblioteca `passlib` ao usuário final.
    """
    msg = str(exc or "")
    # Detecta mensagens relacionadas ao limite de 72 bytes/bcrypt
    if "72" in msg or "byte" in msg.lower() or "bcrypt" in msg.lower() or "exced" in msg.lower():
        detail = "Senha inválida: excede o limite de 72 bytes (após UTF-8). Use uma senha menor."
    else:
        # Mensagem genérica para outros ValueErrors
        detail = msg or "Entrada inválida."
    return JSONResponse(status_code=400, content={"detail": detail})

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# --- REGISTRO DE ROTAS (ROUTERS) ---
# Registramos routers separados para manter o código modular.
# Cada `router` define seus endpoints e dependências; aqui apenas
# fazemos a inclusão central para que `uvicorn` exponha todas as rotas.
app.include_router(auth.router)
app.include_router(usuarios.router)
app.include_router(alunos.router)
app.include_router(professores.router)
app.include_router(turmas.router)
app.include_router(cursos.router)
app.include_router(interesses.router)
app.include_router(trilhas.router)
app.include_router(chamadas.router)
app.include_router(avaliacoes.router)
app.include_router(alunos_interesses.router)
app.include_router(aulas.router)
app.include_router(importar_google_sheets.router)
app.include_router(importar_csv.router)



@app.middleware("http")
async def log_requests(request: Request, call_next):
    request_logger = logging.getLogger("app.request")

    if request.url.path not in HEALTHCHECK_BYPASS_PATHS and not _is_allowed_host(request.headers):
        host = request.headers.get("host", "")
        forwarded_host = request.headers.get("x-forwarded-host", "")
        original_host = request.headers.get("x-original-host", "")
        candidates = ",".join(_extract_host_candidates(request.headers))
        allowed = _describe_allowed_hosts()
        request_logger.warning(
            "request rejected: invalid host method=%s path=%s host=%s x_forwarded_host=%s x_original_host=%s candidates=%s allowed_hosts=%s",
            request.method,
            request.url.path,
            host,
            forwarded_host,
            original_host,
            candidates,
            allowed,
            extra={
                "method": request.method,
                "path": request.url.path,
                "host": host,
                "forwarded_host": forwarded_host,
                "original_host": original_host,
                "candidate_hosts": candidates,
                "allowed_hosts": allowed,
                "headers": redact_headers(request.headers),
            },
        )
        return JSONResponse(status_code=400, content={"detail": "Invalid host header"})

    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_REQUEST_BYTES:
                request_logger.warning(
                    "request rejected: payload too large method=%s path=%s content_length=%s max_request_bytes=%s",
                    request.method,
                    request.url.path,
                    content_length,
                    MAX_REQUEST_BYTES,
                    extra={
                        "method": request.method,
                        "path": request.url.path,
                        "content_length": content_length,
                        "max_request_bytes": MAX_REQUEST_BYTES,
                    },
                )
                return JSONResponse(
                    status_code=413,
                    content={"detail": "Payload muito grande."},
                )
        except ValueError:
            request_logger.warning(
                "request rejected: invalid content length method=%s path=%s content_length=%s",
                request.method,
                request.url.path,
                content_length,
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "content_length": content_length,
                    "headers": redact_headers(request.headers),
                },
            )
            return JSONResponse(status_code=400, content={"detail": "Content-Length inválido."})

    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    start = time.time()
    try:
        response = await call_next(request)
    except Exception as exc:
        elapsed = (time.time() - start) * 1000
        redacted = redact_headers(request.headers)
        body_present = has_body(request.headers)
        logging.getLogger("app.request").exception(
            "request error",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "duration_ms": int(elapsed),
                "headers": redacted,
                "body_present": body_present,
            },
        )
        raise

    elapsed = (time.time() - start) * 1000
    logger = logging.getLogger("app.request")
    # minimal, non-sensitive metadata only
    logger.info(
        f"request completed request_id={request_id} method={request.method} path={request.url.path} status_code={response.status_code} duration_ms={int(elapsed)}"
    )
    # expõe o request id para rastreabilidade
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    # Para rotas que não são de arquivos estáticos, evita cache de dados sensíveis.
    # Para arquivos estáticos (fotos), permite cache para evitar o "pisca-pisca" na UI.
    if not (request.url.path.startswith("/static/alunos") or request.url.path.startswith("/static/professores")):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

@app.get("/", tags=["Health"])
def health_check():
    """
    Endpoint simples para verificar se a API está respondendo.
    """
    # Basic liveness info
    info = {
        "status": "online",
        "servico": settings.app_name,
        "documentacao": "/docs"
    }
    # Add a lightweight DB connectivity check
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        info["db"] = "ok"
    except Exception as e:
        info["db"] = f"error: {str(e)[:200]}"
    return info


@app.get("/health", tags=["Health"])
def lightweight_health():
    """Lightweight health endpoint for orchestrators.

    Returns a lightweight liveness response.
    This endpoint is intentionally independent from DB state so orchestrators
    and support tooling always have a standardized `200 OK` liveness probe.
    """
    return {"status": "ok", "kind": "liveness"}


@app.get("/ready", tags=["Health"])
def readiness_health():
    """Readiness probe with DB dependency check.

    Returns HTTP 200 when the service can execute a simple DB query,
    otherwise returns HTTP 503 so orchestrators can stop routing traffic.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "kind": "readiness", "db": "ok"}
    except Exception as exc:
        return JSONResponse(
            status_code=503,
            content={
                "status": "error",
                "kind": "readiness",
                "db": "unavailable",
                "detail": str(exc)[:200],
            },
        )
