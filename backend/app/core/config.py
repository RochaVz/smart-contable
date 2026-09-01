from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from pydantic import field_validator
from typing import Annotated, List


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    DATABASE_URL: str
    SECRET_KEY: str
    LOCAL_PASSWORD_RESET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    REDIS_URL: str = "redis://localhost:6379/0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = False
    MAX_XML_UPLOAD_BYTES: int = 2 * 1024 * 1024
    MAX_ZIP_UPLOAD_BYTES: int = 25 * 1024 * 1024
    MAX_XML_FILES_PER_ZIP: int = 1000
    MAX_PDF_UPLOAD_BYTES: int = 10 * 1024 * 1024
    DATABASE_POOL_SIZE: int = 5
    DATABASE_MAX_OVERFLOW: int = 0
    DATABASE_POOL_TIMEOUT_SECONDS: int = 30
    S3_ENABLED: bool = False
    S3_BUCKET: str = ""
    AWS_REGION: str = "us-east-2"
    CORS_ORIGINS: Annotated[List[str], NoDecode] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    @field_validator('CORS_ORIGINS', mode='before')
    @classmethod
    def parse_cors_origins(cls, v):
        """Acepta lista Python, JSON array o string con comas."""
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            v = v.strip()
            if v.startswith('['):
                import json
                return json.loads(v)
            return [origin.strip() for origin in v.split(',') if origin.strip()]
        return v

    @field_validator('SECRET_KEY')
    @classmethod
    def validate_secret_key(cls, v):
        if len(v) < 32:
            raise ValueError(
                'SECRET_KEY must be at least 32 characters long for security'
            )
        return v

    @field_validator('DATABASE_URL')
    @classmethod
    def validate_database_url(cls, v):
        if not v:
            raise ValueError('DATABASE_URL is required')
        return v

    @field_validator('DEBUG')
    @classmethod
    def validate_debug_mode(cls, v, info):
        environment = info.data.get('ENVIRONMENT', 'development')
        if environment == 'production' and v:
            raise ValueError(
                'DEBUG must be False in production environment'
            )
        return v


settings = Settings()
