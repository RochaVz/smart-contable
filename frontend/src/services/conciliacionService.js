import api from './api';

/**
 * Sube un estado de cuenta (XML, CSV o PDF) al backend.
 * @param {File} file - El archivo seleccionado por el usuario.
 * @param {number} empresaId - ID de la empresa activa.
 * @param {number|null} bancoId - ID del banco (opcional).
 * @param {number|null} mes - Mes de referencia (opcional).
 * @param {number|null} anio - Año de referencia (opcional).
 */
export const cargarEstadoCuentaAPI = async (file, empresaId, bancoId = null, mes = null, anio = null) => {
    const formData = new FormData();
    // Ojo: en tu FastAPI el parámetro se llama 'archivo: UploadFile = File(...)'
    formData.append('archivo', file);

    // Parámetros de consulta (Query parameters) que exige tu endpoint en FastAPI
    const params = new URLSearchParams();
    params.append('empresa_id', empresaId);
    if (bancoId !== null && bancoId !== undefined) params.append('banco_id', bancoId);
    if (mes !== null && mes !== undefined) params.append('mes', mes);
    if (anio !== null && anio !== undefined) params.append('anio', anio);

    try {
        // Como tu baseURL ya apunta a /api/v1, la ruta relativa queda limpia:
        const response = await api.post(`/conciliacion/estado-cuenta?${params.toString()}`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data;
    } catch (error) {
        console.error("Error al cargar el estado de cuenta:", error.response?.data || error.message);
        throw error;
    }
};

/**
 * Opcional: Para tu endpoint de convertir PDF a CSV
 */
export const convertirPdfCsvAPI = async (file) => {
    const formData = new FormData();
    formData.append('archivo', file);

    try {
        const response = await api.post('/conciliacion/convertir-pdf-csv', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            responseType: 'blob', // Necesario para descargar archivos binarios (como el CSV)
        });
        return response.data;
    } catch (error) {
        console.error("Error al convertir PDF a CSV:", error);
        throw error;
    }
};