"""Routes des ressources d'un savoir (design #81) et de leurs notes (#173)."""

import uuid

from fastapi import APIRouter, HTTPException, status

from sophia.api.deps import DbSession, LinkReaderDep
from sophia.application import resources as use_cases
from sophia.application.schemas.resource import (
    LinkTitle,
    ResourceCreate,
    ResourceNotesRead,
    ResourceNotesWrite,
    ResourceRead,
    ResourceUpdate,
)
from sophia.infrastructure.models import Resource

router = APIRouter(tags=["resources"])


@router.get("/link-title", response_model=LinkTitle, operation_id="getLinkTitle")
def get_link_title(url: str) -> LinkTitle:
    """Le titre et l'auteur de la page d'un lien collé dans une nouvelle
    ressource."""
    info = use_cases.link_title(url)
    return LinkTitle(title=info.title, author=info.author)


def _get_resource_or_404(db: DbSession, resource_id: uuid.UUID) -> Resource:
    resource = use_cases.get_resource(db, resource_id)
    if resource is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ressource introuvable")
    return resource


@router.get(
    "/skills/{skill_id}/resources",
    response_model=list[ResourceRead],
    operation_id="listResources",
)
def list_resources(skill_id: uuid.UUID, db: DbSession) -> list[Resource]:
    return use_cases.list_resources(db, skill_id)


@router.post(
    "/skills/{skill_id}/resources",
    response_model=ResourceRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createResource",
)
def create_resource(
    skill_id: uuid.UUID, payload: ResourceCreate, db: DbSession, reader: LinkReaderDep
) -> Resource:
    return use_cases.create_resource(db, skill_id, payload, reader)


@router.patch(
    "/resources/{resource_id}",
    response_model=ResourceRead,
    operation_id="updateResource",
)
def update_resource(
    resource_id: uuid.UUID,
    payload: ResourceUpdate,
    db: DbSession,
    reader: LinkReaderDep,
) -> Resource:
    resource = _get_resource_or_404(db, resource_id)
    return use_cases.update_resource(db, resource, payload, reader)


@router.delete(
    "/resources/{resource_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="deleteResource",
)
def delete_resource(resource_id: uuid.UUID, db: DbSession) -> None:
    use_cases.delete_resource(db, _get_resource_or_404(db, resource_id))


@router.get(
    "/resources/{resource_id}/notes",
    response_model=ResourceNotesRead,
    operation_id="getResourceNotes",
)
def get_resource_notes(resource_id: uuid.UUID, db: DbSession) -> dict:
    return use_cases.read_notes(_get_resource_or_404(db, resource_id))


@router.put(
    "/resources/{resource_id}/notes",
    response_model=ResourceNotesRead,
    operation_id="saveResourceNotes",
)
def save_resource_notes(
    resource_id: uuid.UUID, payload: ResourceNotesWrite, db: DbSession
) -> dict:
    """`PUT` : le document entier ; il remplace l'ancien."""
    return use_cases.save_notes(db, _get_resource_or_404(db, resource_id), payload)
