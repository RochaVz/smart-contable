from app.core.dependencies import get_current_user
from app.core.permissions import require_roles
from app.models.usuario import Usuario
from app.models.empresa import Empresa
import zipfile
import io
import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.sat_parser import parsear_xml_sat
from app.models.factura import Factura
from app.services.polizas import (
    auto_generar_poliza_factura,
    generar_poliza_desde_factura,
    preview_poliza_desde_factura,
)
from app.services.comisiones import obtener_banco_default_id
from app.services.cfdi_helpers import (
    es_venta,
    etiqueta_forma_pago,
    desglose_impuestos,
    extraer_datos_xml,
    validar_cfdi_empresa,
    validar_factura_no_duplicada,
    marcar_uuid_en_lote,
)
from app.models.poliza import Poliza, MovimientoPoliza 
from typing import List, Optional
from app.schemas.factura import FacturaResponse

router = APIRouter()

# --- FUNCIÓN COMPARTIDA PARA GUARDAR XML ---
def procesar_xml_interno(
    empresa_id: int,
    xml_str: str,
    db: Session,
    empresa_rfc: str,
    empresa_razon_social: str | None = None,
    uuids_en_lote: set[str] | None = None,
):
    uuid_norm = None
    try:
        datos = parsear_xml_sat(xml_str)

        validar_cfdi_empresa(datos, empresa_rfc, empresa_razon_social)

        uuid_norm = validar_factura_no_duplicada(
            db,
            empresa_id,
            datos.get("uuid"),
            uuids_en_lote=uuids_en_lote,
        )

        # Crear factura
        factura = Factura(
            empresa_id=empresa_id,
            uuid=uuid_norm,
            serie=datos['serie'],
            folio=datos['folio'],
            version_cfdi=datos['version_cfdi'],
            tipo_comprobante=(
                datos['tipo_comprobante'].value
                if hasattr(datos['tipo_comprobante'], 'value')
                else datos['tipo_comprobante']
            ),
            fecha_emision=datos['fecha_emision'],
            fecha_timbrado=datos['fecha_timbrado'],
            rfc_emisor=datos['rfc_emisor'],
            nombre_emisor=datos['nombre_emisor'],
            rfc_receptor=datos['rfc_receptor'],
            nombre_receptor=datos['nombre_receptor'],
            uso_cfdi=datos['uso_cfdi'],
            metodo_pago=datos.get('metodo_pago'),
            forma_pago=datos.get('forma_pago'),
            subtotal=datos['subtotal'],
            descuento=datos['descuento'],
            iva_trasladado=datos['iva_trasladado'],
            iva_retenido=datos['iva_retenido'],
            isr_retenido=datos['isr_retenido'],
            impuestos_locales=datos['impuestos_locales'],
            total=datos['total'],
            moneda=datos['moneda'],
            tipo_cambio=datos['tipo_cambio'],
            es_deducible=True,
            xml_contenido=xml_str
        )

        db.add(factura)

        try:
            db.flush()
        except IntegrityError as exc:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Esta factura ya está registrada (UUID: {uuid_norm})."
                    if uuid_norm
                    else "Esta factura ya está registrada."
                ),
            ) from exc

        marcar_uuid_en_lote(uuids_en_lote, uuid_norm)

        return factura

    except HTTPException:
        raise

    except ValueError as e:
        msg = str(e)
        status = 409 if "ya está registrada" in msg or "repetida en este archivo" in msg else 400
        raise HTTPException(status_code=status, detail=msg) from e

    except IntegrityError as exc:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Esta factura ya está registrada (UUID: {uuid_norm})."
                if uuid_norm
                else "Esta factura ya está registrada."
            ),
        ) from exc

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        ) from e


def _empresa_del_usuario(db: Session, empresa_id: int, user: Usuario) -> Empresa:
    empresa = db.query(Empresa).filter(
        Empresa.id == empresa_id,
        Empresa.usuario_id == user.id,
    ).first()
    if not empresa:
        raise HTTPException(status_code=403, detail="No tienes acceso a esta empresa")
    return empresa


def _factura_del_usuario(db: Session, factura_id: int, user: Usuario) -> Factura:
    factura = db.query(Factura).filter(
        Factura.id == factura_id,
        Factura.empresa.has(usuario_id=user.id),
    ).first()
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return factura


def _eliminar_factura_y_polizas(db: Session, factura: Factura) -> int:
    polizas_eliminadas = 0
    for poliza in list(factura.polizas):
        db.query(MovimientoPoliza).filter(
            MovimientoPoliza.poliza_id == poliza.id
        ).delete(synchronize_session=False)
        db.delete(poliza)
        polizas_eliminadas += 1
    db.delete(factura)
    return polizas_eliminadas

