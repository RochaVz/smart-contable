"""Pruebas unitarias del historial versionado de declaraciones fiscales."""

from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.fiscal import (
    AccionHistorialFiscal,
    EstadoDeclaracionFiscal,
    TipoDeclaracionFiscal,
    TipoEntidadHistorialFiscal,
)
from app.services import historial_declaraciones as svc


class FakeQuery:
    def __init__(self, rows):
        self.rows = list(rows)

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self.rows[0] if self.rows else None

    def order_by(self, *args, **kwargs):
        return self

    def limit(self, n):
        self.rows = self.rows[:n]
        return self

    def all(self):
        return list(self.rows)


class FakeDB:
    def __init__(self, periodo=None, declaraciones=None, historial=None):
        self.periodo = periodo
        self.declaraciones = list(declaraciones or [])
        self.historial = list(historial or [])
        self.added = []
        self.committed = False
        self._id_seq = 100

    def query(self, model):
        name = getattr(model, "__name__", str(model))
        if "PeriodoFiscal" in name:
            return FakeQuery([self.periodo] if self.periodo else [])
        if "DeclaracionFiscal" in name:
            return FakeQuery(self.declaraciones)
        if "HistorialFiscal" in name:
            return FakeQuery(self.historial)
        return FakeQuery([])

    def add(self, obj):
        if getattr(obj, "id", None) is None:
            self._id_seq += 1
            obj.id = self._id_seq
        self.added.append(obj)
        model_name = obj.__class__.__name__
        if "DeclaracionFiscal" in model_name:
            self.declaraciones.append(obj)
        if "HistorialFiscal" in model_name:
            self.historial.append(obj)

    def flush(self):
        return None

    def commit(self):
        self.committed = True

    def refresh(self, obj):
        return obj


class DeclaracionFiscalStub:
    def __init__(self, **kwargs):
        self.id = None
        self.creado_en = None
        self.actualizado_en = None
        self.motivo_modificacion = kwargs.get("motivo_modificacion")
        self.notas = kwargs.get("notas")
        self.fecha_presentacion = kwargs.get("fecha_presentacion")
        self.declaracion_origen_id = kwargs.get("declaracion_origen_id")
        self.version_anterior_id = kwargs.get("version_anterior_id")
        self.__dict__.update(kwargs)


class HistorialFiscalStub:
    def __init__(self, **kwargs):
        self.id = None
        self.creado_en = None
        self.__dict__.update(kwargs)


def _periodo(empresa_id=1, periodo_id=10):
    return SimpleNamespace(
        id=periodo_id,
        empresa_id=empresa_id,
        tipo=SimpleNamespace(value="mensual"),
        anio=2026,
        mes=3,
    )


def _declaracion(**kwargs):
    defaults = dict(
        id=1,
        empresa_id=1,
        periodo_id=10,
        usuario_id=5,
        tipo=TipoDeclaracionFiscal.iva,
        estado=EstadoDeclaracionFiscal.borrador,
        version=1,
        es_vigente=True,
        declaracion_origen_id=1,
        version_anterior_id=None,
        base_gravable=Decimal("1000"),
        isr_causado=Decimal("0"),
        iva_trasladado=Decimal("160"),
        iva_acreditable=Decimal("40"),
        iva_retenido=Decimal("0"),
        monto_a_cargo=Decimal("120"),
        monto_a_favor=Decimal("0"),
        snapshot_calculo='{"iva_a_cargo": 120}',
        motivo_modificacion=None,
        notas=None,
        fecha_presentacion=None,
        creado_en=None,
        actualizado_en=None,
    )
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def test_crear_declaracion_version_1_y_historial(monkeypatch):
    db = FakeDB(periodo=_periodo())
    monkeypatch.setattr(svc, "DeclaracionFiscal", DeclaracionFiscalStub)
    monkeypatch.setattr(svc, "HistorialFiscal", HistorialFiscalStub)
    monkeypatch.setattr(svc, "_declaracion_vigente", lambda *_a, **_k: None)

    declaracion = svc.crear_declaracion(
        db,
        empresa_id=1,
        periodo_id=10,
        tipo=TipoDeclaracionFiscal.iva,
        usuario_id=7,
        estado=EstadoDeclaracionFiscal.calculada,
        base_gravable=Decimal("2000"),
        monto_a_cargo=Decimal("320"),
        snapshot_calculo={"ok": True},
    )

    assert declaracion.version == 1
    assert declaracion.es_vigente is True
    assert declaracion.declaracion_origen_id == declaracion.id
    assert db.committed is True
    assert any(getattr(e, "accion", None) == AccionHistorialFiscal.crear for e in db.historial)


