from app.services.clasificador import obtener_cuenta_por_concepto
import pytest


def test_clasifica_arrendamiento_por_concepto():
    resultado = obtener_cuenta_por_concepto("Renta de oficina agosto 2026")

    assert resultado is not None
    assert resultado["cuenta"] == "601.06.01"
    assert resultado["nombre"] == "Arrendamiento"


def test_clasifica_combustible_por_concepto():
    resultado = obtener_cuenta_por_concepto("Consumo gasolina flotilla")

    assert resultado is not None
    assert resultado["cuenta"] == "601.07.01"
    assert resultado["nombre"] == "Combustibles y lubricantes"


@pytest.mark.parametrize("concepto", [
    "Pago de nóminas agosto 2026",
    "Pago de nomina quincenal",
    "Transferencia de salarios y prestaciones",
])
def test_clasifica_nominas_por_concepto(concepto):
    resultado = obtener_cuenta_por_concepto(concepto)

    assert resultado == {"cuenta": "601.15.01", "nombre": "Nóminas"}


def test_concepto_desconocido_regresa_none():
    resultado = obtener_cuenta_por_concepto("Servicio no catalogado de prueba")

    assert resultado is None
