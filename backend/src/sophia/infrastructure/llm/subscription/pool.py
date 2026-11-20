"""Les processus Claude Code préchauffés, un prêt par configuration utilisée.

Lancer `claude -p` coûte ~0,9 s avant que le modèle ne soit appelé : on le
paie d'avance. À chaque appel, on prend le processus prêt de sa
configuration (ou on en lance un, la première fois ou s'il est mort), et on
lance aussitôt le suivant, qui se prépare pendant l'appel. Rien n'est
préchauffé au démarrage : une configuration jamais appelée ne coûte rien.

Un processus ne sert **qu'une fois** : il est une conversation, et un second
message s'y ajouterait au premier.

Thread-safe : les routes synchrones tournent dans le threadpool de FastAPI.
Deux appels simultanés d'une même configuration : l'un prend le processus
prêt, l'autre en lance un à froid. `close()` tue les processus prêts — à
l'arrêt de l'app (`atexit`) ; un processus orphelin, lui, voit son entrée se
fermer et s'arrête seul.
"""

import subprocess
import threading
from collections.abc import Callable

from sophia.infrastructure.llm.subscription.cli import CliConfig

Spawn = Callable[[CliConfig], subprocess.Popen]


class WarmPool:
    def __init__(self, spawn: Spawn) -> None:
        self._spawn = spawn
        self._ready: dict[CliConfig, subprocess.Popen] = {}
        self._lock = threading.Lock()
        self._closed = False

    def take(self, config: CliConfig) -> subprocess.Popen:
        """Un processus neuf pour cet appel ; le suivant se prépare."""
        with self._lock:
            proc = self._ready.pop(config, None)
        if proc is None or proc.poll() is not None:
            proc = self._spawn(config)
        self._prepare(config)
        return proc

    def _prepare(self, config: CliConfig) -> None:
        try:
            proc = self._spawn(config)
        except Exception:
            return  # l'appel suivant lancera le sien, et dira pourquoi
        with self._lock:
            if self._closed or config in self._ready:
                extra = proc
            else:
                self._ready[config] = proc
                return
        _stop(extra)

    def ready(self) -> int:
        """Le nombre de processus prêts."""
        with self._lock:
            return len(self._ready)

    def close(self) -> None:
        with self._lock:
            self._closed = True
            procs = list(self._ready.values())
            self._ready.clear()
        for proc in procs:
            _stop(proc)


def _stop(proc: subprocess.Popen) -> None:
    if proc.poll() is None:
        proc.kill()
    try:
        proc.communicate(timeout=5)
    except (subprocess.TimeoutExpired, ValueError, OSError):
        pass
