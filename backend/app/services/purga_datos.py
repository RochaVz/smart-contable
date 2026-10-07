"""Purga de datos operativos de empresa o de un mes específico."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import extract
from sqlalchemy.orm import Session

from app.core.logging_config import get_logger
from app.models.ajustes_fiscales import PagoProvisionalAnterior, PerdidaFiscal
from app.models.cfdi_complementos import (
    CfdiClasificacionEspecial,
    CfdiComplementoPago,
    CfdiNomina,
)
from app.models.comision_banco import ComisionBanco
from app.models.conciliacion import EstadoCuentaCarga, MovimientoBanco
from app.models.factura import Factura
from app.models.fiscal import (
    DeclaracionFiscal,
    HistorialFiscal,
    OperacionFiscal,
    PeriodoFiscal,
)
from app.models.mapeo_cuenta import MapeoCuenta
from app.models.poliza import MovimientoPoliza, Poliza
from app.services.file_storage import get_file_storage

logger = get_logger(__name__)


def _borrar_archivos(keys: list[str | None]) -> int:
    storage = get_file_storage()
    if not storage:
        return 0
    borrados = 0
    for key in keys:
        if not key:
            continue
        try:
            storage.delete(key)
            borrados += 1
        except Exception:  # noqa: BLE001
            logger.warning("No se pudo borrar archivo S3 %s", key, exc_info=True)
    return borrados


def _eliminar_polizas(db: Session, poliza_ids: list[int]) -> int:
    if not poliza_ids:
        return 0
    # Desvincular movimientos banco que apunten a estas pólizas
    db.query(MovimientoBanco).filter(MovimientoBanco.poliza_id.in_(poliza_ids)).update(
        {
            MovimientoBanco.poliza_id: None,
            MovimientoBanco.modo_conciliacion: None,
            MovimientoBanco.tipo_asignacion: None,
            MovimientoBanco.conciliado_en: None,
        },
        synchronize_session=False,
    )
    db.query(MovimientoPoliza).filter(MovimientoPoliza.poliza_id.in_(poliza_ids)).delete(
        synchronize_session=False
    )
    return db.query(Poliza).filter(Poliza.id.in_(poliza_ids)).delete(synchronize_session=False)


def _eliminar_facturas(db: Session, factura_ids: list[int]) -> dict:
    if not factura_ids:
        return {"facturas": 0, "polizas": 0, "archivos": 0}

    keys = [
        row[0]
        for row in db.query(Factura.archivo_s3_key)
        .filter(Factura.id.in_(factura_ids), Factura.archivo_s3_key.isnot(None))
        .all()
    ]

    poliza_ids = [
        row[0]
        for row in db.query(Poliza.id).filter(Poliza.factura_id.in_(factura_ids)).all()
    ]
    polizas = _eliminar_polizas(db, poliza_ids)

    db.query(CfdiClasificacionEspecial).filter(
        CfdiClasificacionEspecial.factura_id.in_(factura_ids)
    ).delete(synchronize_session=False)
    db.query(CfdiNomina).filter(CfdiNomina.factura_id.in_(factura_ids)).delete(
        synchronize_session=False
    )
    # Documentos de pago relacionados se limpian con cascade del complemento;
    # desvincular FK de factura si aplica vía SQLAlchemy cascade en modelos.
    from app.models.cfdi_complementos import CfdiPagoDocumento

    db.query(CfdiPagoDocumento).filter(
        CfdiPagoDocumento.factura_id.in_(factura_ids)
    ).update({CfdiPagoDocumento.factura_id: None}, synchronize_session=False)

    db.query(OperacionFiscal).filter(
        OperacionFiscal.factura_id.in_(factura_ids)
    ).update({OperacionFiscal.factura_id: None}, synchronize_session=False)

    facturas = db.query(Factura).filter(Factura.id.in_(factura_ids)).delete(
        synchronize_session=False
    )
    archivos = _borrar_archivos(keys)
    return {"facturas": facturas, "polizas": polizas, "archivos": archivos}


def purgar_datos_operativos_empresa(db: Session, empresa_id: int) -> dict:
    """Elimina todo el historial operativo de la empresa, conservando el registro Empresa."""
    resumen: dict = {
        "empresa_id": empresa_id,
        "facturas": 0,
        "polizas": 0,
        "movimientos_banco": 0,
        "estados_cuenta": 0,
        "periodos_fiscales": 0,
        "operaciones_fiscales": 0,
        "declaraciones": 0,
        "historial_fiscal": 0,
        "pagos_provisionales": 0,
        "perdidas_fiscales": 0,
        "comisiones_banco": 0,
        "mapeos": 0,
        "complementos_pago": 0,
        "nominas": 0,
        "clasificaciones": 0,
        "archivos": 0,
    }

    factura_ids = [
        row[0] for row in db.query(Factura.id).filter(Factura.empresa_id == empresa_id).all()
    ]
    fac = _eliminar_facturas(db, factura_ids)
    resumen["facturas"] = fac["facturas"]
    resumen["polizas"] += fac["polizas"]
    resumen["archivos"] += fac["archivos"]

    # Pólizas sin factura
    poliza_ids = [
        row[0] for row in db.query(Poliza.id).filter(Poliza.empresa_id == empresa_id).all()
    ]
    resumen["polizas"] += _eliminar_polizas(db, poliza_ids)

    carga_keys = [
        row[0]
        for row in db.query(EstadoCuentaCarga.archivo_s3_key)
        .filter(
            EstadoCuentaCarga.empresa_id == empresa_id,
            EstadoCuentaCarga.archivo_s3_key.isnot(None),
        )
        .all()
    ]
    resumen["movimientos_banco"] = (
        db.query(MovimientoBanco)
        .filter(MovimientoBanco.empresa_id == empresa_id)
        .delete(synchronize_session=False)
    )
    resumen["estados_cuenta"] = (
        db.query(EstadoCuentaCarga)
        .filter(EstadoCuentaCarga.empresa_id == empresa_id)
        .delete(synchronize_session=False)
    )
    resumen["archivos"] += _borrar_archivos(carga_keys)

    resumen["operaciones_fiscales"] = (
        db.query(OperacionFiscal)
        .filter(OperacionFiscal.empresa_id == empresa_id)
        .delete(synchronize_session=False)
    )
    resumen["declaraciones"] = (
        db.query(DeclaracionFiscal)
        .filter(DeclaracionFiscal.empresa_id == empresa_id)
        .delete(synchronize_session=False)
    )
    resumen["historial_fiscal"] = (
        db.query(HistorialFiscal)
        .filter(HistorialFiscal.empresa_id == empresa_id)
        .delete(synchronize_session=False)
    )
    resumen["periodos_fiscales"] = (
        db.query(PeriodoFiscal)
        .filter(PeriodoFiscal.empresa_id == empresa_id)
        .delete(synchronize_session=False)
    )
    resumen["pagos_provisionales"] = (
        db.query(PagoProvisionalAnterior)
        .filter(PagoProvisionalAnterior.empresa_id == empresa_id)
        .delete(synchronize_session=False)
    )
    resumen["perdidas_fiscales"] = (
        db.query(PerdidaFiscal)
        .filter(PerdidaFiscal.empresa_id == empresa_id)
        .delete(synchronize_session=False)
    )
    resumen["clasificaciones"] = (
        db.query(CfdiClasificacionEspecial)
        .filter(CfdiClasificacionEspecial.empresa_id == empresa_id)
        .delete(synchronize_session=False)
    )
    resumen["nominas"] = (
        db.query(CfdiNomina)
        .filter(CfdiNomina.empresa_id == empresa_id)
        .delete(synchronize_session=False)
    )
    resumen["complementos_pago"] = (
        db.query(CfdiComplementoPago)
        .filter(CfdiComplementoPago.empresa_id == empresa_id)
        .delete(synchronize_session=False)
    )
    resumen["comisiones_banco"] = (
        db.query(ComisionBanco)
        .filter(ComisionBanco.empresa_id == empresa_id)
        .delete(synchronize_session=False)
    )
    resumen["mapeos"] = (
        db.query(MapeoCuenta)
        .filter(MapeoCuenta.empresa_id == empresa_id)
        .delete(synchronize_session=False)
    )

    logger.info("Datos operativos de empresa purgados", extra=resumen)
    return resumen


def purgar_periodo_empresa(db: Session, empresa_id: int, mes: int, anio: int) -> dict:
    """Elimina facturas, pólizas y movimientos bancarios de un mes para reimportar."""
    if mes < 1 or mes > 12:
        raise ValueError("Mes inválido (use 1-12)")
    if anio < 2000 or anio > 2100:
        raise ValueError("Año inválido")

    resumen = {
        "empresa_id": empresa_id,
        "mes": mes,
        "anio": anio,
        "facturas": 0,
        "polizas": 0,
        "movimientos_banco": 0,
        "estados_cuenta_vacias": 0,
        "archivos": 0,
    }

    factura_ids = [
        row[0]
        for row in db.query(Factura.id)
        .filter(
            Factura.empresa_id == empresa_id,
            extract("year", Factura.fecha_emision) == anio,
            extract("month", Factura.fecha_emision) == mes,
        )
        .all()
    ]
    fac = _eliminar_facturas(db, factura_ids)
    resumen["facturas"] = fac["facturas"]
    resumen["polizas"] += fac["polizas"]
    resumen["archivos"] += fac["archivos"]

    poliza_ids = [
        row[0]
        for row in db.query(Poliza.id)
        .filter(
            Poliza.empresa_id == empresa_id,
            Poliza.mes == mes,
            Poliza.anio == anio,
        )
        .all()
    ]
    # también por fecha si mes/anio no estánaron
    poliza_ids_fecha = [
        row[0]
        for row in db.query(Poliza.id)
        .filter(
            Poliza.empresa_id == empresa_id,
            extract("year", Poliza.fecha) == anio,
            extract("month", Poliza.fecha) == mes,
        )
        .all()
    ]
    poliza_ids = list({*poliza_ids, *poliza_ids_fecha})
    resumen["polizas"] += _eliminar_polizas(db, poliza_ids)

    movimientos = (
        db.query(MovimientoBanco)
        .filter(
            MovimientoBanco.empresa_id == empresa_id,
            extract("year", MovimientoBanco.fecha) == anio,
            extract("month", MovimientoBanco.fecha) == mes,
        )
        .all()
    )
    carga_ids = {m.carga_id for m in movimientos if m.carga_id}
    mov_ids = [m.id for m in movimientos]
    if mov_ids:
        resumen["movimientos_banco"] = (
            db.query(MovimientoBanco)
            .filter(MovimientoBanco.id.in_(mov_ids))
            .delete(synchronize_session=False)
        )

    # Eliminar cargas que quedaron sin movimientos
    for carga_id in carga_ids:
        restantes = (
            db.query(MovimientoBanco)
            .filter(MovimientoBanco.carga_id == carga_id)
            .count()
        )
        if restantes == 0:
            carga = db.query(EstadoCuentaCarga).filter(EstadoCuentaCarga.id == carga_id).first()
            if carga:
                if carga.archivo_s3_key:
                    resumen["archivos"] += _borrar_archivos([carga.archivo_s3_key])
                db.delete(carga)
                resumen["estados_cuenta_vacias"] += 1

    # Periodos fiscales del mes
    db.query(OperacionFiscal).filter(
        OperacionFiscal.empresa_id == empresa_id,
        OperacionFiscal.periodo_id.in_(
            db.query(PeriodoFiscal.id).filter(
                PeriodoFiscal.empresa_id == empresa_id,
                PeriodoFiscal.anio == anio,
                PeriodoFiscal.mes == mes,
            )
        ),
    ).delete(synchronize_session=False)

    logger.info("Periodo de empresa purgado", extra=resumen)
    return resumen


def eliminar_carga_estado_cuenta(db: Session, empresa_id: int, carga_id: int) -> dict:
    carga = (
        db.query(EstadoCuentaCarga)
        .filter(
            EstadoCuentaCarga.id == carga_id,
            EstadoCuentaCarga.empresa_id == empresa_id,
        )
        .first()
    )
    if not carga:
        raise LookupError("Estado de cuenta no encontrado")

    movs = (
        db.query(MovimientoBanco)
        .filter(MovimientoBanco.carga_id == carga.id)
        .count()
    )
    archivo = carga.archivo_s3_key
    nombre = carga.nombre_archivo
    # cascade delete-orphan en relación movimientos
    db.delete(carga)
    db.flush()
    archivos = _borrar_archivos([archivo]) if archivo else 0
    return {
        "carga_id": carga_id,
        "nombre_archivo": nombre,
        "movimientos_eliminados": movs,
        "archivos_eliminados": archivos,
    }
