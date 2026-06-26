from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache

from sqlalchemy import inspect, select
from sqlalchemy.exc import IntegrityError, NoInspectionAvailable
from sqlmodel import Session, SQLModel

import backend.shared.models as shared_models


EntityKey = tuple[str, str]


class DeleteBlockedError(Exception):
    pass


@dataclass
class DeletePlan:
    entity: object
    entity_key: EntityKey
    action: str
    direct_dependents: list["DeletePlan"]
    delete_keys: set[EntityKey]
    blocking_keys: set[EntityKey]
    all_keys: set[EntityKey]


@lru_cache(maxsize=1)
def _registered_models() -> tuple[type[SQLModel], ...]:
    models: list[type[SQLModel]] = []
    for candidate in vars(shared_models).values():
        if not isinstance(candidate, type):
            continue
        if candidate is SQLModel:
            continue
        if not issubclass(candidate, SQLModel):
            continue
        if getattr(candidate, "__table__", None) is None:
            continue
        models.append(candidate)
    return tuple(models)


def _get_entity_key(entity: object) -> EntityKey:
    identity = inspect(entity).identity
    if not identity or len(identity) != 1:
        raise ValueError("Unsupported entity identity")
    return (type(entity).__name__, str(identity[0]))


def _unwrap_entity_row(row: object) -> object:
    """Return ORM entity when SQLAlchemy returns Row wrappers."""
    if hasattr(row, "_mapping"):
        mapping = getattr(row, "_mapping")
        if mapping:
            first_value = next(iter(mapping.values()))
            return first_value

    if isinstance(row, tuple) and len(row) == 1:
        return row[0]

    return row


def _active_filter(model: type[SQLModel]):
    if hasattr(model, "DeletedAt"):
        return getattr(model, "DeletedAt").is_(None)
    if hasattr(model, "Ativo"):
        return getattr(model, "Ativo").is_(True)
    return None


def _supports_soft_delete(entity: object) -> bool:
    return hasattr(entity, "DeletedAt") or hasattr(entity, "Ativo")


def _is_inactive(entity: object) -> bool:
    if hasattr(entity, "DeletedAt"):
        return getattr(entity, "DeletedAt") is not None
    if hasattr(entity, "Ativo"):
        return not bool(getattr(entity, "Ativo"))
    return False


def _apply_soft_delete(entity: object) -> None:
    if hasattr(entity, "DeletedAt"):
        entity.DeletedAt = datetime.utcnow()
        return
    if hasattr(entity, "Ativo"):
        entity.Ativo = False
        return
    raise DeleteBlockedError("A entidade não suporta inativação")


def _collect_active_dependents(session: Session, entity: object) -> list[object]:
    target_mapper = inspect(type(entity))
    if len(target_mapper.primary_key) != 1:
        return []

    target_table = target_mapper.local_table.name
    target_pk = inspect(entity).identity[0]
    dependents: list[object] = []
    seen: set[EntityKey] = set()

    for model in _registered_models():
        mapper = inspect(model)
        for column in mapper.columns:
            if not column.foreign_keys:
                continue
            for foreign_key in column.foreign_keys:
                if foreign_key.column.table.name != target_table:
                    continue
                statement = select(model).where(getattr(model, column.key) == target_pk)
                active_filter = _active_filter(model)
                if active_filter is not None:
                    statement = statement.where(active_filter)
                for row in session.exec(statement).all():
                    entity_row = _unwrap_entity_row(row)
                    row_key = _get_entity_key(entity_row)
                    if row_key in seen:
                        continue
                    seen.add(row_key)
                    dependents.append(entity_row)
    return dependents


