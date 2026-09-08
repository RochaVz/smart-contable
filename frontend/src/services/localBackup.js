import JSZip from 'jszip';

const DB_NAME = 'smartcontable-local-vault';
const DB_VERSION = 4;
const STORE_SNAPSHOTS = 'snapshots';
const STORE_META = 'meta';
const STORE_COMPANIES = 'companies';
const STORE_INVOICES = 'invoices';
const STORE_BANK_MOVEMENTS = 'bankMovements';
const BACKUP_FORMAT = 'smartcontable-device-backup';
const BACKUP_FORMAT_VERSION = 2;
const EXCLUDED_LOCAL_STORAGE_KEYS = new Set(['token']);

const openVault = () => new Promise((resolve, reject) => {
  if (!('indexedDB' in window)) {
    reject(new Error('Este navegador no soporta respaldo local avanzado.'));
    return;
  }

  const request = indexedDB.open(DB_NAME, DB_VERSION);

  request.onupgradeneeded = () => {
    const db = request.result;

    if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
      db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'key' });
    }

    if (!db.objectStoreNames.contains(STORE_META)) {
      db.createObjectStore(STORE_META, { keyPath: 'key' });
    }

    if (!db.objectStoreNames.contains(STORE_COMPANIES)) {
      db.createObjectStore(STORE_COMPANIES, { keyPath: 'id' });
    }

    if (!db.objectStoreNames.contains(STORE_INVOICES)) {
      db.createObjectStore(STORE_INVOICES, { keyPath: 'id' });
    }

    if (!db.objectStoreNames.contains(STORE_BANK_MOVEMENTS)) {
      db.createObjectStore(STORE_BANK_MOVEMENTS, { keyPath: 'id' });
    }
  };

  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('No se pudo abrir el respaldo local.'));
});

const runStore = async (storeName, mode, operation) => {
  const db = await openVault();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = operation(store);

    transaction.oncomplete = () => {
      db.close();
      resolve(result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error('No se pudo completar la operación local.'));
    };
  });
};

const readAllFromStore = async (storeName) => {
  const db = await openVault();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('No se pudo leer el respaldo local.'));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => db.close();
  });
};

const isJsonLike = (data) => {
  if (data == null) return true;
  if (data instanceof Blob || data instanceof ArrayBuffer || data instanceof FormData) return false;
  return typeof data === 'object' || typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean';
};

export const shouldStoreApiSnapshot = (config = {}, data) => {
  const url = String(config.url || '');
  const method = String(config.method || 'get').toLowerCase();

  if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) return false;
  if (url.includes('/auth/')) return false;
  if (config.responseType === 'blob' || config.responseType === 'arraybuffer') return false;
  return isJsonLike(data);
};

export const saveApiSnapshot = async (config = {}, data) => {
  if (!shouldStoreApiSnapshot(config, data)) return;

  const method = String(config.method || 'get').toUpperCase();
  const url = String(config.url || '');
  const params = config.params ? `?${new URLSearchParams(config.params).toString()}` : '';
  const key = `${method} ${url}${params}`;
  const savedAt = new Date().toISOString();

  await runStore(STORE_SNAPSHOTS, 'readwrite', (store) => {
    store.put({ key, method, url, params: config.params || null, savedAt, data });
  });

  await runStore(STORE_META, 'readwrite', (store) => {
    store.put({ key: 'lastSnapshotAt', value: savedAt });
  });

  window.dispatchEvent(new CustomEvent('smartcontable:local-backup-updated'));
};

export const getLocalBackupStats = async () => {
  const snapshots = await readAllFromStore(STORE_SNAPSHOTS);
  const companies = await readAllFromStore(STORE_COMPANIES);
  const invoices = await readAllFromStore(STORE_INVOICES);
  const bankMovements = await readAllFromStore(STORE_BANK_MOVEMENTS);
  const allItems = [...snapshots, ...companies, ...invoices, ...bankMovements];
  const lastSavedAt = allItems.reduce((latest, item) => {
    if (!item.savedAt) return latest;
    return !latest || item.savedAt > latest ? item.savedAt : latest;
  }, '');

  return {
    snapshots: snapshots.length,
    companies: companies.length,
    invoices: invoices.length,
    bankMovements: bankMovements.length,
    totalRecords: snapshots.length + companies.length + invoices.length + bankMovements.length,
    lastSavedAt,
  };
};

