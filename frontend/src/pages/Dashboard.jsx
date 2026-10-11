import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import {
  ArrowRight,
  Banknote,
  Briefcase,
  Building2,
  Landmark,
  PlusCircle,
  Search,
  ShieldCheck,
  TrendingUp,
  WalletCards,
} from 'lucide-react';

const resumenNegocio = [
  { label: 'Ingresos del período', value: '$1,240,000', detail: 'vs. mes anterior +12.4%', tone: 'emerald' },
  { label: 'Egresos del período', value: '$830,000', detail: 'Controlado y estable', tone: 'rose' },
  { label: 'Utilidad del período', value: '$410,000', detail: 'Margen saludable', tone: 'blue' },
  { label: 'IVA estimado', value: '$148,800', detail: 'Próxima obligación fiscal', tone: 'amber' },
  { label: 'ISR estimado', value: '$54,200', detail: 'Revisión 15 días antes del pago', tone: 'violet' },
];

const accionesRequeridas = [
  { title: 'Declaraciones pendientes', value: '3', tone: 'amber', description: 'IVA, ISR y DIOT próximos a vencer.' },
  { title: 'Pagos pendientes', value: '2', tone: 'rose', description: 'Proveedores con vencimiento esta semana.' },
  { title: 'CFDI sin clasificar', value: '12', tone: 'blue', description: 'Requieren revisión para no distorsionar el análisis.' },
  { title: 'Movimientos sin conciliar', value: '9', tone: 'violet', description: 'Se detectaron diferencias bancarias.' },
  { title: 'Diferencias detectadas', value: '5', tone: 'warning', description: 'Validar antes de cierre del mes.' },
  { title: 'Alertas fiscales', value: '1', tone: 'emerald', description: 'Requisito de SAT por retenciones.' },
];

const obligaciones = [
  { nombre: 'IVA', fecha: '15 de abril', monto: '$148,800' },
  { nombre: 'ISR', fecha: '17 de abril', monto: '$54,200' },
  { nombre: 'DIOT', fecha: '30 de abril', monto: 'Informativo' },
  { nombre: 'Retenciones', fecha: 'Próximo viernes', monto: '$22,300' },
];

const saludNegocio = [
  { label: 'Efectivo disponible', value: '$610,000', meta: 'Adecuado' },
  { label: 'Riesgo fiscal', value: 'Bajo', meta: 'Con seguimiento' },
  { label: 'Cobranza', value: '96%', meta: 'Por encima del promedio' },
  { label: 'Conciliación', value: '91%', meta: 'Requiere 2 ajustes' },
];

