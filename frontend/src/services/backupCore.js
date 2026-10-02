/** Pure backup helpers (no IndexedDB/DOM). Testable in Node. */

export const BACKUP_FORMAT = 'smartcontable-device-backup';
export const BACKUP_FORMAT_VERSION = 4;
export const SUPPORTED_BACKUP_VERSIONS = [1, 2, 3, 4];

export const BACKUP_COVERAGE_KEYS = [
  'companies',
  'invoices',
  'bankMovements',
  'polizas',
  'accountMappings',
  'snapshots',
];

const asArray = (value) => (Array.isArray(value) ? value : []);

export const polizaIdentityKey = (poliza = {}) => {
  const rfc = String(poliza.empresa_rfc || '').trim().toUpperCase();
  const tipo = String(poliza.tipo || '').trim().toLowerCase();
  const numero = String(poliza.numero ?? '').trim();
  const periodo = String(poliza.periodo || `${poliza.anio || ''}-${String(poliza.mes || '').padStart(2, '0')}`).trim();
  const uuid = String(poliza.cfdi?.uuid || poliza.factura_uuid || '').trim().toUpperCase();
  const fecha = String(poliza.fecha || '').slice(0, 10);
  const total = Number(poliza.total || 0).toFixed(2);
  return [rfc, tipo, numero, periodo, uuid, fecha, total].join('|');
};

export const accountMappingIdentityKey = (mapping = {}) => {
  const rfcEmpresa = String(mapping.empresa_rfc || '').trim().toUpperCase();
  const tipo = String(mapping.tipo_regla || 'rfc').trim().toLowerCase();
  const rfcEmisor = String(mapping.rfc_emisor || '').trim().toUpperCase();
  const patron = String(mapping.patron || '').trim().toLowerCase();
  const codigo = String(mapping.codigo_cuenta || '').trim().toUpperCase();
  const nombre = String(mapping.nombre_cuenta || '').trim().toLowerCase();
  return [rfcEmpresa, tipo, rfcEmisor, patron, codigo, nombre].join('|');
};

export const bankMovementIdentityKey = (movement = {}) => {
  if (movement.fingerprint) return String(movement.fingerprint).toLowerCase();
  if (movement.hash_movimiento) return String(movement.hash_movimiento).toLowerCase();
  const empresa = String(movement.empresa_id || movement.empresa_rfc || '');
  const fecha = String(movement.fecha || '').slice(0, 10);
  const tipo = String(movement.tipo || '').toLowerCase();
  const monto = Number(movement.monto || 0).toFixed(2);
  const referencia = String(movement.referencia || '');
  const descripcion = String(movement.descripcion || '');
  return `${empresa}|${fecha}|${tipo}|${monto}|${referencia}|${descripcion}`.toLowerCase();
};

export const summarizeCoverage = (deviceStorage = {}) => {
  const companies = asArray(deviceStorage.companies).length;
  const invoices = asArray(deviceStorage.invoices).length;
  const bankMovements = asArray(deviceStorage.bankMovements).length;
  const polizas = asArray(deviceStorage.polizas).length;
  const accountMappings = asArray(deviceStorage.accountMappings).length;
  const snapshots = asArray(deviceStorage.snapshots).length;
  const totalRecords = companies + invoices + bankMovements + polizas + accountMappings + snapshots;
  return {
    companies,
    invoices,
    bankMovements,
    polizas,
    accountMappings,
    snapshots,
    totalRecords,
  };
};

export const formatCoverageSummaryMessage = (coverage, { scope = 'device', label = '' } = {}) => {
  const title = scope === 'company'
    ? `Respaldo de ${label || 'negocio'}`
    : 'Respaldo del dispositivo';
  return [
    `${title}`,
    '',
    `Empresas: ${coverage.companies}`,
    `CFDI: ${coverage.invoices}`,
    `Pólizas: ${coverage.polizas}`,
    `Mapeos de cuentas: ${coverage.accountMappings}`,
    `Movimientos bancarios: ${coverage.bankMovements}`,
    `Snapshots: ${coverage.snapshots}`,
    `Total registros: ${coverage.totalRecords}`,
    '',
    '¿Descargar este respaldo JSON?',
  ].join('\n');
};