const getLocalPreferences = () => {
  const preferences = {};

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || EXCLUDED_LOCAL_STORAGE_KEYS.has(key)) continue;
    preferences[key] = localStorage.getItem(key);
  }

  return preferences;
};

const downloadJson = (filename, content) => {
  const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

export const exportDeviceBackup = async () => {
  const snapshots = await readAllFromStore(STORE_SNAPSHOTS);
  const companies = await readAllFromStore(STORE_COMPANIES);
  const invoices = await readAllFromStore(STORE_INVOICES);
  const bankMovements = await readAllFromStore(STORE_BANK_MOVEMENTS);
  const exportedAt = new Date().toISOString();
  const backup = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    app: 'SmartContable',
    exportedAt,
    deviceStorage: {
      preferences: getLocalPreferences(),
      snapshots,
      companies,
      invoices,
      bankMovements,
    },
  };
  const stamp = exportedAt.slice(0, 19).replace(/[-:T]/g, '');
  downloadJson(`smartcontable-respaldo-dispositivo-${stamp}.json`, backup);
  return { snapshots: snapshots.length, companies: companies.length, invoices: invoices.length, bankMovements: bankMovements.length, exportedAt };
};

export const exportCompanyBackup = async (company, { invoices: providedInvoices = [] } = {}) => {
  const snapshots = await readAllFromStore(STORE_SNAPSHOTS);
  const companies = await readAllFromStore(STORE_COMPANIES);
  const storedInvoices = await readAllFromStore(STORE_INVOICES);
  const bankMovements = await readAllFromStore(STORE_BANK_MOVEMENTS);
  const companyId = String(company.id || '');
  const companyRfc = String(company.rfc || '').toUpperCase();
  const localCompany = companies.find((item) => String(item.id) === companyId || item.rfc === companyRfc);
  const storedCompanyInvoices = storedInvoices.filter((invoice) => String(invoice.empresa_id) === companyId || invoice.empresa_rfc === companyRfc);
  const validProvidedInvoices = providedInvoices.filter((invoice) => invoice && typeof invoice === 'object' && !Array.isArray(invoice));
  const companyInvoices = [...new Map([...storedCompanyInvoices, ...validProvidedInvoices].map((invoice, index) => [
    invoice.uuid || invoice.id || `invoice-${index}`,
    invoice,
  ])).values()];
  const companyBankMovements = bankMovements.filter((movement) => String(movement.empresa_id) === companyId || movement.empresa_rfc === companyRfc);
  const companySnapshots = snapshots.filter((snapshot) => {
    const source = `${snapshot.url || ''} ${snapshot.key || ''}`;
    return (companyId && source.includes(companyId)) || (companyRfc && source.toUpperCase().includes(companyRfc));
  });
  const exportedAt = new Date().toISOString();
  const backup = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    app: 'SmartContable',
    exportedAt,
    scope: 'company',
    deviceStorage: {
      preferences: getLocalPreferences(),
      snapshots: companySnapshots,
      companies: [localCompany || company],
      invoices: companyInvoices,
      bankMovements: companyBankMovements,
    },
  };
  const stamp = exportedAt.slice(0, 19).replace(/[-:T]/g, '');
  const safeName = companyRfc || String(company.razon_social || 'negocio').replace(/\W+/g, '-').toLowerCase();
  downloadJson(`smartcontable-respaldo-${safeName}-${stamp}.json`, backup);
  return { snapshots: companySnapshots.length, companies: 1, invoices: companyInvoices.length, bankMovements: companyBankMovements.length, exportedAt };
};

