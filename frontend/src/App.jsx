import { lazy, Suspense, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast'; // <--- 1. Importa el Toaster
import ThemeToggle from './components/ThemeToggle';
import { clearNavigationCache } from './services/navigationCache';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const CompanyDetail = lazy(() => import('./pages/CompanyDetail'));

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!localStorage.getItem('token'));

  const handleLogout = () => {
    localStorage.removeItem('token');
    clearNavigationCache();
    setIsAuthenticated(false);
  };

  return (
    <BrowserRouter>
      {/* 2. Colócalo aquí, dentro del BrowserRouter pero fuera de las Routes */}
      <Toaster position="top-right" reverseOrder={false} />
      <ThemeToggle />
      
      <Suspense fallback={<div className="min-h-screen bg-slate-950 p-8 text-center text-slate-400" role="status">Cargando vista...</div>}>
        <Routes>
          <Route path="/login" element={!isAuthenticated ? <Login onLoginSuccess={() => setIsAuthenticated(true)} /> : <Navigate to="/dashboard" />} />
          <Route path="/dashboard" element={isAuthenticated ? <Dashboard onLogout={handleLogout} /> : <Navigate to="/login" />} />
          <Route path="/empresa/:id" element={isAuthenticated ? <CompanyDetail /> : <Navigate to="/login" />} />
          <Route path="/empresa/:id/modulos/:moduloId" element={isAuthenticated ? <CompanyDetail /> : <Navigate to="/login" />} />
          <Route path="/empresa/:id/reportes/:reporteId" element={isAuthenticated ? <CompanyDetail /> : <Navigate to="/login" />} />
          <Route path="/empresa/:id/inteligencia" element={isAuthenticated ? <CompanyDetail vista="inteligencia" /> : <Navigate to="/login" />} />
          <Route path="/empresa/:id/inteligencia/:categoria" element={isAuthenticated ? <CompanyDetail vista="inteligencia" /> : <Navigate to="/login" />} />
          <Route path="/empresa/:id/informes" element={isAuthenticated ? <CompanyDetail vista="informes" /> : <Navigate to="/login" />} />
          <Route path="/empresa/:id/informes/:informe" element={isAuthenticated ? <CompanyDetail vista="informes" /> : <Navigate to="/login" />} />
          <Route path="/empresa/:id/configuracion" element={isAuthenticated ? <CompanyDetail vista="configuracion" /> : <Navigate to="/login" />} />
          <Route path="*" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;