/**
 * Normalize older backup payloads to the current format version.
 * Does not rewrite IDs; only shapes the document for import.
 */
export const migrateBackupDocument = (raw) => {
  if (!raw || typeof raw !== 'object') {
    throw new Error('El archivo no parece ser un respaldo válido de SmartContable.');
  }

  if (raw.format !== BACKUP_FORMAT) {
    throw new Error('Formato incompatible. Usa un respaldo SmartContable (JSON de dispositivo o empresa).');
  }

  const version = Number(raw.formatVersion || 0);
  if (!SUPPORTED_BACKUP_VERSIONS.includes(version)) {
    throw new Error(
      `Versión de respaldo no soportada (v${version}). Este cliente acepta v${SUPPORTED_BACKUP_VERSIONS.join(', ')}.`,
    );
  }

  const deviceStorage = { ...(raw.deviceStorage || {}) };
  deviceStorage.preferences = deviceStorage.preferences && typeof deviceStorage.preferences === 'object'
    ? deviceStorage.preferences
    : {};
  deviceStorage.snapshots = asArray(deviceStorage.snapshots);
  deviceStorage.companies = asArray(deviceStorage.companies);
  deviceStorage.invoices = asArray(deviceStorage.invoices);
  deviceStorage.bankMovements = asArray(deviceStorage.bankMovements);
  deviceStorage.polizas = asArray(deviceStorage.polizas);
  deviceStorage.accountMappings = asArray(deviceStorage.accountMappings);

  // v1/v2/v3 lacked polizas/accountMappings keys — already defaulted to [].
  const coverage = Array.isArray(raw.coverage) && raw.coverage.length
    ? [...new Set([...raw.coverage, ...BACKUP_COVERAGE_KEYS.filter((key) => asArray(deviceStorage[key]).length > 0)])]
    : BACKUP_COVERAGE_KEYS.filter((key) => key === 'company' || asArray(deviceStorage[key === 'company' ? 'companies' : key]).length >= 0)
      .filter((key) => key !== 'company');

  return {
    ...raw,
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    migratedFromVersion: version,
    coverage: coverage.includes('companies') || coverage.includes('company')
      ? [...new Set(coverage.map((item) => (item === 'company' ? 'companies' : item)).concat(
        deviceStorage.polizas.length ? ['polizas'] : [],
        deviceStorage.accountMappings.length ? ['accountMappings'] : [],
      ))]
      : ['companies', 'invoices', 'bankMovements', 'polizas', 'accountMappings', 'snapshots'],
    deviceStorage,
  };
};

export const buildBackupDocument = ({
  scope = 'device',
  preferences = {},
  snapshots = [],
  companies = [],
  invoices = [],
  bankMovements = [],
  polizas = [],
  accountMappings = [],
  exportedAt = new Date().toISOString(),
} = {}) => {
  const deviceStorage = {
    preferences,
    snapshots: asArray(snapshots),
    companies: asArray(companies),
    invoices: asArray(invoices),
    bankMovements: asArray(bankMovements),
    polizas: asArray(polizas),
    accountMappings: asArray(accountMappings),
  };
  const coverage = summarizeCoverage(deviceStorage);
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    app: 'SmartContable',
    exportedAt,
    scope,
    coverage: BACKUP_COVERAGE_KEYS,
    summary: coverage,
    deviceStorage,
  };
};

/**
 * Plan import without side effects. Used by importDeviceBackup and unit tests.
 * existing* arrays are current local vault records.
 */
