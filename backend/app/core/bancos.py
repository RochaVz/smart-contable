"""Catálogo de bancos mexicanos para conciliación y comisiones."""

from __future__ import annotations

BANCOS_MEXICO: list[dict[str, str]] = [
    {"clave": "bbva", "nombre": "BBVA Bancomer", "aliases": "bbva,bancomer,bbva mexico"},
    {"clave": "banamex", "nombre": "Banamex", "aliases": "citibanamex,citi,banamex"},
    {"clave": "banorte", "nombre": "Banorte", "aliases": "banorte,ixe"},
    {"clave": "hsbc", "nombre": "HSBC", "aliases": "hsbc mexico,hsbc"},
    {"clave": "santander", "nombre": "Santander", "aliases": "santander mexico,santander"},
    {"clave": "scotiabank", "nombre": "Scotiabank", "aliases": "scotiabank,scotia"},
    {"clave": "inbursa", "nombre": "Inbursa", "aliases": "inbursa"},
    {"clave": "azteca", "nombre": "Banco Azteca", "aliases": "azteca,banco azteca"},
    {"clave": "bajio", "nombre": "BanBajío", "aliases": "bajio,banbajio,banbajío"},
    {"clave": "afirme", "nombre": "Afirme", "aliases": "afirme"},
    {"clave": "banregio", "nombre": "Banregio", "aliases": "banregio"},
    {"clave": "multiva", "nombre": "Multiva", "aliases": "multiva"},
    {"clave": "mifel", "nombre": "Mifel", "aliases": "mifel"},
    {"clave": "invex", "nombre": "Invex", "aliases": "invex"},
    {"clave": "autopista", "nombre": "Banco Autofin", "aliases": "autofin"},
    {"clave": "otro", "nombre": "Otro banco", "aliases": "otro,generico,genérico"},
]


def listar_bancos_catalogo() -> list[dict[str, str]]:
    return [
        {"clave": b["clave"], "nombre": b["nombre"]}
        for b in BANCOS_MEXICO
    ]


def normalizar_nombre_banco(nombre: str | None) -> str | None:
    if not nombre:
        return None
    texto = " ".join(str(nombre).strip().split())
    return texto or None


def resolver_banco_catalogo(nombre_o_clave: str | None) -> dict[str, str] | None:
    if not nombre_o_clave:
        return None
    needle = nombre_o_clave.strip().lower()
    for banco in BANCOS_MEXICO:
        if needle == banco["clave"] or needle == banco["nombre"].lower():
            return {"clave": banco["clave"], "nombre": banco["nombre"]}
        aliases = [a.strip() for a in banco["aliases"].split(",") if a.strip()]
        if needle in aliases or any(a in needle or needle in a for a in aliases):
            return {"clave": banco["clave"], "nombre": banco["nombre"]}
    return None
