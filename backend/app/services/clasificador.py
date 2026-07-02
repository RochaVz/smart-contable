"""
Clasificación de gastos por clave SAT (ClaveProdServ) del catálogo del SAT.
Primero busca mapeo manual por RFC/empresa, luego clasifica por prefijo de clave SAT,
y como fallback retorna Gastos Generales.
"""

from sqlalchemy.orm import Session
from app.models.mapeo_cuenta import MapeoCuenta

# Catálogo de prefijos de clave SAT → cuenta contable estándar
# Basado en el catálogo de productos y servicios del SAT (ClaveProdServ)
_CATALOGO_SAT: list[tuple[str, str, str]] = [
    # (prefijo_clave_sat, codigo_cuenta, nombre_cuenta)
    # Servicios profesionales y técnicos (80-85)
    ("801", "601.02.01", "Honorarios profesionales"),
    ("802", "601.02.01", "Honorarios profesionales"),
    ("803", "601.02.01", "Honorarios profesionales"),
    ("804", "601.02.01", "Honorarios profesionales"),
    ("805", "601.02.01", "Honorarios profesionales"),
    # Servicios de TI y telecomunicaciones (81-82)
    ("811", "601.03.01", "Servicios de tecnología"),
    ("812", "601.03.01", "Servicios de tecnología"),
    ("821", "601.04.01", "Telecomunicaciones"),
    ("822", "601.04.01", "Telecomunicaciones"),
    # Transportes y fletes (78)
    ("781", "601.05.01", "Fletes y transportes"),
    ("782", "601.05.01", "Fletes y transportes"),
    ("783", "601.05.01", "Fletes y transportes"),
    # Arrendamiento de inmuebles (72)
    ("721", "601.06.01", "Arrendamiento"),
    ("722", "601.06.01", "Arrendamiento"),
    # Combustibles (15)
    ("151", "601.07.01", "Combustibles y lubricantes"),
    ("152", "601.07.01", "Combustibles y lubricantes"),
    # Alimentos y bebidas (50)
    ("501", "601.08.01", "Alimentos y consumibles"),
    ("502", "601.08.01", "Alimentos y consumibles"),
    # Material de oficina y papelería (44)
    ("441", "601.09.01", "Papelería y útiles de oficina"),
    ("442", "601.09.01", "Papelería y útiles de oficina"),
    # Publicidad y marketing (82)
    ("820", "601.10.01", "Publicidad y mercadotecnia"),
    # Seguros y fianzas (84)
    ("841", "601.11.01", "Seguros y fianzas"),
    ("842", "601.11.01", "Seguros y fianzas"),
    # Servicios de limpieza y mantenimiento (76)
    ("761", "601.12.01", "Mantenimiento y limpieza"),
    ("762", "601.12.01", "Mantenimiento y limpieza"),
    # Equipo de cómputo y electrónica (43)
    ("431", "601.13.01", "Equipo de cómputo"),
    ("432", "601.13.01", "Equipo de cómputo"),
    # Servicios médicos (85)
    ("851", "601.14.01", "Gastos médicos"),
    ("852", "601.14.01", "Gastos médicos"),
    # Nómina y servicios de personal (86)
    ("861", "601.15.01", "Servicios de personal"),
    # Energía eléctrica (26)
    ("261", "601.16.01", "Energía eléctrica"),
    # Agua (21)
    ("211", "601.17.01", "Agua y servicios"),
    # Construcción e instalaciones (72)
    ("723", "601.18.01", "Construcción y remodelación"),
]


def _clasificar_por_clave_sat(clave_sat: str) -> dict:
    """Clasifica usando el catálogo de prefijos SAT. Retorna cuenta contable."""
    if not clave_sat or clave_sat == "00000000":
        return {"cuenta": "601.01.01", "nombre": "Gastos Generales"}

    # Busca coincidencia por prefijo de mayor a menor longitud
    for prefijo, codigo, nombre in _CATALOGO_SAT:
        if clave_sat.startswith(prefijo):
            return {"cuenta": codigo, "nombre": nombre}

    return {"cuenta": "601.01.01", "nombre": "Gastos Generales"}


def obtener_cuenta_por_clave_sat(db: Session, clave_sat: str) -> dict:
    """
    Clasifica un gasto por su clave SAT.
    Usa el catálogo interno de prefijos SAT como fuente de verdad.
    """
    return _clasificar_por_clave_sat(clave_sat)