export const importDeviceBackup = async (file) => {
  const text = await file.text();
  const backup = JSON.parse(text);

  if (backup.format !== BACKUP_FORMAT || ![1, 2].includes(backup.formatVersion)) {
    throw new Error('El archivo no parece ser un respaldo válido de SmartContable.');
  }

  const deviceStorage = backup.deviceStorage || {};
  const preferences = deviceStorage.preferences || {};
  Object.entries(preferences).forEach(([key, value]) => {
    if (!EXCLUDED_LOCAL_STORAGE_KEYS.has(key)) localStorage.setItem(key, String(value));
  });

  const snapshots = Array.isArray(deviceStorage.snapshots) ? deviceStorage.snapshots : [];
  const companies = Array.isArray(deviceStorage.companies) ? deviceStorage.companies : [];
  const existingCompanies = await getLocalCompanies();
  const companyIdMap = new Map();
  const importedCompanies = [];
  const now = new Date().toISOString();

  companies.forEach((company) => {
    if (!company || !company.rfc) return;
    const rfc = String(company.rfc).trim().toUpperCase();
    const existing = existingCompanies.find((item) => String(item.rfc || '').toUpperCase() === rfc);
    const localId = existing?.id || `local-${rfc}-${crypto.randomUUID()}`;
    if (company.id) companyIdMap.set(String(company.id), localId);
    importedCompanies.push({
      ...company,
      id: localId,
      rfc,
      local_only: true,
      created_at: existing?.created_at || company.created_at || now,
      updated_at: now,
      savedAt: now,
    });
  });

  await runStore(STORE_COMPANIES, 'readwrite', (store) => {
    importedCompanies.forEach((company) => {
      store.put(company);
    });
  });

  const invoices = Array.isArray(deviceStorage.invoices) ? deviceStorage.invoices : [];
  const existingInvoices = await readAllFromStore(STORE_INVOICES);
  const knownInvoiceUuids = new Set(existingInvoices.map((invoice) => String(invoice.uuid || '').toUpperCase()).filter(Boolean));
  const importedInvoices = invoices
    .filter((invoice) => invoice && (invoice.uuid || invoice.id))
    .filter((invoice) => {
      const uuid = String(invoice.uuid || '').toUpperCase();
      if (!uuid || knownInvoiceUuids.has(uuid)) return !uuid;
      knownInvoiceUuids.add(uuid);
      return true;
    })
    .map((invoice) => ({
      ...invoice,
      id: `local-invoice-${crypto.randomUUID()}`,
      empresa_id: companyIdMap.get(String(invoice.empresa_id)) || invoice.empresa_id,
      empresa_rfc: String(invoice.empresa_rfc || '').toUpperCase(),
      local_only: true,
      savedAt: now,
      importedAt: now,
    }));
  await runStore(STORE_INVOICES, 'readwrite', (store) => {
    importedInvoices.forEach((invoice) => store.put(invoice));
  });

  const bankMovements = Array.isArray(deviceStorage.bankMovements) ? deviceStorage.bankMovements : [];
  const existingMovements = await readAllFromStore(STORE_BANK_MOVEMENTS);
  const knownMovementKeys = new Set(existingMovements.map((movement) => movement.fingerprint).filter(Boolean));
  const importedMovements = bankMovements
    .filter((movement) => movement && movement.id)
    .map((movement) => ({
      ...movement,
      id: `local-bank-${crypto.randomUUID()}`,
      empresa_id: companyIdMap.get(String(movement.empresa_id)) || movement.empresa_id,
      empresa_rfc: String(movement.empresa_rfc || '').toUpperCase(),
      local_only: true,
      savedAt: now,
      importedAt: now,
    }))
    .filter((movement) => !movement.fingerprint || !knownMovementKeys.has(movement.fingerprint));
  await runStore(STORE_BANK_MOVEMENTS, 'readwrite', (store) => {
    importedMovements.forEach((movement) => store.put(movement));
  });

  // Snapshots are cache data, so namespace them to avoid overwriting this device's cache.
  await runStore(STORE_SNAPSHOTS, 'readwrite', (store) => {
    snapshots.forEach((snapshot) => {
      if (snapshot?.key) store.put({ ...snapshot, key: `imported:${crypto.randomUUID()}:${snapshot.key}` });
    });
  });

  await runStore(STORE_META, 'readwrite', (store) => {
    store.put({ key: 'lastImportAt', value: new Date().toISOString() });
  });

  window.dispatchEvent(new CustomEvent('smartcontable:local-companies-updated'));
  window.dispatchEvent(new CustomEvent('smartcontable:local-invoices-updated'));
  window.dispatchEvent(new CustomEvent('smartcontable:local-bank-movements-updated'));
  return {
    snapshots: snapshots.length,
    companies: importedCompanies.length,
    invoices: importedInvoices.length,
    bankMovements: importedMovements.length,
  };
};

