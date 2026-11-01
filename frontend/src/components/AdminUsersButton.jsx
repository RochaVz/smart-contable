import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserCog } from 'lucide-react';
import api from '../services/api';

export default function AdminUsersButton() {
  const [visible, setVisible] = useState(() => localStorage.getItem('es_admin_app') === '1');

  useEffect(() => {
    let active = true;
    const verificar = (intentos) =>
      api.get('/auth/me')
        .then(({ data }) => {
          const esAdmin = Boolean(data.es_admin_app);
          localStorage.setItem('es_admin_app', esAdmin ? '1' : '0');
          if (active) setVisible(esAdmin);
        })
        .catch((error) => {
          if (error?.response?.status === 401) return;
          if (intentos > 0 && active) setTimeout(() => verificar(intentos - 1), 3000);
        });
    verificar(2);

    return () => {
      active = false;
    };
  }, []);

  if (!visible) return null;

  return (
    <Link
      to="/admin"
      aria-label="Ver usuarios activos y administrar cuentas"
      className="flex min-h-10 items-center gap-2 rounded-xl border border-amber-500/40 px-3 text-xs font-bold text-amber-400 transition-colors hover:bg-amber-500/10 sm:text-sm"
    >
      <UserCog className="h-5 w-5" />
      <span>Usuarios activos</span>
    </Link>
  );
}