def test_crear_declaracion_duplicada_vigente_falla(monkeypatch):
    vigente = _declaracion(estado=EstadoDeclaracionFiscal.presentada)
    db = FakeDB(periodo=_periodo(), declaraciones=[vigente])
    monkeypatch.setattr(svc, "_declaracion_vigente", lambda *_a, **_k: vigente)

    with pytest.raises(HTTPException) as exc:
        svc.crear_declaracion(
            db,
            empresa_id=1,
            periodo_id=10,
            tipo=TipoDeclaracionFiscal.iva,
            commit=False,
        )
    assert exc.value.status_code == 409


def test_presentar_y_modificar_incrementa_version(monkeypatch):
    actual = _declaracion(estado=EstadoDeclaracionFiscal.calculada, version=1, es_vigente=True)
    db = FakeDB(periodo=_periodo(), declaraciones=[actual])
    monkeypatch.setattr(svc, "DeclaracionFiscal", DeclaracionFiscalStub)
    monkeypatch.setattr(svc, "HistorialFiscal", HistorialFiscalStub)
    monkeypatch.setattr(svc, "_obtener_declaracion_empresa", lambda *_a, **_k: actual)

    presentada = svc.presentar_declaracion(
        db, declaracion_id=1, empresa_id=1, usuario_id=5, commit=False
    )
    assert presentada.estado == EstadoDeclaracionFiscal.presentada
    assert presentada.fecha_presentacion is not None

    nueva = svc.modificar_declaracion(
        db,
        declaracion_id=1,
        empresa_id=1,
        motivo="Correccion de IVA acreditable",
        usuario_id=5,
        iva_acreditable=Decimal("50"),
        monto_a_cargo=Decimal("110"),
        commit=False,
    )

    assert actual.es_vigente is False
    assert actual.estado == EstadoDeclaracionFiscal.modificada
    assert nueva.version == 2
    assert nueva.es_vigente is True
    assert nueva.version_anterior_id == actual.id
    assert nueva.motivo_modificacion.startswith("Correccion")
    assert Decimal(str(nueva.iva_acreditable)) == Decimal("50")
    acciones = [e.accion for e in db.historial]
    assert AccionHistorialFiscal.presentar in acciones
    assert AccionHistorialFiscal.modificar in acciones


def test_modificar_requiere_motivo(monkeypatch):
    actual = _declaracion()
    monkeypatch.setattr(svc, "_obtener_declaracion_empresa", lambda *_a, **_k: actual)
    db = FakeDB(periodo=_periodo())
    with pytest.raises(HTTPException) as exc:
        svc.modificar_declaracion(
            db, declaracion_id=1, empresa_id=1, motivo="  ", commit=False
        )
    assert exc.value.status_code == 422


def test_cancelar_declaracion_deja_no_vigente(monkeypatch):
    actual = _declaracion(estado=EstadoDeclaracionFiscal.presentada)
    db = FakeDB(periodo=_periodo(), declaraciones=[actual])
    monkeypatch.setattr(svc, "HistorialFiscal", HistorialFiscalStub)
    monkeypatch.setattr(svc, "_obtener_declaracion_empresa", lambda *_a, **_k: actual)

    result = svc.cancelar_declaracion(
        db,
        declaracion_id=1,
        empresa_id=1,
        motivo="Duplicada",
        usuario_id=3,
        commit=True,
    )
    assert result.estado == EstadoDeclaracionFiscal.cancelada
    assert result.es_vigente is False
    assert db.committed is True
    assert db.historial[-1].accion == AccionHistorialFiscal.cancelar
    assert db.historial[-1].entidad_tipo == TipoEntidadHistorialFiscal.declaracion


def test_serializar_declaracion_incluye_snapshot():
    item = _declaracion()
    data = svc.serializar_declaracion(item)
    assert data["tipo"] == "iva"
    assert data["snapshot_calculo"]["iva_a_cargo"] == 120
    assert data["monto_a_cargo"] == "120"