export const clearDeviceBackup = async () => {
  await runStore(STORE_SNAPSHOTS, 'readwrite', (store) => store.clear());
  await runStore(STORE_COMPANIES, 'readwrite', (store) => store.clear());
  await runStore(STORE_INVOICES, 'readwrite', (store) => store.clear());
  await runStore(STORE_BANK_MOVEMENTS, 'readwrite', (store) => store.clear());
  await runStore(STORE_META, 'readwrite', (store) => {
    store.put({ key: 'lastClearAt', value: new Date().toISOString() });
  });
  window.dispatchEvent(new CustomEvent('smartcontable:local-companies-updated'));
  window.dispatchEvent(new CustomEvent('smartcontable:local-invoices-updated'));
  window.dispatchEvent(new CustomEvent('smartcontable:local-bank-movements-updated'));
};

export const getLocalCompanies = async () => readAllFromStore(STORE_COMPANIES);

export const deleteLocalCompany = async (company) => {
  const id = company?.id;
  if (!id) return;

  await runStore(STORE_COMPANIES, 'readwrite', (store) => store.delete(id));
  const invoices = await readAllFromStore(STORE_INVOICES);
  await runStore(STORE_INVOICES, 'readwrite', (store) => {
    invoices
      .filter((invoice) => String(invoice.empresa_id) === String(id))
      .forEach((invoice) => store.delete(invoice.id));
  });
  const bankMovements = await readAllFromStore(STORE_BANK_MOVEMENTS);
  await runStore(STORE_BANK_MOVEMENTS, 'readwrite', (store) => {
    bankMovements
      .filter((movement) => String(movement.empresa_id) === String(id))
      .forEach((movement) => store.delete(movement.id));
  });
  window.dispatchEvent(new CustomEvent('smartcontable:local-backup-updated'));
  window.dispatchEvent(new CustomEvent('smartcontable:local-companies-updated'));
  window.dispatchEvent(new CustomEvent('smartcontable:local-invoices-updated'));
  window.dispatchEvent(new CustomEvent('smartcontable:local-bank-movements-updated'));
};

export const saveLocalCompany = async (company) => {
  const now = new Date().toISOString();
  const rfc = String(company.rfc || '').trim().toUpperCase();
  const id = company.id || `local-${rfc || crypto.randomUUID()}`;
  const localCompany = {
    ...company,
    id,
    rfc,
    local_only: true,
    created_at: company.created_at || now,
    updated_at: now,
    savedAt: now,
  };

  await runStore(STORE_COMPANIES, 'readwrite', (store) => {
    store.put(localCompany);
  });

  window.dispatchEvent(new CustomEvent('smartcontable:local-backup-updated'));
  window.dispatchEvent(new CustomEvent('smartcontable:local-companies-updated'));
  return localCompany;
};

export const getLocalCompany = async (id) => {
  const companies = await getLocalCompanies();
  return companies.find((company) => String(company.id) === String(id)) || null;
};

export const getLocalInvoices = async (empresaId) => {
  const invoices = await readAllFromStore(STORE_INVOICES);
  return invoices.filter((invoice) => String(invoice.empresa_id) === String(empresaId));
};

export const deleteLocalInvoice = async (invoiceId) => {
  await runStore(STORE_INVOICES, 'readwrite', (store) => store.delete(invoiceId));
  window.dispatchEvent(new CustomEvent('smartcontable:local-backup-updated'));
  window.dispatchEvent(new CustomEvent('smartcontable:local-invoices-updated'));
};

export const getLocalBankMovements = async (empresaId) => {
  const movements = await readAllFromStore(STORE_BANK_MOVEMENTS);
  return movements.filter((movement) => String(movement.empresa_id) === String(empresaId));
};

