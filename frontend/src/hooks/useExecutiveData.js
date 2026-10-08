import { useEffect, useState } from 'react';
import api from '../services/api';
import { periodoAnterior } from '../utils/financialHealth';

const VACIO = {
  paquete: null,
  paqueteAnterior: null,
  resumenSat: null,
  indicadores: null,
  movimientosBanco: null,
};

const valorONulo = (resultado) => (resultado.status === 'fulfilled' ? resultado.value.data : null);

/**
 * Consume los servicios existentes (paquete fiscal, resumen SAT, indicadores y
 * movimientos bancarios). Cada fuente falla de forma independiente para que el
 * dashboard siempre muestre lo que sí está disponible.
 */
export default function useExecutiveData({ empresaId, esLocal, mes, anio, refreshToken = 0, enabled = true }) {
  const [estado, setEstado] = useState({ ...VACIO, loading: !esLocal, fallidos: [] });

  useEffect(() => {
    if (!enabled) return undefined;

    if (esLocal) {
      // Los negocios locales no tienen API: el dashboard usa los CFDI locales.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEstado({ ...VACIO, loading: false, fallidos: [] });
      return undefined;
    }

    let cancelado = false;
    const previo = periodoAnterior(mes, anio);
    const params = { empresa_id: empresaId, mes, anio };

    setEstado((actual) => ({ ...actual, loading: true }));

    Promise.allSettled([
      api.get('/reportes/paquete-fiscal', { params }),
      api.get('/reportes/paquete-fiscal', { params: { ...params, mes: previo.mes, anio: previo.anio } }),
      api.get('/fiscal/resumen-sat', { params }),
      api.get('/fiscal/indicadores', { params }),
      api.get('/conciliacion/movimientos', { params: { empresa_id: empresaId } }),
    ]).then((resultados) => {
      if (cancelado) return;
      const [paquete, anterior, sat, indicadores, banco] = resultados;
      const nombres = ['paquete', 'anterior', 'sat', 'indicadores', 'banco'];
      const movimientos = valorONulo(banco);
      setEstado({
        paquete: valorONulo(paquete),
        paqueteAnterior: valorONulo(anterior),
        resumenSat: valorONulo(sat),
        indicadores: valorONulo(indicadores),
        movimientosBanco: Array.isArray(movimientos) ? movimientos : null,
        loading: false,
        fallidos: resultados.flatMap((r, i) => (r.status === 'rejected' ? [nombres[i]] : [])),
      });
    });

    return () => {
      cancelado = true;
    };
  }, [empresaId, esLocal, mes, anio, refreshToken, enabled]);

  return estado;
}
