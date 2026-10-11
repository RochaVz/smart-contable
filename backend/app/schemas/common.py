from pydantic import BaseModel
from typing import Optional, Any, Generic, TypeVar

T = TypeVar('T')


class SuccessResponse(BaseModel, Generic[T]):
    """Respuesta exitosa genérica para todos los endpoints."""

    status: str = "success"
    message: str
    data: Optional[T] = None

    class Config:
        json_schema_extra = {
            "example": {
                "status": "success",
                "message": "Operación completada exitosamente",
                "data": None
            }
        }


class ErrorResponse(BaseModel):
    """Respuesta de error estándar."""

    status: str = "error"
    message: str
    code: str
    details: Optional[dict] = None

    class Config:
        json_schema_extra = {
            "example": {
                "status": "error",
                "message": "Email ya registrado",
                "code": "DUPLICATE_EMAIL",
                "details": None
            }
        }


class PaginatedResponse(BaseModel, Generic[T]):
    """Respuesta paginada para listados."""

    status: str = "success"
    total: int
    skip: int
    limit: int
    items: list[T]

    class Config:
        json_schema_extra = {
            "example": {
                "status": "success",
                "total": 100,
                "skip": 0,
                "limit": 10,
                "items": []
            }
        }
