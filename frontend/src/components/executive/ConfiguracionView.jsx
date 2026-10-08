import { Building2, Landmark, Scale } from 'lucide-react';
import ComisionesBancoPanel from '../ComisionesBancoPanel';

const Seccion = ({ icono: Icon, titulo, descripcion, children }) => (
  <section className="sc-card space-y-4 p-5">
    <header className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--sc-soft)', color: 'var(--sc-primary)' }}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <h2 className="sc-text text-base font-black">{titulo}</h2>
        <p className="sc-muted text-xs font-semibold">{descripcion}</p>
      </div>
    </header>
    <div className="min-w-0">{children}</div>
  </section>
);

/** Configuración del negocio: datos generales, régimen fiscal y comisiones bancarias. */
export default function ConfiguracionView({ empresa, empresaId, esLocal, renderFuente }) {
  return (
    <div className="space-y-6">
      <Seccion icono={Building2} titulo="Datos del negocio" descripcion="Identificación fiscal registrada en SmartContable">
        <dl className="grid gap-4 sm:grid-cols-3">
          {[
            ['Razón social', empresa?.razon_social],
            ['RFC', empresa?.rfc],
            ['Régimen fiscal', empresa?.regimen_fiscal],
          ].map(([etiqueta, valor]) => (
            <div key={etiqueta}>
              <dt className="sc-muted text-xs font-bold uppercase tracking-wide">{etiqueta}</dt>
              <dd className="sc-text mt-1 break-words text-sm font-black">{valor || '—'}</dd>
            </div>
          ))}
        </dl>
      </Seccion>

      <Seccion icono={Scale} titulo="Régimen fiscal" descripcion="Reglas de impuestos y obligaciones aplicables">
        {renderFuente({ tipo: 'fiscal', tab: 'config' })}
      </Seccion>

      {esLocal ? null : (
        <Seccion icono={Landmark} titulo="Comisiones bancarias" descripcion="Configura las comisiones por banco antes de generar pólizas con tarjeta">
          <ComisionesBancoPanel empresaId={empresaId} />
        </Seccion>
      )}
    </div>
  );
}