# --- RUTAS ---
@router.post("/subir-xml", status_code=201)
async def subir_xml(
    empresa_id: int,
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(
        require_roles(
            "admin",
            "contador",
            "auxiliar"
        )
    )
):
    if not archivo.filename.endswith('.xml'):
        raise HTTPException(
            status_code=400,
            detail="Solo se aceptan archivos XML"
        )
    empresa = _empresa_del_usuario(db, empresa_id, current_user)
    contenido = await archivo.read()

    try:
        xml_str = contenido.decode('utf-8')
    except UnicodeDecodeError:
        xml_str = contenido.decode('latin-1')

    try:
        factura = procesar_xml_interno(
            empresa_id,
            xml_str,
            db,
            empresa_rfc=empresa.rfc,
            empresa_razon_social=empresa.razon_social,
        )

        banco_id = obtener_banco_default_id(db, empresa_id)
        polizas_creadas = auto_generar_poliza_factura(factura, db, banco_id)

        db.commit()

        tipo_op = "VENTA" if es_venta(factura, empresa.rfc) else "GASTO"

        return {
            "mensaje": "Factura registrada correctamente",
            "uuid": factura.uuid,
            "factura_id": factura.id,
            "tipo_operacion": tipo_op,
            "polizas_generadas": len(polizas_creadas),
            "poliza_ids": [p.id for p in polizas_creadas],
        }

    except HTTPException:
        db.rollback()
        raise

    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Esta factura ya está registrada en la empresa.",
        ) from exc

    except Exception as e:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=str(e)
        ) from e


@router.post("/subir-zip")
async def subir_zip(
    empresa_id: int,
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if not archivo.filename.lower().endswith('.zip'):
        raise HTTPException(status_code=400, detail="El archivo debe ser un .zip")

    empresa = _empresa_del_usuario(db, empresa_id, current_user)

    await archivo.seek(0)
    contenido = await archivo.read()
    resultados: list[dict] = []
    exitos = 0
    duplicados = 0
    uuids_en_lote: set[str] = set()

    try:
        with zipfile.ZipFile(io.BytesIO(contenido)) as z:
            lista_de_nombres = z.namelist()

            for ruta_completa in lista_de_nombres:
                nombre_archivo = os.path.basename(ruta_completa)

                es_xml = nombre_archivo.lower().endswith('.xml')
                es_basura = nombre_archivo.startswith('.') or "__MACOSX" in ruta_completa
                es_carpeta = ruta_completa.endswith('/')

                if es_xml and not es_basura and not es_carpeta:
                    try:
                        with z.open(ruta_completa) as f:
                            xml_bytes = f.read()
                            try:
                                xml_str = xml_bytes.decode('utf-8')
                            except UnicodeDecodeError:
                                xml_str = xml_bytes.decode('latin-1')

                        # Each file runs in its own savepoint so that a failed
                        # db.flush() (IntegrityError) only rolls back that file's
                        # changes without corrupting the outer transaction.
                        with db.begin_nested():
                            factura = procesar_xml_interno(
                                empresa_id,
                                xml_str,
                                db,
                                empresa_rfc=empresa.rfc,
                                empresa_razon_social=empresa.razon_social,
                                uuids_en_lote=uuids_en_lote,
                            )
                        fecha_f = factura.fecha_emision
                        resultados.append({
                            "archivo": nombre_archivo,
                            "status": "ok",
                            "uuid": factura.uuid,
                            "periodo": (
                                f"{fecha_f.year}-{fecha_f.month:02d}"
                                if fecha_f else None
                            ),
                            "tipo_comprobante": factura.tipo_comprobante,
                            "total": float(factura.total or 0),
                        })
                        exitos += 1
                    except HTTPException as e:
                        detalle = e.detail if isinstance(e.detail, str) else str(e.detail)
                        es_dup = e.status_code == 409 or "registrada" in str(detalle).lower()
                        if es_dup:
                            duplicados += 1
                        resultados.append({
                            "archivo": nombre_archivo,
                            "status": "duplicado" if es_dup else "error",
                            "detalle": detalle,
                        })
                    except Exception as e:
                        resultados.append({
                            "archivo": nombre_archivo,
                            "status": "error",
                            "detalle": str(e),
                        })

        if exitos > 0:
            try:
                db.commit()
            except Exception as commit_err:
                db.rollback()
                raise HTTPException(
                    status_code=500,
                    detail=f"Error al confirmar las facturas en la base de datos: {commit_err}",
                ) from commit_err

            from app.services.polizas import generar_polizas_automaticas  # noqa: PLC0415

            banco_id = obtener_banco_default_id(db, empresa_id)
            resultado_polizas: dict = {}
            try:
                resultado_polizas = generar_polizas_automaticas(db, empresa_id, banco_id=banco_id)
                db.commit()
            except Exception:
                db.rollback()

            # ── Desglose por período ─────────────────────────────────────────
            from collections import defaultdict  # noqa: PLC0415

            por_periodo: dict[str, dict] = defaultdict(
                lambda: {"periodo": "", "facturas_ok": 0, "total_importe": 0.0}
            )
            for r in resultados:
                if r.get("status") == "ok" and r.get("periodo"):
                    p = r["periodo"]
                    por_periodo[p]["periodo"] = p
                    por_periodo[p]["facturas_ok"] += 1
                    por_periodo[p]["total_importe"] = round(
                        por_periodo[p]["total_importe"] + r.get("total", 0.0), 2
                    )

            # Añadir pólizas generadas al desglose
            for item_mes in resultado_polizas.get("por_mes", []):
                clave = f"{item_mes['anio']}-{item_mes['mes']:02d}"
                if clave in por_periodo:
                    por_periodo[clave]["polizas_generadas"] = item_mes.get("polizas_generadas", 0)

            return {
                "mensaje": "Procesamiento masivo completado y guardado en BD",
                "exitos": exitos,
                "duplicados": duplicados,
                "errores": len([r for r in resultados if r.get("status") == "error"]),
                "polizas_generadas": resultado_polizas.get("total_polizas", 0),
                "errores_polizas": resultado_polizas.get("errores", []),
                "por_periodo": dict(sorted(por_periodo.items())),
                "detalles": resultados,
            }

    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail="Archivo ZIP inválido o corrupto") from exc
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "mensaje": "No se guardó nada nuevo. Revisa si son duplicados o archivos vacíos.",
        "exitos": 0,
        "duplicados": duplicados,
        "errores": len(resultados) - duplicados,
        "detalles": resultados,
    }

