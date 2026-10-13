const cache = new Map();

export const getNavigationCache = (key) => cache.get(key);

export const setNavigationCache = (key, value) => {
  cache.set(key, value);
};

export const clearNavigationCache = () => {
  cache.clear();
};