export const saveLocalBankMovements = async ({ company, movements, sourceName }) => {
  const now = new Date().toISOString();
  const existing = await getLocalBankMovements(company.id);
  const existingKeys = new Set(existing.map((movement) => movement.fingerprint));
  const prepared = movements.map((movement, index) => {
    const fecha = movement.fecha || new Date().toISOString().slice(0, 10);
    const tipo = movement.tipo || (Number(movement.abono || 0) > 0 ? 'abono' : 'cargo');
    const monto = Math.abs(Number(movement.monto || movement.abono || movement.cargo || 0));
    const descripcion = movement.descripcion || 'Movimiento bancario';
    const referencia = movement.referencia || '';
    const fingerprint = `${company.id}|${fecha}|${tipo}|${monto.toFixed(2)}|${referencia}|${descripcion}`.toLowerCase();
    return {
      ...movement,
      id: movement.id || `local-bank-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
      empresa_id: company.id,
      empresa_rfc: company.rfc,
      fecha,
      tipo,
      monto,
      cargo: tipo === 'cargo' ? monto : null,
      abono: tipo === 'abono' ? monto : null,
      descripcion,
      referencia,
      sourceName,
      fingerprint,
      local_only: true,
      savedAt: now,
      created_at: now,
      updated_at: now,
    };
  });
  const nuevos = prepared.filter((movement) => !existingKeys.has(movement.fingerprint) && movement.monto > 0);

  await runStore(STORE_BANK_MOVEMENTS, 'readwrite', (store) => {
    nuevos.forEach((movement) => store.put(movement));
  });

  window.dispatchEvent(new CustomEvent('smartcontable:local-backup-updated'));
  window.dispatchEvent(new CustomEvent('smartcontable:local-bank-movements-updated'));
  return { nuevos: nuevos.length, duplicados: prepared.length - nuevos.length };
};

const getAttr = (node, name) => node?.getAttribute(name) || node?.getAttribute(name.toLowerCase()) || '';

const findByLocalName = (root, localName) => [...root.getElementsByTagName('*')]
  .find((node) => node.localName === localName);

const sumTaxes = (root, taxCode, containerName) => [...root.getElementsByTagName('*')]
  .filter((node) => node.localName === containerName && getAttr(node, 'Impuesto') === taxCode)
  .reduce((sum, node) => sum + (Number(getAttr(node, 'Importe')) || 0), 0);

const parseLocalCfdiXml = (xmlText, company) => {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('XML inválido. Revisa que sea un CFDI del SAT.');

  const root = doc.documentElement;
  const emisor = findByLocalName(root, 'Emisor');
  const receptor = findByLocalName(root, 'Receptor');
  const timbre = findByLocalName(root, 'TimbreFiscalDigital');
  const uuid = getAttr(timbre, 'UUID').toUpperCase();
  if (!uuid) throw new Error('El XML no contiene UUID fiscal.');

  const empresaRfc = String(company.rfc || '').trim().toUpperCase();
  const rfcEmisor = getAttr(emisor, 'Rfc').toUpperCase();
  const rfcReceptor = getAttr(receptor, 'Rfc').toUpperCase();
  const esVenta = rfcEmisor === empresaRfc;
  const esGasto = rfcReceptor === empresaRfc;
  if (!esVenta && !esGasto) {
    throw new Error(`El CFDI no pertenece al RFC ${empresaRfc}.`);
  }

  const fecha = getAttr(root, 'Fecha') || getAttr(timbre, 'FechaTimbrado') || new Date().toISOString();
  const conceptos = [...root.getElementsByTagName('*')]
    .filter((node) => node.localName === 'Concepto')
    .map((node) => ({
      descripcion: getAttr(node, 'Descripcion'),
      cantidad: Number(getAttr(node, 'Cantidad')) || 1,
      unidad: getAttr(node, 'Unidad'),
      valor_unitario: Number(getAttr(node, 'ValorUnitario')) || 0,
      importe: Number(getAttr(node, 'Importe')) || 0,
    }));

  const now = new Date().toISOString();
  return {
    id: `local-invoice-${uuid}`,
    empresa_id: company.id,
    empresa_rfc: empresaRfc,
    local_only: true,
    uuid,
    fecha,
    fecha_emision: fecha,
    tipo_operacion: esVenta ? 'VENTA' : 'GASTO',
    emisor: esVenta ? getAttr(receptor, 'Nombre') : getAttr(emisor, 'Nombre'),
    receptor: getAttr(receptor, 'Nombre'),
    rfc_emisor: esVenta ? rfcEmisor : rfcEmisor,
    rfc_receptor: rfcReceptor,
    nombre_cliente: esVenta ? getAttr(receptor, 'Nombre') : null,
    forma_pago: getAttr(root, 'FormaPago'),
    forma_pago_label: getAttr(root, 'FormaPago') ? `Código ${getAttr(root, 'FormaPago')}` : '',
    metodo_pago: getAttr(root, 'MetodoPago'),
    subtotal: Number(getAttr(root, 'SubTotal')) || 0,
    iva: sumTaxes(root, '002', 'Traslado'),
    iva_retenido: sumTaxes(root, '002', 'Retencion'),
    isr_retenido: sumTaxes(root, '001', 'Retencion'),
    total: Number(getAttr(root, 'Total')) || 0,
    cuenta_contable: esVenta ? 'VENTAS GENERALES' : 'GASTOS POR CLASIFICAR',
    tiene_poliza: false,
    conceptos,
    savedAt: now,
    created_at: now,
    updated_at: now,
  };
};

const saveParsedLocalInvoice = async (invoice, company) => {
  const existing = await getLocalInvoices(company.id);
  if (existing.some((item) => item.uuid === invoice.uuid)) {
    return { saved: false, duplicate: true, invoice };
  }

  await runStore(STORE_INVOICES, 'readwrite', (store) => store.put(invoice));
  window.dispatchEvent(new CustomEvent('smartcontable:local-backup-updated'));
  window.dispatchEvent(new CustomEvent('smartcontable:local-invoices-updated'));
  return { saved: true, duplicate: false, invoice };
};

const saveLocalXmlText = async ({ xmlText, company }) => {
  const invoice = parseLocalCfdiXml(xmlText, company);
  return saveParsedLocalInvoice(invoice, company);
};

export const saveLocalCfdiXml = async ({ file, company }) => {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.xml')) {
    const result = await saveLocalXmlText({ xmlText: await file.text(), company });
    return {
      ...result,
      isZip: false,
      exitos: result.saved ? 1 : 0,
      duplicados: result.duplicate ? 1 : 0,
      errores: 0,
      no_xml: 0,
      detalles: [{ archivo: file.name, status: result.duplicate ? 'duplicado' : 'ok', uuid: result.invoice.uuid }],
    };
  }

  if (!fileName.endsWith('.zip')) {
    throw new Error('Selecciona un archivo XML o ZIP con CFDI.');
  }

  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  const xmlEntries = entries.filter((entry) => entry.name.toLowerCase().endsWith('.xml'));
  const noXmlEntries = entries.filter((entry) => !entry.name.toLowerCase().endsWith('.xml'));
  const resumen = {
    isZip: true,
    exitos: 0,
    duplicados: 0,
    errores: 0,
    no_xml: noXmlEntries.length,
    archivos_no_xml: noXmlEntries.map((entry) => entry.name),
    detalles: noXmlEntries.map((entry) => ({ archivo: entry.name, status: 'no_xml' })),
  };

  for (const entry of xmlEntries) {
    try {
      const xmlText = await entry.async('text');
      const result = await saveLocalXmlText({ xmlText, company });
      if (result.duplicate) {
        resumen.duplicados += 1;
        resumen.detalles.push({ archivo: entry.name, status: 'duplicado', uuid: result.invoice.uuid });
      } else {
        resumen.exitos += 1;
        resumen.detalles.push({ archivo: entry.name, status: 'ok', uuid: result.invoice.uuid });
      }
    } catch (error) {
      resumen.errores += 1;
      resumen.detalles.push({ archivo: entry.name, status: 'error', error: error.message || 'No se pudo procesar el XML' });
    }
  }

  if (xmlEntries.length === 0) {
    resumen.mensaje = 'ZIP invalido para CFDI: no contiene archivos XML.';
  } else if (resumen.exitos === 0 && resumen.duplicados > 0 && resumen.errores === 0) {
    resumen.mensaje = 'No se guardo nada nuevo: todos los XML del ZIP ya estaban registrados.';
  } else if (resumen.exitos === 0 && resumen.errores > 0) {
    resumen.mensaje = 'No se guardo nada nuevo: los XML del ZIP tienen errores o no pertenecen a este RFC.';
  }

  return resumen;
};