export const planBackupImport = (backupInput, existing = {}) => {
  const backup = migrateBackupDocument(backupInput);
  const deviceStorage = backup.deviceStorage;
  const now = existing.now || new Date().toISOString();
  const createId = existing.createId || (() => `id-${Math.random().toString(16).slice(2)}`);

  const existingCompanies = asArray(existing.companies);
  const companyIdMap = new Map();
  const importedCompanies = [];

  asArray(deviceStorage.companies).forEach((company) => {
    if (!company || !company.rfc) return;
    const rfc = String(company.rfc).trim().toUpperCase();
    const found = existingCompanies.find((item) => String(item.rfc || '').toUpperCase() === rfc);
    const localId = found?.id || `local-${rfc}-${createId()}`;
    if (company.id != null) companyIdMap.set(String(company.id), localId);
    importedCompanies.push({
      ...company,
      id: localId,
      rfc,
      local_only: true,
      created_at: found?.created_at || company.created_at || now,
      updated_at: now,
      savedAt: now,
    });
  });

  const knownInvoiceUuids = new Set(
    asArray(existing.invoices).map((invoice) => String(invoice.uuid || '').toUpperCase()).filter(Boolean),
  );
  const importedInvoices = asArray(deviceStorage.invoices)
    .filter((invoice) => invoice && (invoice.uuid || invoice.id))
    .filter((invoice) => {
      const uuid = String(invoice.uuid || '').toUpperCase();
      if (!uuid) return true;
      if (knownInvoiceUuids.has(uuid)) return false;
      knownInvoiceUuids.add(uuid);
      return true;
    })
    .map((invoice) => {
      const sourceCompanyId = String(invoice.empresa_id || '');
      const companyByRfc = importedCompanies.find(
        (company) => String(company.rfc || '').toUpperCase() === String(invoice.empresa_rfc || '').toUpperCase(),
      );
      return {
        ...invoice,
        id: `local-invoice-${createId()}`,
        empresa_id: companyIdMap.get(sourceCompanyId) || companyByRfc?.id || invoice.empresa_id,
        empresa_rfc: String(invoice.empresa_rfc || companyByRfc?.rfc || '').toUpperCase(),
        local_only: true,
        savedAt: now,
        importedAt: now,
      };
    });

  const knownMovementKeys = new Set(
    asArray(existing.bankMovements).map((movement) => bankMovementIdentityKey(movement)).filter(Boolean),
  );
  const importedMovements = asArray(deviceStorage.bankMovements)
    .filter((movement) => movement && (movement.id || movement.fingerprint || movement.hash_movimiento))
    .map((movement) => {
      const empresaId = companyIdMap.get(String(movement.empresa_id)) || movement.empresa_id;
      const empresaRfc = String(movement.empresa_rfc || '').toUpperCase();
      const fingerprint = bankMovementIdentityKey({
        ...movement,
        empresa_id: empresaId,
        empresa_rfc: empresaRfc,
        fingerprint: movement.fingerprint || movement.hash_movimiento || null,
      });
      return {
        ...movement,
        id: `local-bank-${createId()}`,
        empresa_id: empresaId,
        empresa_rfc: empresaRfc,
        fingerprint,
        hash_movimiento: movement.hash_movimiento || null,
        local_only: true,
        savedAt: now,
        importedAt: now,
      };
    })
    .filter((movement) => {
      if (!movement.fingerprint) return true;
      if (knownMovementKeys.has(movement.fingerprint)) return false;
      knownMovementKeys.add(movement.fingerprint);
      return true;
    });

  const knownPolizaKeys = new Set(
    asArray(existing.polizas).map((poliza) => polizaIdentityKey(poliza)).filter(Boolean),
  );
  const importedPolizas = asArray(deviceStorage.polizas)
    .filter((poliza) => poliza && (poliza.tipo || poliza.numero != null || poliza.movimientos))
    .map((poliza) => {
      const sourceCompanyId = String(poliza.empresa_id || '');
      const companyByRfc = importedCompanies.find(
        (company) => String(company.rfc || '').toUpperCase() === String(poliza.empresa_rfc || '').toUpperCase(),
      );
      const empresaId = companyIdMap.get(sourceCompanyId) || companyByRfc?.id || poliza.empresa_id;
      const empresaRfc = String(poliza.empresa_rfc || companyByRfc?.rfc || '').toUpperCase();
      const normalized = {
        ...poliza,
        id: `local-poliza-${createId()}`,
        empresa_id: empresaId,
        empresa_rfc: empresaRfc,
        factura_uuid: poliza.factura_uuid || poliza.cfdi?.uuid || null,
        movimientos: asArray(poliza.movimientos),
        local_only: true,
        savedAt: now,
        importedAt: now,
      };
      normalized.identityKey = polizaIdentityKey(normalized);
      return normalized;
    })
    .filter((poliza) => {
      if (!poliza.identityKey || knownPolizaKeys.has(poliza.identityKey)) return false;
      knownPolizaKeys.add(poliza.identityKey);
      return true;
    });

  const knownMappingKeys = new Set(
    asArray(existing.accountMappings).map((mapping) => accountMappingIdentityKey(mapping)).filter(Boolean),
  );
  const importedMappings = asArray(deviceStorage.accountMappings)
    .filter((mapping) => mapping && (mapping.nombre_cuenta || mapping.codigo_cuenta || mapping.rfc_emisor || mapping.patron))
    .map((mapping) => {
      const sourceCompanyId = String(mapping.empresa_id || '');
      const companyByRfc = importedCompanies.find(
        (company) => String(company.rfc || '').toUpperCase() === String(mapping.empresa_rfc || '').toUpperCase(),
      );
      const empresaId = companyIdMap.get(sourceCompanyId) || companyByRfc?.id || mapping.empresa_id;
      const empresaRfc = String(mapping.empresa_rfc || companyByRfc?.rfc || '').toUpperCase();
      const normalized = {
        ...mapping,
        id: `local-mapping-${createId()}`,
        empresa_id: empresaId,
        empresa_rfc: empresaRfc,
        local_only: true,
        savedAt: now,
        importedAt: now,
      };
      normalized.identityKey = accountMappingIdentityKey(normalized);
      return normalized;
    })
    .filter((mapping) => {
      if (!mapping.identityKey || knownMappingKeys.has(mapping.identityKey)) return false;
      knownMappingKeys.add(mapping.identityKey);
      return true;
    });

  const importedSnapshots = asArray(deviceStorage.snapshots)
    .filter((snapshot) => snapshot?.key)
    .map((snapshot) => ({
      ...snapshot,
      key: `imported:${createId()}:${snapshot.key}`,
      importedAt: now,
    }));

  return {
    backup,
    companyIdMap,
    preferences: deviceStorage.preferences || {},
    importedCompanies,
    importedInvoices,
    importedMovements,
    importedPolizas,
    importedMappings,
    importedSnapshots,
    counts: {
      companies: importedCompanies.length,
      invoices: importedInvoices.length,
      bankMovements: importedMovements.length,
      polizas: importedPolizas.length,
      accountMappings: importedMappings.length,
      snapshots: importedSnapshots.length,
    },
  };
};

/** Round-trip helper for automated export → clear → import count checks. */
export const simulateExportClearImport = (seedStorage) => {
  const exported = buildBackupDocument({
    scope: 'device',
    ...seedStorage,
    exportedAt: '2026-10-01T12:00:00.000Z',
  });
  const emptyExisting = {
    companies: [],
    invoices: [],
    bankMovements: [],
    polizas: [],
    accountMappings: [],
    now: '2026-10-01T12:05:00.000Z',
    createId: (() => {
      let n = 0;
      return () => {
        n += 1;
        return `sim-${n}`;
      };
    })(),
  };
  const planned = planBackupImport(exported, emptyExisting);
  const expected = summarizeCoverage(exported.deviceStorage);
  return {
    exported,
    planned,
    expected,
    matches: {
      companies: planned.counts.companies === expected.companies,
      invoices: planned.counts.invoices === expected.invoices,
      bankMovements: planned.counts.bankMovements === expected.bankMovements,
      polizas: planned.counts.polizas === expected.polizas,
      accountMappings: planned.counts.accountMappings === expected.accountMappings,
      // snapshots are namespaced but count-preserved
      snapshots: planned.counts.snapshots === expected.snapshots,
    },
  };
};
