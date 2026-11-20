"""La règle de la planification (#37) : un lien pose-t-il tel jour ?

Pure, sans framework : les fonctions lisent des objets par leurs attributs
(projet, étapes, lien). La préparation (`application.planning`) l'applique.
"""

import uuid
from datetime import date
from typing import Any

# Statuts de sortie, en valeurs : le domaine ne connaît pas les enums de la base.
_CLOSED = {"achieved", "failed", "abandoned"}


def is_open(project: Any, day: date) -> bool:
    """Le projet est-il ouvert ce jour-là ? Période qui couvre le jour, et ni
    réussi, ni raté, ni abandonné. On juge **le jour posé**, pas le jour où l'on
    prépare : un projet qui commence lundi reçoit sa première semaine même
    préparée le dimanche."""
    return (
        project.start_at <= day
        and (project.due_at is None or day <= project.due_at)
        and project.effective_status not in _CLOSED
    )


def step_on(project: Any, day: date) -> uuid.UUID | None:
    """L'étape datée qui couvre ce jour, s'il y en a une."""
    for step in project.steps:
        if step.start_at and step.due_at and step.start_at <= day <= step.due_at:
            return step.id
    return None


def falls_on(planning: str, weekdays: list[int], day: date) -> bool:
    """La planification tombe-t-elle ce jour de la semaine ?"""
    if planning == "daily":
        return True
    if planning == "weekly":
        return day.weekday() in weekdays
    return False


def link_poses(link: Any, day: date) -> uuid.UUID | None | bool:
    """Le lien pose-t-il ce jour ? Renvoie l'étape (ou `None`) s'il pose,
    `False` sinon."""
    if not falls_on(link.planning, link.weekdays, day):
        return False
    return link_covers(link, day)


def link_covers(link: Any, day: date) -> uuid.UUID | None | bool:
    """Le lien couvre-t-il ce jour, quelle que soit sa planification ?
    Le projet est ouvert et le jour tombe dans une étape allumée. Renvoie
    l'étape (ou `None`) s'il couvre, `False` sinon.

    C'est ce qui rattache une activité type **déposée à la main** : le jour
    choisi l'emporte sur les jours de la planification."""
    project = link.project
    if not is_open(project, day):
        return False
    step_id = step_on(project, day)
    off = link.off_step_ids
    if step_id is None:
        # Un jour qu'aucune étape ne couvre : un lien réparti sur des étapes
        # (éteint sur au moins une) ne pose que dans ses étapes allumées ;
        # allumé partout, il couvre toute la période.
        return False if off else None
    if step_id in off:
        return False
    return step_id


def hands_over(link: Any, day: date) -> bool:
    """Ce lien « Préserver après le projet » continue-t-il dans le domaine ce
    jour-là ? Un lien Quotidien ou Hebdomadaire préservé, dont le projet a
    commencé et n'est plus ouvert (abandonné, réussi, raté ou échu)."""
    project = link.project
    return (
        link.preserve_after
        and link.planning != "manual"
        and day >= project.start_at
        and not is_open(project, day)
    )


def preserved_link(links: Any, day: date) -> Any | None:
    """Le lien préservé dont la planification continue ce jour-là dans le
    domaine, ou `None`. Le premier l'emporte."""
    return next((link for link in links if hands_over(link, day)), None)


def fallback_rule(activity_type: Any, day: date) -> tuple[str, list[int]] | None:
    """La planification du repli ce jour-là, ou `None`.

    Actif s'il est allumé, ou si un lien « Préserver après le projet » a vu
    son projet se clore ce jour-là — c'est alors la planification de ce lien
    qui continue dans le domaine. Une fois le projet clos, le repli la
    reprend pour de bon (`application.planning._hand_over`) : cette lecture ne
    sert plus qu'aux jours d'après une échéance encore à venir.
    """
    if activity_type.fallback_active:
        return activity_type.fallback_planning, activity_type.fallback_weekdays
    link = preserved_link(activity_type.links, day)
    return (link.planning, link.weekdays) if link is not None else None


def is_daily_case(activity_type: Any, project_ids: set[uuid.UUID], day: date) -> bool:
    """Une case du jour est-elle **quotidienne** ? Oui si la règle qui la pose
    l'est : un de ses liens, parmi les projets qu'elle sert, sinon le repli.
    Seules les quotidiennes vont dans la rangée « quotidien » ; une case
    hebdomadaire ou manuelle se lit avec les activités du jour."""
    if project_ids:
        return any(
            link.planning == "daily"
            for link in activity_type.links
            if link.project_id in project_ids
        )
    rule = fallback_rule(activity_type, day)
    return rule is not None and rule[0] == "daily"
