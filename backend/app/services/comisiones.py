"""Cálculo de comisiones bancarias según configuración por empresa."""

from sqlalchemy.orm import Session
from app.models.comision_banco import ComisionBanco
from app.services.cfdi_helpers import FORMAS_PAGO_TARJETA, COMISION_TARJETA_PCT

FORMA_A_CAMPO = {
    "04": "porcentaje_credito",
    "28": "porcentaje_debito",
    "29": "porcentaje_servicios",
}


def _resolver_banco(
    db: Session,
    empresa_id: int,
    banco_id: int | None = None,
) -> ComisionBanco | None:
    if banco_id:
        return (
            db.query(ComisionBanco)
            .filter(ComisionBanco.id == banco_id, ComisionBanco.empresa_id == empresa_id)
            .first()
        )
    return (
        db.query(ComisionBanco)
        .filter(ComisionBanco.empresa_id == empresa_id, ComisionBanco.es_default.is_(True))
        .first()
    )


def _porcentaje_para_forma(banco: ComisionBanco | None, forma_pago: str) -> float:
    if not banco:
        return COMISION_TARJETA_PCT * 100
    campo = FORMA_A_CAMPO.get(forma_pago, "porcentaje_credito")
    return float(getattr(banco, campo, banco.porcentaje_credito) or 0)


def calcular_comision_bancaria(
    db: Session,
    empresa_id: int,
    forma_pago: str | None,
    total: float,
    banco_id: int | None = None,
) -> dict:
    """
    Retorna comisión, banco usado y porcentaje aplicado.
    Porcentajes en configuración están en puntos (3.5 = 3.5%).
    """
    forma = forma_pago or ""
    if forma not in FORMAS_PAGO_TARJETA:
        return {
            "comision": 0.0,
            "deposito_neto": round(total, 2),
            "banco_id": None,
            "nombre_banco": None,
            "porcentaje": 0.0,
            "comision_fija": 0.0,
        }

    banco = _resolver_banco(db, empresa_id, banco_id)
    pct_puntos = _porcentaje_para_forma(banco, forma)
    pct_decimal = pct_puntos / 100.0
    fija = float(banco.comision_fija or 0) if banco else 0.0
    comision = round(total * pct_decimal + fija, 2)
    deposito = round(total - comision, 2)

    return {
        "comision": comision,
        "deposito_neto": deposito,
        "banco_id": banco.id if banco else None,
        "nombre_banco": banco.nombre_banco if banco else "Tarifa general",
        "porcentaje": pct_puntos,
        "comision_fija": fija,
    }


def obtener_banco_default_id(db: Session, empresa_id: int) -> int | None:
    from app.models.comision_banco import ComisionBanco

    banco = (
        db.query(ComisionBanco)
        .filter(
            ComisionBanco.empresa_id == empresa_id,
            ComisionBanco.es_default.is_(True),
        )
        .first()
    )
    return banco.id if banco else None


def asegurar_banco_default(db: Session, empresa_id: int) -> None:
    """Si no hay banco default, marca el primero."""
    tiene_default = (
        db.query(ComisionBanco)
        .filter(ComisionBanco.empresa_id == empresa_id, ComisionBanco.es_default.is_(True))
        .first()
    )
    if tiene_default:
        return
    primero = (
        db.query(ComisionBanco)
        .filter(ComisionBanco.empresa_id == empresa_id)
        .order_by(ComisionBanco.id)
        .first()
    )
    if primero:
        primero.es_default = True
