from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # === DATABASE ===
    DATABASE_URL: str = "sqlite:///./smart_contable.db"
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 40

    # === SECURITY ===
    SECRET_KEY: str = "dev-secret-key-change-me-to-a-long-random-value"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # === ENVIRONMENT ===
    ENVIRONMENT: str = "development"
    DEBUG: bool = False

    # === REDIS ===
    REDIS_URL: str = "redis://localhost:6379/0"

    # === LOGGING ===
    LOG_LEVEL: str = "INFO"

    # === CORS ===
    ALLOWED_ORIGINS: List[str] = ["http://localhost:5173"]

    @field_validator("DEBUG", mode="before")
    @classmethod
    def normalize_debug(cls, value):
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "yes", "on"}:
                return True
            if normalized in {"0", "false", "no", "off"}:
                return False
        return value

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, value: str) -> str:
        if len(value) < 32:
            raise ValueError(
                "SECRET_KEY debe tener al menos 32 caracteres. "
                "Generar con: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
            )
        return value


settings = Settings()
