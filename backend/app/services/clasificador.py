from sqlalchemy.orm import Session
from app.models.mapeo_cuenta import MapeoCuenta


def obtener_cuenta_por_clave_sat(db: Session, clave_sat: str) -> dict:
    mapeo = db.query(MapeoCuenta).filter(
        MapeoCuenta.codigo_cuenta.isnot(None),
    ).first()
    if mapeo and mapeo.codigo_cuenta:
        return {"cuenta": mapeo.codigo_cuenta, "nombre": mapeo.nombre_cuenta}

    return {"cuenta": "601.01.01", "nombre": "Gastos Generales"}