@router.get("/", status_code=200)
def listar_facturas(
    empresa_id: int, 
    db: Session = Depends(get_db), 
    current_user: Usuario = Depends(get_current_user)
):
    try:
        # 1. Obtenemos el RFC de nuestra empresa y lo limpiamos
        mi_empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
        mi_rfc = mi_empresa.rfc.strip().upper() if mi_empresa else ""

        # 2. Consultamos las facturas asegurando la tenencia
        facturas = db.query(Factura).filter(
            Factura.empresa_id == empresa_id, 
            Factura.empresa.has(usuario_id=current_user.id)
        ).all()

        respuesta =[]
        for f in facturas:
            # 3. Lógica robusta: ¿Venta o Gasto?
            # Comparamos siempre en mayúsculas y sin espacios
            rfc_emisor_f = (f.rfc_emisor or "").strip().upper()
            es_venta = (rfc_emisor_f == mi_rfc)
            
            tipo_operacion = "VENTA" if es_venta else "GASTO"
            entidad_nombre = f.nombre_receptor if es_venta else f.nombre_emisor
            entidad_rfc = f.rfc_receptor if es_venta else f.rfc_emisor
            
            # 4. Determinamos la cuenta contable
            cuenta_nombre = "VENTAS GENERALES" if es_venta else "GASTOS POR CLASIFICAR"
            
            if hasattr(f, 'polizas') and f.polizas and len(f.polizas) > 0:
                poliza_padre = f.polizas[0]
                
                # Buscamos el movimiento que define el gasto o ingreso
                if es_venta:
                    mov = db.query(MovimientoPoliza).filter(
                        MovimientoPoliza.poliza_id == poliza_padre.id,
                        MovimientoPoliza.haber > 0,
                        MovimientoPoliza.nombre_cuenta.not_in(["IVA Trasladado", "IVA Pendiente de Trasladar"])
                    ).first()
                else:
                    mov = db.query(MovimientoPoliza).filter(
                        MovimientoPoliza.poliza_id == poliza_padre.id,
                        MovimientoPoliza.debe > 0,
                        MovimientoPoliza.nombre_cuenta.not_in(["IVA Acreditable", "IVA Pendiente de Acreditar"])
                    ).first()
                
                if mov:
                    cuenta_nombre = mov.nombre_cuenta

            tiene_poliza = bool(f.polizas)
            respuesta.append({
                "id": f.id,
                "uuid": f.uuid,
                "fecha": str(f.fecha_emision),
                "tipo_operacion": tipo_operacion,
                "emisor": entidad_nombre if es_venta else f.nombre_emisor,
                "rfc_emisor": entidad_rfc if not es_venta else f.rfc_emisor,
                "nombre_cliente": f.nombre_receptor if es_venta else None,
                "forma_pago": f.forma_pago,
                "forma_pago_label": etiqueta_forma_pago(f.forma_pago),
                "metodo_pago": f.metodo_pago,
                "subtotal": float(f.subtotal),
                "iva": float(f.iva_trasladado),
                "iva_retenido": float(f.iva_retenido),
                "isr_retenido": float(f.isr_retenido),
                "total": float(f.total),
                "cuenta_contable": cuenta_nombre,
                "tiene_poliza": tiene_poliza,
            })
            
        return respuesta

    except Exception as e:
        print(f"--- ERROR CRÍTICO EN API FACTURAS: {str(e)} ---")
        raise HTTPException(status_code=500, detail="Error interno al procesar el listado") from e
