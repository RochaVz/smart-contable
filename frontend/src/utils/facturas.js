export const getFechaFactura = (factura) => factura.fecha || factura.fecha_emision || '';

export const parseFechaFactura = (factura) => {
  const fecha = String(getFechaFactura(factura) || '');
  if (!fecha) return null;

  const match = fecha.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, anio, mes, dia] = match;
    return new Date(Number(anio), Number(mes) - 1, Number(dia));
  }

  const date = new Date(fecha);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const getPeriodoFactura = (factura) => {
  const date = parseFechaFactura(factura);
  if (!date) return null;
  return {
    mes: date.getMonth() + 1,
    anio: date.getFullYear(),
    fecha: date,
  };
};

export const toNumber = (value) => Number.parseFloat(value) || 0;

export const esIngreso = (factura) => factura.tipo_operacion === 'VENTA';

/** Contraparte visible: cliente en ventas, proveedor en compras. */
export const getContraparteFactura = (factura) => {
  if (esIngreso(factura)) {
    return (
      factura.cliente_o_proveedor
      || factura.contraparte
      || factura.nombre_cliente
      || factura.nombre_receptor
      || factura.receptor
      || '—'
    );
  }
  return (
    factura.cliente_o_proveedor
    || factura.contraparte
    || factura.nombre_proveedor
    || factura.nombre_emisor
    || factura.emisor
    || '—'
  );
};
