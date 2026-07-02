"""
Custom exceptions for SmartContable API
"""
from fastapi import HTTPException, status


class SmartContableException(Exception):
    """Base exception for SmartContable"""
    
    def __init__(self, message: str, code: str = None, status_code: int = 500):
        self.message = message
        self.code = code or self.__class__.__name__
        self.status_code = status_code
        super().__init__(self.message)


# ─────────────────────────────────────────
# AUTHENTICATION EXCEPTIONS
# ─────────────────────────────────────────

class InvalidCredentialsException(SmartContableException):
    """Raised when login credentials are invalid"""
    def __init__(self, message: str = "Credenciales inválidas"):
        super().__init__(message, status_code=status.HTTP_401_UNAUTHORIZED)


class TokenExpiredException(SmartContableException):
    """Raised when JWT token is expired"""
    def __init__(self, message: str = "Token expirado"):
        super().__init__(message, status_code=status.HTTP_401_UNAUTHORIZED)


class UnauthorizedException(SmartContableException):
    """Raised when user is not authorized"""
    def __init__(self, message: str = "No autorizado"):
        super().__init__(message, status_code=status.HTTP_403_FORBIDDEN)


class InvalidTokenException(SmartContableException):
    """Raised when token is invalid"""
    def __init__(self, message: str = "Token inválido"):
        super().__init__(message, status_code=status.HTTP_401_UNAUTHORIZED)


# ─────────────────────────────────────────
# VALIDATION EXCEPTIONS
# ─────────────────────────────────────────

class ValidationException(SmartContableException):
    """Raised when input validation fails"""
    def __init__(self, message: str, field: str = None):
        self.field = field
        super().__init__(message, status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)


class DuplicateResourceException(SmartContableException):
    """Raised when trying to create duplicate resource"""
    def __init__(self, resource: str, field: str):
        message = f"Ya existe un {resource} con ese {field}"
        super().__init__(message, status_code=status.HTTP_409_CONFLICT)


class InvalidPasswordException(SmartContableException):
    """Raised when password doesn't meet requirements"""
    def __init__(self, message: str = "La contraseña no cumple los requisitos"):
        super().__init__(message, status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)


# ─────────────────────────────────────────
# RESOURCE EXCEPTIONS
# ─────────────────────────────────────────

class ResourceNotFoundException(SmartContableException):
    """Raised when resource is not found"""
    def __init__(self, resource: str, identifier: str = None):
        if identifier:
            message = f"{resource} no encontrado: {identifier}"
        else:
            message = f"{resource} no encontrado"
        super().__init__(message, status_code=status.HTTP_404_NOT_FOUND)


class ForbiddenResourceException(SmartContableException):
    """Raised when user doesn't have access to resource"""
    def __init__(self, resource: str = "recurso"):
        message = f"No tienes acceso a este {resource}"
        super().__init__(message, status_code=status.HTTP_403_FORBIDDEN)


# ─────────────────────────────────────────
# BUSINESS LOGIC EXCEPTIONS
# ─────────────────────────────────────────

class InvalidCFDIException(SmartContableException):
    """Raised when CFDI is invalid"""
    def __init__(self, message: str = "CFDI inválido"):
        super().__init__(message, status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)


class UnbalancedVoucherException(SmartContableException):
    """Raised when voucher (póliza) doesn't balance"""
    def __init__(self, message: str = "Póliza desbalanceada: Debe ≠ Haber"):
        super().__init__(message, status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)


class InsufficientPermissionsException(SmartContableException):
    """Raised when user lacks required permissions"""
    def __init__(self, required_role: str):
        message = f"Se requiere rol: {required_role}"
        super().__init__(message, status_code=status.HTTP_403_FORBIDDEN)


# ─────────────────────────────────────────
# DATABASE EXCEPTIONS
# ─────────────────────────────────────────

class DatabaseException(SmartContableException):
    """Raised for database errors"""
    def __init__(self, message: str = "Error en base de datos", original_error: Exception = None):
        self.original_error = original_error
        super().__init__(message, status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)


class IntegrityException(SmartContableException):
    """Raised for database integrity errors"""
    def __init__(self, message: str = "Violación de integridad de datos"):
        super().__init__(message, status_code=status.HTTP_409_CONFLICT)


# ─────────────────────────────────────────
# CONVERSION UTILITIES
# ─────────────────────────────────────────

def to_http_exception(exc: SmartContableException) -> HTTPException:
    """Convert SmartContableException to HTTPException"""
    return HTTPException(
        status_code=exc.status_code,
        detail=exc.message
    )
