import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);
export const subirEstadoCuentaPDF = async (file, empresaId, bancoId = null, mes = null, anio = null) => {
    const formData = new FormData();
    formData.append('archivo', file); // 'archivo' coincide con el parámetro File(...) de tu FastAPI

    // Construimos los parámetros de consulta (query params) si es que los mandas
    const params = new URLSearchParams();
    params.append('empresa_id', empresaId);
    if (bancoId) params.append('banco_id', bancoId);
    if (mes) params.append('mes', mes);
    if (anio) params.append('anio', anio);

    try {
        // Nota que pasamos los parámetros en la URL tal como los pide tu endpoint de FastAPI
        const response = await api.post(`/conciliacion/estado-cuenta?${params.toString()}`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data;
    } catch (error) {
        console.error("Error al subir el estado de cuenta:", error.response?.data || error.message);
        throw error;
    }
};
export default api;
