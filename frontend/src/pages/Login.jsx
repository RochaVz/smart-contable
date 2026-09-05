import { useState } from 'react';
import api from '../services/api';
import { Lock, Mail, Loader2, Eye, EyeOff } from 'lucide-react';
import SmartContableMark from '../components/SmartContableMark';

const Login = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showRecoveryKey, setShowRecoveryKey] = useState(false);

  const authenticate = async () => {
    const formData = new FormData();
    formData.append('username', email);
    formData.append('password', password);
    formData.append('grant_type', 'password');
    const response = await api.post('/auth/login', formData);
    localStorage.setItem('token', response.data.access_token);
    onLoginSuccess();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (mode === 'register') {
        await api.post('/auth/registro', { nombre: name, email, password, rol: 'contador' });
        await authenticate();
        return;
      }

      if (mode === 'recover') {
        await api.post('/auth/recuperar-contrasena', {
          email,
          recovery_key: recoveryKey,
          new_password: password,
        });
        setMode('login');
        setPassword('');
        setRecoveryKey('');
        setMessage('Contraseña actualizada. Ya puedes iniciar sesión.');
        return;
      }

      await authenticate();
    } catch (err) {
      console.error('Error de autenticación:', err);
      if (err?.code === 'ERR_NETWORK' || !err?.response) {
        setError('No se pudo conectar al servidor. Verifica que el backend esté activo en el puerto 8000.');
      } else if (err.response?.data?.error?.message) {
        setError(err.response.data.error.message);
      } else if (err.response?.status === 401) {
        setError('Usuario, contraseña o clave de recuperación inválidos.');
      } else if (err.response?.status === 409) {
        setError('Ya existe una cuenta con ese correo.');
      } else if (err.response?.status === 503) {
        setError('La recuperación local aún no está configurada.');
      } else if (err.response?.status === 422) {
        const details = err.response.data?.detail;
        const passwordError = Array.isArray(details) && details.some(
          (detail) => detail.loc?.includes('password') || detail.loc?.includes('new_password'),
        );
        setError(passwordError ? 'La contraseña debe tener al menos 8 caracteres.' : 'Revisa los datos capturados e inténtalo nuevamente.');
      } else {
        setError('No se pudo completar la operación. Inténtalo nuevamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError('');
    setMessage('');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl">
        <div className="text-center mb-8">
          <SmartContableMark size="lg" className="mx-auto mb-4" />
          <p className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-blue-400">SmartContable</p>
          <h2 className="text-3xl font-bold text-white">{mode === 'register' ? 'Crear cuenta' : mode === 'recover' ? 'Recuperar acceso' : 'Bienvenido'}</h2>
          <p className="text-slate-400 mt-2">{mode === 'login' ? 'Revisa la información de tu negocio con claridad' : 'Configura tus credenciales locales'}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {mode === 'register' && (
            <div>
              <label className="text-slate-300 text-sm font-medium mb-2 block">Nombre completo</label>
              <input
                type="text"
                required
                minLength="2"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 px-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
          )}
          <div>
            <label className="text-slate-300 text-sm font-medium mb-2 block">Usuario (correo)</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 text-slate-500 w-5 h-5" />
              <input 
                type="email" 
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                placeholder="nombre@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          {mode === 'recover' && (
            <div>
              <label className="text-slate-300 text-sm font-medium mb-2 block">Clave de recuperación local</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 text-slate-500 w-5 h-5" />
                <input
                  type={showRecoveryKey ? 'text' : 'password'}
                  required
                  placeholder="Ej. local-recovery-key"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-10 pr-10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  value={recoveryKey}
                  onChange={(event) => setRecoveryKey(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowRecoveryKey((prev) => !prev)}
                  className="absolute right-3 top-3 text-slate-500 hover:text-slate-300"
                  aria-label={showRecoveryKey ? 'Ocultar clave' : 'Mostrar clave'}
                >
                  {showRecoveryKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="text-slate-300 text-sm font-medium mb-2 block">{mode === 'recover' ? 'Nueva contraseña' : 'Contraseña'}</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 text-slate-500 w-5 h-5" />
              <input 
                type={showPassword ? 'text' : 'password'} 
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-10 pr-10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-3 text-slate-500 hover:text-slate-300"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {error && <p className="text-red-400 text-sm bg-red-400/10 p-3 rounded-lg">{error}</p>}
          {message && <p className="text-emerald-400 text-sm bg-emerald-400/10 p-3 rounded-lg">{message}</p>}

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : mode === 'register' ? 'Crear cuenta' : mode === 'recover' ? 'Actualizar contraseña' : 'Iniciar sesión'}
          </button>
        </form>

        <div className="mt-6 flex justify-between text-sm">
          {mode !== 'login' && <button type="button" onClick={() => switchMode('login')} className="text-slate-400 hover:text-white">Iniciar sesión</button>}
          {mode !== 'register' && <button type="button" onClick={() => switchMode('register')} className="text-blue-400 hover:text-blue-300">Crear cuenta</button>}
          {mode !== 'recover' && <button type="button" onClick={() => switchMode('recover')} className="text-blue-400 hover:text-blue-300">Recuperar contraseña</button>}
        </div>
      </div>
    </div>
  );
};

export default Login;