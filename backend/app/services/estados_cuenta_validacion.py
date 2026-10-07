"""Validaciones de estados de cuenta: RFC y duplicados de archivo."""

from __future__ import annotations

import re
from typing import Iterable

from sqlalchemy.orm import Session

from app.models.conciliacion import EstadoCuentaCarga
from app.models.empresa import Empresa
from app.services.cfdi_helpers import normalizar_rfc


# RFC persona moral (12) o física (13)
_RFC_RE = re.compile(
    r"\b([A-ZÑ&]{3}\d{6}[A-Z0-9]{3}|[A-ZÑ&]{4}\d{6}[A-Z0-9]{3})\b",
    re.IGNORECASE,
)

# Tokens que suelen acompañar el RFC del titular en estados de cuenta
_RFC_CONTEXT_RE = re.compile(
    r"(?:RFC|R\.F\.C\.|RFC\s*del\s*cliente|RFC\s*titular|RFC\s*cuenta)"
    r"[\s:\-]*([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})",
    re.IGNORECASE,
)


def extraer_rfcs_de_texto(texto: str | None) -> list[str]:
    if not texto:
        return []
    encontrados: list[str] = []
    vistos: set[str] = set()

    for match in _RFC_CONTEXT_RE.finditer(texto):
        rfc = normalizar_rfc(match.group(1))
        if rfc and rfc not in vistos and _rfc_parece_valido(rfc):
            vistos.add(rfc)
            encontrados.append(rfc)

    for match in _RFC_RE.finditer(texto.upper()):
        rfc = normalizar_rfc(match.group(1))
        if rfc and rfc not in vistos and _rfc_parece_valido(rfc):
            vistos.add(rfc)
            encontrados.append(rfc)

    return encontrados


def _rfc_parece_valido(rfc: str) -> bool:
    if len(rfc) not in (12, 13):
        return False
    # Excluye cadenas numéricas o genéricas frecuentes en PDFs
    if rfc.startswith("XEXX") or rfc.startswith("XAXX"):
        return True
    return rfc[:3].isalpha() or rfc[:4].isalpha()


def extraer_rfcs_de_bytes(contenido: bytes, filename: str | None = None) -> list[str]:
    nombre = (filename or "").lower()
    texto = ""
    try:
        texto = contenido.decode("utf-8", errors="ignore")
    except Exception:
        texto = ""
    if not texto:
        try:
            texto = contenido.decode("latin-1", errors="ignore")
        except Exception:
            texto = ""

    rfcs = extraer_rfcs_de_texto(texto)
    if rfcs:
        return rfcs

    # PDFs: el endpoint ya extrae texto; este fallback solo aplica si llega texto embebido
    if nombre.endswith(".pdf") and not rfcs:
        return []
    return rfcs


def validar_rfc_estado_cuenta(
    empresa: Empresa,
    rfcs_detectados: Iterable[str],
    *,
    exigir_si_detectado: bool = True,
) -> dict:
    """
    Valida que el RFC del estado de cuenta coincida con el de la empresa.

    - Si se detecta al menos un RFC y ninguno coincide → error.
    - Si no se detecta RFC → se permite la carga (muchos CSV no lo traen).
    """
    empresa_rfc = normalizar_rfc(getattr(empresa, "rfc", None))
    detectados = [normalizar_rfc(r) for r in rfcs_detectados if normalizar_rfc(r)]
    detectados = list(dict.fromkeys(detectados))

    if not detectados:
        return {
            "ok": True,
            "rfc_empresa": empresa_rfc,
            "rfcs_detectados": [],
            "coincide": None,
            "mensaje": "No se detectó RFC en el estado de cuenta; se omite la validación.",
        }

    if empresa_rfc in detectados:
        return {
            "ok": True,
            "rfc_empresa": empresa_rfc,
            "rfcs_detectados": detectados,
            "coincide": True,
            "mensaje": "RFC del estado de cuenta coincide con la empresa.",
        }

    if exigir_si_detectado:
        lista = ", ".join(detectados)
        raise ValueError(
            f"El estado de cuenta no corresponde al RFC de la empresa ({empresa_rfc}). "
            f"RFC detectado(s) en el archivo: {lista}."
        )

    return {
        "ok": False,
        "rfc_empresa": empresa_rfc,
        "rfcs_detectados": detectados,
        "coincide": False,
        "mensaje": "RFC detectado no coincide con la empresa.",
    }


def buscar_carga_duplicada(
    db: Session,
    empresa_id: int,
    hash_archivo_value: str,
) -> EstadoCuentaCarga | None:
    return (
        db.query(EstadoCuentaCarga)
        .filter(
            EstadoCuentaCarga.empresa_id == empresa_id,
            EstadoCuentaCarga.hash_archivo == hash_archivo_value,
        )
        .first()
    )
