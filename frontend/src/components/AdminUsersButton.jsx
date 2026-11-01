import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserCog } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../services/api';

export default function AdminUsersButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;
    api.get('/auth/me')
      .then(({ data }) => {
        if (active) setVisible(Boolean(data.es_admin_app));
      })
      .catch(() => {
        if (active) toast.error('No se pudo verificar el acceso de administrador');
      });

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
