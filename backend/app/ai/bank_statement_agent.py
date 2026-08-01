"""Módulo de agente de IA para la extracción estructurada de estados de cuenta PDF."""

import os
from typing import List, Optional
from openai import OpenAI
from pydantic import BaseModel, Field
from app.core.config import settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)


class MovimientoAIExtraido(BaseModel):
    """Modelo Pydantic para un movimiento individual extraído por IA."""

    fecha: str = Field(description="Fecha del movimiento en formato YYYY-MM-DD")
    tipo: str = Field(
        description="Usa estrictamente 'abono' si es depósito/ingreso o 'cargo' "
        "si es retiro/egreso/pago/comisión"
    )
    descripcion: str = Field(description="Concepto o descripción completa")
    referencia: Optional[str] = Field(
        default="", description="Número de referencia o autorización"
    )
    monto: float = Field(description="Monto positivo numérico flotante")
    saldo: Optional[float] = Field(
        default=None, description="Saldo posterior al movimiento"
    )


class EstadoCuentaAIExtraido(BaseModel):
    """Modelo Pydantic para el estado de cuenta global extraído por IA."""

    banco: Optional[str] = Field(
        default="BANCO", description="Nombre comercial del banco"
    )
    saldo_inicial: Optional[float] = Field(default=0.0)
    saldo_final: Optional[float] = Field(default=0.0)
    movimientos: List[MovimientoAIExtraido]


def _obtener_api_key() -> str:
    """Obtiene la API key de OpenAI de forma segura."""
    api_key = getattr(settings, "OPENAI_API_KEY", None) or os.getenv(
        "OPENAI_API_KEY"
    )
    if not api_key:
        raise RuntimeError(
            "No se encontró la variable OPENAI_API_KEY. "
            "Configúrala en tu archivo .env o en las variables de entorno."
        )
    return api_key


def extraer_movimientos_pdf_ai(
    texto_pdf: str, reintento: bool = False, error_previo: str = ""
) -> EstadoCuentaAIExtraido:
    """Envía el texto plano del PDF a OpenAI utilizando Structured Outputs."""
    try:
        client = OpenAI(api_key=_obtener_api_key())
    except Exception as exc:
        logger.error("Error al inicializar el cliente de OpenAI: %s", exc)
        raise RuntimeError(f"Fallo de configuración con OpenAI: {exc}") from exc

    prompt = (
        "Extrae con precisión matemática absoluta todos los movimientos "
        "del estado de cuenta bancario.\n\n"
        "REGLAS ESTRITAS:\n"
        "1. NO omitas ninguna transacción.\n"
        "2. Formatea la fecha como YYYY-MM-DD.\n"
        "3. El campo 'tipo' DEBE ser 'abono' o 'cargo'.\n"
        "4. El 'monto' siempre debe ser un número positivo flotante.\n"
    )

    if reintento:
        prompt += (
            f"\n¡ALERTA DE ERROR PREVIO!: {error_previo}. "
            "Revisa minuciosamente los montos, cargos y abonos.\n"
        )

    prompt += f"\nTEXTO DEL ESTADO DE CUENTA:\n{texto_pdf}"

    try:
        response = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Asistente experto en extracción contable de "
                        "estados de cuenta bancarios en México."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            response_format=EstadoCuentaAIExtraido,
            temperature=0.0,
        )

        parsed_data = response.choices[0].message.parsed
        if not parsed_data:
            raise ValueError(
                "La IA respondió pero no pudo parsear el esquema Pydantic."
            )

        return parsed_data

    except Exception as e:
        logger.error("Error al comunicarse con la API de OpenAI: %s", e)
        raise RuntimeError(f"Error en la extracción por IA: {str(e)}") from e