@router.delete("/{factura_id}", status_code=200)
def eliminar_factura(
    factura_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(
        require_roles("admin", "contador", "auxiliar")
    ),
):
    factura = _factura_del_usuario(db, factura_id, current_user)
    uuid = factura.uuid
    polizas_eliminadas = _eliminar_factura_y_polizas(db, factura)
    db.commit()
    return {
        "mensaje": "Factura eliminada correctamente",
        "uuid": uuid,
        "polizas_eliminadas": polizas_eliminadas,
    }


@router.get("/{factura_id}/detalle", status_code=200)
def detalle_factura(
    factura_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    factura = db.query(Factura).filter(
        Factura.id == factura_id,
        Factura.empresa.has(usuario_id=current_user.id),
    ).first()
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    empresa = db.query(Empresa).filter(Empresa.id == factura.empresa_id).first()
    rfc = empresa.rfc if empresa else ""
    datos_xml = extraer_datos_xml(factura.xml_contenido)
    venta = es_venta(factura, rfc)

    return {
        "id": factura.id,
        "uuid": factura.uuid,
        "fecha": str(factura.fecha_emision),
        "tipo_operacion": "VENTA" if venta else "GASTO",
        "emisor": factura.nombre_emisor,
        "receptor": factura.nombre_receptor,
        "forma_pago": {
            "codigo": factura.forma_pago,
            "etiqueta": etiqueta_forma_pago(factura.forma_pago),
            "metodo_pago": factura.metodo_pago,
        },
        "conceptos": datos_xml.get("conceptos", []),
        "desglose_impuestos": desglose_impuestos(factura),
        "preview_poliza": preview_poliza_desde_factura(factura, rfc, db),
        "tiene_poliza": bool(factura.polizas),
        "subtotal": float(factura.subtotal or 0),
        "total": float(factura.total or 0),
    }


@router.post("/{factura_id}/generar-poliza", status_code=201)
def generar_poliza(
    factura_id: int,
    banco_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(
        require_roles(
            "admin",
            "contador"
        )
    )
):

    # VALIDAR QUE LA FACTURA EXISTA
    factura = db.query(Factura).filter(
        Factura.id == factura_id,
        Factura.empresa.has(
            usuario_id=current_user.id
        )
    ).first()

    if not factura:
        raise HTTPException(
            status_code=404,
            detail="Factura no encontrada"
        )

    try:
        creadas = generar_poliza_desde_factura(factura, db, banco_id)
        if not creadas:
            raise HTTPException(
                status_code=409,
                detail="Esta factura ya tiene sus pólizas generadas",
            )
        db.commit()
        return {
            "mensaje": f"{len(creadas)} póliza(s) generada(s)",
            "poliza_ids": [p.id for p in creadas],
            "tipos": [p.tipo.value for p in creadas],
        }

    except Exception as e:

        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=str(e)
        ) from e

@router.get("/{factura_id}/poliza", status_code=200)
def ver_poliza(
    factura_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(
        require_roles(
            "admin",
            "contador",
            "auditor"
        )
    )
):

    poliza = db.query(Poliza).filter(
        Poliza.factura_id == factura_id,
        Poliza.factura.has(
            Factura.empresa.has(
                usuario_id=current_user.id
            )
        )
    ).first()

    if not poliza:
        raise HTTPException(
            status_code=404,
            detail="No hay póliza para esta factura"
        )

    return {
        "poliza_id": poliza.id,
        "total": float(poliza.total),

        "movimientos": [
            {
                "cuenta": m.cuenta,
                "nombre_cuenta": m.nombre_cuenta,
                "debe": float(m.debe),
                "haber": float(m.haber)
            }
            for m in poliza.movimientos
        ]
    }

@router.get("/global") 
def listar_facturas_global(
    db: Session = Depends(get_db), 
    current_user: Usuario = Depends(get_current_user)
):
    # Aquí buscamos facturas donde el usuario sea dueño de la empresa padre
    # usando una subconsulta (JOIN) para mayor eficiencia
    facturas = db.query(Factura).join(Empresa).filter(
        Empresa.usuario_id == current_user.id
    ).all()
    
    return facturas