const Dashboard = ({ onLogout }) => {
  const navigate = useNavigate();
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchEmpresas = async () => {
      try {
        const response = await api.get('/empresas/');
        setEmpresas(response.data.items || []);
      } catch (error) {
        console.error('Error cargando empresas:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEmpresas();
  }, []);

  const empresasFiltradas = empresas.filter((empresa) => {
    const texto = `${empresa.razon_social || ''} ${empresa.rfc || ''}`.toLowerCase();
    return texto.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.12),_transparent_32%),radial-gradient(circle_at_right,_rgba(59,130,246,0.15),_transparent_30%),#020817] text-slate-200">
      <nav className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 shadow-lg shadow-blue-500/30">
              <Briefcase className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">SmartContable</div>
              <div className="text-lg font-black text-white">Centro de decisiones</div>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-red-500/40 hover:text-red-300"
          >
            Salir
          </button>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <header className="mb-8 rounded-[28px] border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur-xl">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-blue-300">
                <TrendingUp className="h-3.5 w-3.5" />
                Resumen del negocio
              </div>
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Tu negocio en una sola vista</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-400 sm:text-base">
                Ingresos, egresos, utilidad, impuestos, bancos y obligaciones en el mismo nivel de prioridad para decidir rápido.
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 sm:flex-row xl:w-auto">
              <div className="relative w-full min-w-[260px] sm:w-[280px]">
                <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar empresa..."
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 py-3 pl-10 pr-4 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/30"
                />
              </div>

              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition hover:brightness-110"
              >
                <PlusCircle className="h-4 w-4" />
                Nueva empresa
              </button>
            </div>
          </div>
        </header>

        <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {resumenNegocio.map((item) => (
            <div
              key={item.label}
              className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-xl shadow-slate-950/30 transition hover:-translate-y-1 hover:border-white/20"
            >
              <div className={`mb-3 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                item.tone === 'emerald'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : item.tone === 'rose'
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                    : item.tone === 'blue'
                      ? 'border-blue-500/30 bg-blue-500/10 text-blue-300'
                      : item.tone === 'amber'
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                        : 'border-violet-500/30 bg-violet-500/10 text-violet-300'
              }`}>
                {item.label}
              </div>
              <div className="text-2xl font-black text-white">{item.value}</div>
              <div className="mt-2 text-xs text-slate-400">{item.detail}</div>
            </div>
          ))}
        </section>

        <section className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_0.95fr]">
          <div className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/30">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-300">Acciones requeridas</p>
                <h2 className="mt-2 text-2xl font-black text-white">Qué necesitas revisar hoy</h2>
              </div>
              <div className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-200">
                Prioridad alta
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {accionesRequeridas.map((item) => (
                <div key={item.title} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-300">{item.title}</span>
                    <span className={`text-lg font-black ${
                      item.tone === 'amber' ? 'text-amber-300' :
                      item.tone === 'rose' ? 'text-rose-300' :
                      item.tone === 'blue' ? 'text-blue-300' :
                      item.tone === 'warning' ? 'text-yellow-300' : 'text-emerald-300'
                    }`}>{item.value}</span>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/30">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-300">
                <Landmark className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-300">Bancos y conciliación</p>
                <h2 className="text-2xl font-black text-white">Estado general</h2>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">Saldo bancario</span>
                  <span className="text-lg font-black text-emerald-300">$610,000</span>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Pendientes de conciliación</span>
                  <span className="font-black text-white">9</span>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">CFDI sin movimiento bancario</span>
                  <span className="font-black text-white">12</span>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Movimientos bancarios sin CFDI</span>
                  <span className="font-black text-white">4</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/30">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-300">
                <WalletCards className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-300">Próximas obligaciones</p>
                <h2 className="text-2xl font-black text-white">Qué debes pagar y cuándo</h2>
              </div>
            </div>

            <div className="space-y-3">
              {obligaciones.map((item) => (
                <div key={item.nombre} className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                  <div>
                    <div className="font-bold text-white">{item.nombre}</div>
                    <div className="text-xs text-slate-400">{item.fecha}</div>
                  </div>
                  <div className="text-right text-sm font-black text-amber-300">{item.monto}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/30">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-300">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">Salud del negocio</p>
                <h2 className="text-2xl font-black text-white">Tendencias y comparativos</h2>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {saludNegocio.map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{item.label}</div>
                  <div className="mt-2 text-xl font-black text-white">{item.value}</div>
                  <div className="mt-1 text-[11px] text-emerald-300">{item.meta}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/30">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-300">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-300">Empresas</p>
                <h2 className="text-2xl font-black text-white">Selecciona una empresa</h2>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              {empresasFiltradas.length} activas
            </div>
          </div>

          {loading ? (
            <div className="py-10 text-center text-slate-500">Cargando empresas...</div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {empresasFiltradas.map((empresa) => (
                <button
                  key={empresa.id}
                  type="button"
                  onClick={() => navigate(`/empresa/${empresa.id}`)}
                  className="group rounded-3xl border border-white/10 bg-slate-950/50 p-5 text-left transition hover:-translate-y-1 hover:border-blue-500/40 hover:bg-slate-900/80"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-400/20 text-blue-300">
                        <Banknote className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="font-bold text-white">{empresa.razon_social}</div>
                        <div className="font-mono text-[11px] text-slate-400">{empresa.rfc}</div>
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-slate-500 transition group-hover:text-blue-300" />
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-2">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Ingresos</div>
                      <div className="mt-2 font-black text-emerald-300">$240K</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-2">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Utilidad</div>
                      <div className="mt-2 font-black text-blue-300">$80K</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default Dashboard;