import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Menu, X } from 'lucide-react';
import SmartContableMark from '../SmartContableMark';
import {
  SIDEBAR_SECTIONS,
  activeSidebarId,
  sidebarHref,
} from '../../navigation/executive';

/** Estructura de la vista de negocio: sidebar de 8 elementos + barra superior con acciones. */
export default function CompanyShell({ empresaId, empresa, titulo, subtitulo, actions, children }) {
  const { pathname } = useLocation();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const activo = activeSidebarId(pathname, empresaId);

  useEffect(() => {
    // Cierra el drawer móvil al navegar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMenuAbierto(false);
  }, [pathname]);

  const nav = (
    <nav aria-label="Navegación principal" className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {SIDEBAR_SECTIONS.map((section) => (
        <div key={section.id} className="flex flex-col gap-1">
          {section.label ? <p className="sc-nav-label mb-1">{section.label}</p> : null}
          {section.items.map((item) => {
            const Icon = item.icon;
            const esActivo = activo === item.id;
            return (
              <Link
                key={item.id}
                to={sidebarHref(empresaId, item)}
                className="sc-nav-item"
                aria-current={esActivo ? 'page' : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="leading-tight">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const cabeceraSidebar = (
    <div className="flex items-center gap-3 px-4 py-4">
      <SmartContableMark size="sm" />
      <div className="min-w-0">
        <p className="sc-text truncate text-sm font-black">SmartContable</p>
        <p className="sc-muted truncate text-[11px] font-semibold">{empresa?.razon_social || `Negocio #${empresaId}`}</p>
      </div>
    </div>
  );

  const pieSidebar = (
    <div className="px-3 py-3" style={{ borderTop: '1px solid var(--sc-divider)' }}>
      <Link to="/dashboard" className="sc-nav-item">
        <ArrowLeft className="h-4 w-4" /> Mis empresas
      </Link>
    </div>
  );

  return (
    <div className="sc-shell">
      <aside className="sc-sidebar fixed inset-y-0 left-0 z-30 hidden w-64 flex-col lg:flex">
        {cabeceraSidebar}
        {nav}
        {pieSidebar}
      </aside>

      {menuAbierto ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Cerrar menú"
            onClick={() => setMenuAbierto(false)}
          />
          <aside className="sc-sidebar absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col">
            <button
              type="button"
              className="absolute right-3 top-3 rounded-lg p-2 sc-muted"
              aria-label="Cerrar menú"
              onClick={() => setMenuAbierto(false)}
            >
              <X className="h-5 w-5" />
            </button>
            {cabeceraSidebar}
            {nav}
            {pieSidebar}
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header
          className="sc-topbar sticky top-0 z-20 backdrop-blur"
          style={{ background: 'color-mix(in srgb, var(--sc-bg) 88%, transparent)', borderBottom: '1px solid var(--sc-divider)' }}
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <button
              type="button"
              className="sc-card flex h-10 w-10 items-center justify-center lg:hidden"
              aria-label="Abrir menú"
              onClick={() => setMenuAbierto(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="sc-text truncate text-lg font-black sm:text-xl">{titulo}</h1>
              {subtitulo ? <p className="sc-muted truncate text-xs font-semibold">{subtitulo}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl min-w-0 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
