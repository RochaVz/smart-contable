from typing import List, Optional
from pydantic import BaseModel, Field

class FinancialMovement(BaseModel):
    fecha: str = Field(..., description="Fecha en formato YYYY-MM-DD u original del banco")
    descripcion: str
    referencia: Optional[str] = ""
    cargo: float = 0.0
    abono: float = 0.0
    saldo: Optional[float] = 0.0
    categoria: Optional[str] = "GENERAL"
    confianza: float = Field(..., ge=0.0, le=1.0)

class BankStatementModel(BaseModel):
    banco: str
    cuenta: Optional[str] = ""
    titular: Optional[str] = ""
    periodo: Optional[str] = ""
    moneda: str = "MXN"
    movimientos: List[FinancialMovement] = []