"""Endpoints REST des domaines."""

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm import Session

from sophia.api.deps import DbSession
from sophia.application import domains as use_cases
from sophia.application import project_domains as project_domain_use_cases
from sophia.application.schemas.domain import (
    DomainCounter,
    DomainCreate,
    DomainRead,
    DomainUpdate,
    DomainUsage,
)
from sophia.infrastructure.models import Domain

router = APIRouter(prefix="/domains", tags=["domains"])


def _get_or_404(db: Session, domain_id: uuid.UUID) -> Domain:
    domain = use_cases.get_domain(db, domain_id)
    if domain is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Domaine introuvable")
    return domain


@router.get("", response_model=list[DomainRead], operation_id="listDomains")
def list_domains(db: DbSession) -> list[Domain]:
    return use_cases.list_domains(db)


@router.post(
    "",
    response_model=DomainRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createDomain",
)
def create_domain(payload: DomainCreate, db: DbSession) -> Domain:
    return use_cases.create_domain(db, payload)


@router.get("/{domain_id}", response_model=DomainRead, operation_id="getDomain")
def get_domain(domain_id: uuid.UUID, db: DbSession) -> Domain:
    return _get_or_404(db, domain_id)


@router.patch("/{domain_id}", response_model=DomainRead, operation_id="updateDomain")
def update_domain(domain_id: uuid.UUID, payload: DomainUpdate, db: DbSession) -> Domain:
    return use_cases.update_domain(db, _get_or_404(db, domain_id), payload)


@router.get(
    "/{domain_id}/usage", response_model=DomainUsage, operation_id="getDomainUsage"
)
def get_domain_usage(domain_id: uuid.UUID, db: DbSession) -> DomainUsage:
    """Ce qu'une suppression emporterait, et les projets qu'elle délierait —
    sert à l'annoncer dans l'UI."""
    return project_domain_use_cases.domain_usage(db, _get_or_404(db, domain_id))


@router.get(
    "/{domain_id}/counters",
    response_model=list[DomainCounter],
    operation_id="listDomainCounters",
)
def list_domain_counters(domain_id: uuid.UUID, db: DbSession) -> list[DomainCounter]:
    """Ce qui a été fait dans le domaine, depuis toujours : heures et unités."""
    return use_cases.domain_counters(db, _get_or_404(db, domain_id))


@router.delete(
    "/{domain_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="deleteDomain",
)
def delete_domain(domain_id: uuid.UUID, db: DbSession) -> None:
    project_domain_use_cases.delete_domain(db, _get_or_404(db, domain_id))
