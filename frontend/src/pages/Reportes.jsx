import { useEffect, useState } from 'react';
import api from '../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Loader2, TrendingUp, DollarSign, PieChart } from 'lucide-react';

const Reportes = ({ empresaId }) => {
  const [data, setData] = useState([]); // Iniciamos como array vacío
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/reportes/tendencias?anio=2026&empresa_id=${empresaId}`);
        setData(res.data.tendencias ||[]);
      } catch (err) {
        console.error("Error cargando reportes:", err);
      } finally {
        setLoading(false);
      }
    };
    if (empresaId) fetchData();
  }, [empresaId]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 text-blue-500">
      <Loader2 className="animate-spin w-10 h-10 mb-4" />
      <p className="text-sm font-bold tracking-widest uppercase">Procesando KPIs...</p>
    </div>
  );

  // Cálculos seguros
  const stats = data.reduce((acc, m) => {
    acc.ingresos += m.ingresos || 0;
    acc.gastos += m.gastos || 0;
    acc.utilidad += m.utilidad || 0;
    return acc;
  }, { ingresos: 0, gastos: 0, utilidad: 0 });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* TARJETAS DE RESUMEN */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl">
          <TrendingUp className="text-emerald-500 mb-4" />
          <p className="text-slate-400 text-xs uppercase font-black tracking-widest">Ingresos Totales</p>
          <h3 className="text-2xl font-black text-white mt-2">${stats.ingresos.toLocaleString()}</h3>
        </div>
        <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl">
          <DollarSign className="text-rose-500 mb-4" />
          <p className="text-slate-400 text-xs uppercase font-black tracking-widest">Gastos Totales</p>
          <h3 className="text-2xl font-black text-rose-400 mt-2">${stats.gastos.toLocaleString()}</h3>
        </div>
        <div className="bg-blue-600 p-6 rounded-3xl shadow-xl shadow-blue-900/20">
          <PieChart className="text-blue-100 mb-4" />
          <p className="text-blue-100 text-xs uppercase font-black tracking-widest">Utilidad Neta</p>
          <h3 className="text-2xl font-black text-white mt-2">${stats.utilidad.toLocaleString()}</h3>
        </div>
      </div>

      {/* GRÁFICA */}
      <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-2xl">
        <h3 className="text-xl font-bold text-white mb-8">Tendencia Financiera</h3>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
              <XAxis dataKey="mes" tickFormatter={(val) => `Mes ${val}`} axisLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
              <YAxis axisLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                formatter={(value) => `$${value.toLocaleString()}`}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Bar dataKey="ingresos" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
              <Bar dataKey="gastos" name="Gastos" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default Reportes;