def _build_delete_plan(
    session: Session,
    entity: object,
    memo: dict[EntityKey, DeletePlan] | None = None,
    stack: set[EntityKey] | None = None,
) -> DeletePlan:
    memo = memo or {}
    stack = stack or set()

    entity_key = _get_entity_key(entity)
    if entity_key in memo:
        return memo[entity_key]
    if entity_key in stack:
        plan = DeletePlan(
            entity=entity,
            entity_key=entity_key,
            action="blocked",
            direct_dependents=[],
            delete_keys=set(),
            blocking_keys={entity_key},
            all_keys={entity_key},
        )
        memo[entity_key] = plan
        return plan

    next_stack = set(stack)
    next_stack.add(entity_key)

    dependents = [
        _build_delete_plan(session, child, memo=memo, stack=next_stack)
        for child in _collect_active_dependents(session, entity)
    ]

    all_keys = {entity_key}
    for child_plan in dependents:
        all_keys |= child_plan.all_keys

    if not dependents or all(child_plan.action == "delete" for child_plan in dependents):
        plan = DeletePlan(
            entity=entity,
            entity_key=entity_key,
            action="delete",
            direct_dependents=dependents,
            delete_keys={entity_key} | set().union(*(child_plan.delete_keys for child_plan in dependents)),
            blocking_keys=set(),
            all_keys=all_keys,
        )
        memo[entity_key] = plan
        return plan

    blocking_keys: set[EntityKey] = set()
    for child_plan in dependents:
        if child_plan.action == "delete":
            continue
        blocking_keys.add(child_plan.entity_key)
        blocking_keys |= child_plan.blocking_keys

    action = "deactivate" if _supports_soft_delete(entity) else "blocked"
    plan = DeletePlan(
        entity=entity,
        entity_key=entity_key,
        action=action,
        direct_dependents=dependents,
        delete_keys=set(),
        blocking_keys=blocking_keys,
        all_keys=all_keys,
    )
    memo[entity_key] = plan
    return plan


def _apply_delete_plan(session: Session, plan: DeletePlan, processed: set[EntityKey] | None = None) -> None:
    processed = processed or set()
    if plan.entity_key in processed:
        return
    processed.add(plan.entity_key)

    if plan.action == "delete":
        for child_plan in plan.direct_dependents:
            _apply_delete_plan(session, child_plan, processed=processed)
        session.delete(plan.entity)
        return

    if plan.action == "deactivate":
        _apply_soft_delete(plan.entity)
        session.add(plan.entity)
        return

    raise DeleteBlockedError("Existem dependências que impedem a remoção definitiva")


def get_delete_capability(session: Session, entity: object) -> dict[str, object]:
    plan = _build_delete_plan(session, entity)
    cascade_count = len(plan.delete_keys - {plan.entity_key})
    blocker_count = len(plan.blocking_keys)

    if plan.action == "delete":
        confirmation_message = (
            f"Apagar este registro e {cascade_count} dependência(s) relacionada(s)?"
            if cascade_count
            else "Apagar este registro definitivamente?"
        )
    elif plan.action == "deactivate":
        confirmation_message = (
            f"Este registro possui {blocker_count} dependência(s) ativa(s) e será apenas inativado."
            if blocker_count
            else "Este registro será inativado."
        )
    else:
        confirmation_message = "Este registro não pode ser removido porque existem dependências obrigatórias."

    return {
        "action": plan.action,
        "can_delete": plan.action == "delete",
        "can_deactivate": plan.action == "deactivate",
        "cascade_count": cascade_count,
        "blocker_count": blocker_count,
        "is_inactive": _is_inactive(entity),
        "confirmation_message": confirmation_message,
    }


def delete_or_soft_delete(session: Session, entity: object) -> str:
    try:
        plan = _build_delete_plan(session, entity)
    except NoInspectionAvailable:
        try:
            session.delete(entity)
            session.commit()
            return "hard_deleted"
        except IntegrityError as exc:
            session.rollback()
            raise DeleteBlockedError("Existem dependências que impedem a remoção definitiva") from exc
        except Exception:
            session.rollback()
            raise

    if plan.action == "deactivate" and _is_inactive(entity):
        return "already_inactive"

    if plan.action == "blocked":
        raise DeleteBlockedError("Existem dependências que impedem a remoção definitiva")

    try:
        _apply_delete_plan(session, plan)
        session.commit()
        return "hard_deleted" if plan.action == "delete" else "soft_deleted"
    except IntegrityError as exc:
        session.rollback()
        raise DeleteBlockedError("Existem dependências que impedem a remoção definitiva") from exc
    except Exception:
        session.rollback()
        raise
