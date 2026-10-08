import { useMemo } from 'react';
import useExecutiveData from './useExecutiveData';
import {
  buildExecutiveSnapshot,
  calcularScoreFinanciero,
  detectarAlertas,
  generarRecomendaciones,
} from '../utils/financialHealth';

/** Une los servicios existentes con los CFDI cargados y produce la lectura ejecutiva. */
export default function useExecutiveSnapshot({
  empresaId,
  esLocal,
  facturas,
  mes,
  anio,
  refreshToken,
  enabled = true,
}) {
  const datos = useExecutiveData({ empresaId, esLocal, mes, anio, refreshToken, enabled });

  const lectura = useMemo(() => {
    const snapshot = buildExecutiveSnapshot({
      paquete: datos.paquete,
      paqueteAnterior: datos.paqueteAnterior,
      resumenSat: datos.resumenSat,
      indicadores: datos.indicadores,
      movimientosBanco: datos.movimientosBanco,
      facturas,
      mes,
      anio,
    });
    const score = calcularScoreFinanciero(snapshot);
    const alertas = detectarAlertas(snapshot);
    return {
      snapshot,
      score,
      alertas,
      recomendaciones: generarRecomendaciones(score, alertas),
    };
  }, [datos, facturas, mes, anio]);

  return { ...lectura, loading: datos.loading, fallidos: datos.fallidos, esLocal };
}
