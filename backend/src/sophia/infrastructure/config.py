from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# `backend/` : ancre le dossier média quel que soit le répertoire de lancement.
BACKEND_DIR = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    # `extra="ignore"` : le `.env` peut porter des variables qui ne sont pas à
    # nous. Les refuser ferait échouer le démarrage sur une clé légitime.
    model_config = SettingsConfigDict(
        env_file=".env", env_prefix="SOPHIA_", extra="ignore"
    )

    database_url: str = "sqlite:///./sophia.db"
    # Les images téléversées des notes : des fichiers, sans table. Créé au
    # besoin. Hors des backups de migration — à sauvegarder à part.
    media_dir: Path = BACKEND_DIR / "media"

    # Le compagnon de l'étude. La clé se lit sous son nom usuel, **sans** le
    # préfixe `SOPHIA_` ; elle n'est jamais copiée dans `os.environ` : on la
    # passe explicitement au client. `SecretStr` : elle ne s'affiche pas.
    anthropic_api_key: SecretStr | None = Field(
        default=None, validation_alias="ANTHROPIC_API_KEY"
    )
    llm_model_dictation: str = "claude-haiku-5-5"
    llm_model_review: str = "claude-opus-5-5"
    # Par où passe le compagnon : `api` (la clé, facturée) ou `subscription`
    # (Claude Code en mode headless, sur l'abonnement de l'utilisateur ; l'API
    # prend le relais sur un échec si la clé est là). Revenir en arrière :
    # remettre `api` et relancer le serveur.
    llm_backend: Literal["api", "subscription"] = "api"
    # Le CLI de Claude Code : un nom cherché dans le PATH, ou un chemin.
    claude_bin: str = "claude"
    # Le délai max d'un appel par l'abonnement, en secondes (la recherche de
    # ressources en a le triple) ; au-delà, l'API prend le relais.
    claude_timeout_s: float = 120.0
    # `none` coupe la transcription même si mlx-whisper est installé.
    transcriber: Literal["mlx", "none"] = "mlx"
    whisper_model: str = "mlx-community/whisper-large-v3-turbo"
    # Le journal des appels au LLM, une ligne JSON par appel. Hors git : il
    # porte le contexte envoyé, donc des notes perso.
    llm_log_path: Path = BACKEND_DIR / "llm_calls.jsonl"


settings = Settings()
