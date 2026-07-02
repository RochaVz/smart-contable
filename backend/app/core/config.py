from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    REDIS_URL: str = "redis://localhost:6379/0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = False
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    class Config:
        env_file = ".env"

    @field_validator('SECRET_KEY')
    @classmethod
    def validate_secret_key(cls, v):
        """Validate that SECRET_KEY is long enough"""
        if len(v) < 32:
            raise ValueError(
                'SECRET_KEY must be at least 32 characters long for security'
            )
        return v

    @field_validator('DATABASE_URL')
    @classmethod
    def validate_database_url(cls, v):
        """Validate that DATABASE_URL is provided"""
        if not v:
            raise ValueError('DATABASE_URL is required')
        return v

    @field_validator('DEBUG')
    @classmethod
    def validate_debug_mode(cls, v, info):
        """Ensure DEBUG is False in production"""
        environment = info.data.get('ENVIRONMENT', 'development')
        if environment == 'production' and v:
            raise ValueError(
                'DEBUG must be False in production environment'
            )
        return v


settings = Settings()
