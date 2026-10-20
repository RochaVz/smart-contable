import api from './api';
import { clearNavigationCache } from './navigationCache';
import { clearApiSnapshots, deleteLocalCompaniesByRfc } from './localBackup';

// Claves que sobreviven al reinicio: sesión y preferencia visual, no datos fiscales.
const PRESERVED_LOCAL_STORAGE_KEYS = new Set(['token', 'theme', 'smartcontable-theme']);

const clearBrowserStorage = () => {
  const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
  keys
    .filter((key) => key && !PRESERVED_LOCAL_STORAGE_KEYS.has(key))
    .forEach((key) => localStorage.removeItem(key));
  sessionStorage.clear();
};

/**
 * Elimina definitivamente un RFC (backend + dispositivo) y deja la app lista
 * para repetir el onboarding. Irreversible.
 */
export const resetOnboardingForRfc = async (rfc) => {
  const rfcNormalizado = String(rfc || '').trim().toUpperCase();
  if (!rfcNormalizado) throw new Error('RFC requerido');

  // Si el backend falla se aborta: no se limpia lo local para no dejar datos inconsistentes.
  await api.delete(`/empresas/por-rfc/${encodeURIComponent(rfcNormalizado)}`);
  await deleteLocalCompaniesByRfc(rfcNormalizado);
  await clearApiSnapshots();
  clearNavigationCache();
  clearBrowserStorage();
};
