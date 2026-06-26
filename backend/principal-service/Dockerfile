## Dockerfile dedicado ao principal-service
## Contexto de build esperado: raiz do repositório

FROM public.ecr.aws/docker/library/python:3.11-slim AS builder
WORKDIR /app
COPY backend/requirements.txt /app/requirements.txt
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc build-essential libffi-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/*

RUN python -m pip install --upgrade pip setuptools wheel \
    && python -m pip install --no-cache-dir bcrypt==4.0.1 \
    && python -m pip wheel --wheel-dir=/wheels -r /app/requirements.txt

FROM public.ecr.aws/docker/library/python:3.11-slim
ENV PYTHONPATH=/app

ARG APP_USER=appuser
ARG APP_UID=1000
ARG APP_GID=1000
RUN groupadd -g ${APP_GID} ${APP_USER} || true \
    && useradd -m -u ${APP_UID} -g ${APP_GID} -s /bin/bash ${APP_USER} || true

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /wheels /wheels
COPY backend/requirements.txt /app/requirements.txt
RUN python -m pip install --no-cache-dir --no-index --find-links=/wheels -r /app/requirements.txt \
    && rm -rf /wheels
RUN python -m pip install --no-cache-dir bcrypt==4.0.1 || true

COPY backend /app/backend
COPY backend/alembic /app/alembic
COPY backend/alembic.ini /app/alembic.ini
COPY shared/ /app/shared/
COPY scripts/ ./scripts

RUN mkdir -p /app/logs && chown -R ${APP_USER}:${APP_USER} /app/logs || true

COPY backend/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

ENV PYTHONUNBUFFERED=1
ENV FULLEDUCA_SERVICE_NAME=principal-service
EXPOSE 80

USER root

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["python", "-m", "backend.main"]
