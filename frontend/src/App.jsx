import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast'; // <--- 1. Importa el Toaster
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CompanyDetail from './pages/CompanyDetail';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!localStorage.getItem('token'));

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
  };

  return (
    <BrowserRouter>
      {/* 2. Colócalo aquí, dentro del BrowserRouter pero fuera de las Routes */}
      <Toaster position="top-right" reverseOrder={false} />
      
      <Routes>
        <Route path="/login" element={!isAuthenticated ? <Login onLoginSuccess={() => setIsAuthenticated(true)} /> : <Navigate to="/dashboard" />} />
        <Route path="/dashboard" element={isAuthenticated ? <Dashboard onLogout={handleLogout} /> : <Navigate to="/login" />} />
        <Route path="/empresa/:id" element={isAuthenticated ? <CompanyDetail /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;