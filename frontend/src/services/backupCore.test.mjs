import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  buildBackupDocument,
  migrateBackupDocument,
  planBackupImport,
  simulateExportClearImport,
  summarizeCoverage,
} from './backupCore.js';

const seed = {
  preferences: { theme: 'light' },
  companies: [{ id: 'src-1', rfc: 'AAA010101AAA', razon_social: 'Demo SA' }],
  invoices: [
    { id: 'inv-1', uuid: '11111111-1111-1111-1111-111111111111', empresa_id: 'src-1', empresa_rfc: 'AAA010101AAA', total: 100 },
    { id: 'inv-2', uuid: '22222222-2222-2222-2222-222222222222', empresa_id: 'src-1', empresa_rfc: 'AAA010101AAA', total: 200 },
  ],
  bankMovements: [
    {
      id: 'b1',
      empresa_id: 'src-1',
      empresa_rfc: 'AAA010101AAA',
      fecha: '2026-01-10',
      tipo: 'abono',
      monto: 100,
      referencia: 'R1',
      descripcion: 'Pago',
      fingerprint: 'fp-bank-1',
    },
  ],
  polizas: [
    {
      id: 9,
      empresa_id: 'src-1',
      empresa_rfc: 'AAA010101AAA',
      tipo: 'diario',
      numero: 1,
      mes: 1,
      anio: 2026,
      periodo: '2026-01',
      fecha: '2026-01-10',
      total: 100,
      concepto: 'Venta',
      cfdi: { uuid: '11111111-1111-1111-1111-111111111111' },
      movimientos: [
        { cuenta: '105', nombre_cuenta: 'Clientes', debe: 100, haber: 0 },
        { cuenta: '401', nombre_cuenta: 'Ventas', debe: 0, haber: 100 },
      ],
    },
  ],
  accountMappings: [
    {
      id: 3,
      empresa_id: 'src-1',
      empresa_rfc: 'AAA010101AAA',
      tipo_regla: 'rfc',
      rfc_emisor: 'BBB010101BBB',
      nombre_cuenta: 'Papeleria',
      codigo_cuenta: '501-01',
    },
  ],
  snapshots: [{ key: 'GET /empresas/', data: [] }],
};

test('migrateBackupDocument upgrades v2 and fills missing sections', () => {
  const migrated = migrateBackupDocument({
    format: BACKUP_FORMAT,
    formatVersion: 2,
    deviceStorage: {
      companies: seed.companies,
      invoices: seed.invoices,
    },
  });
  assert.equal(migrated.formatVersion, BACKUP_FORMAT_VERSION);
  assert.equal(migrated.migratedFromVersion, 2);
  assert.deepEqual(migrated.deviceStorage.polizas, []);
  assert.deepEqual(migrated.deviceStorage.accountMappings, []);
  assert.equal(migrated.deviceStorage.companies.length, 1);
});

test('migrateBackupDocument rejects unknown format', () => {
  assert.throws(
    () => migrateBackupDocument({ format: 'other', formatVersion: 1 }),
    /Formato incompatible|respaldo válido/,
  );
});

test('export → clear → import preserves entity counts without source IDs', () => {
  const result = simulateExportClearImport(seed);
  assert.equal(result.exported.formatVersion, BACKUP_FORMAT_VERSION);
  assert.deepEqual(result.matches, {
    companies: true,
    invoices: true,
    bankMovements: true,
    polizas: true,
    accountMappings: true,
    snapshots: true,
  });

  // IDs must be regenerated (no dependency on source local ids).
  assert.notEqual(result.planned.importedCompanies[0].id, 'src-1');
  assert.notEqual(result.planned.importedInvoices[0].id, 'inv-1');
  assert.notEqual(result.planned.importedPolizas[0].id, 9);
  assert.equal(result.planned.importedPolizas[0].movimientos.length, 2);
  assert.equal(result.planned.importedCompanies[0].rfc, 'AAA010101AAA');
  assert.equal(result.planned.importedInvoices[0].uuid, '11111111-1111-1111-1111-111111111111');
});

test('import deduplicates by UUID / fingerprint / identity keys', () => {
  const exported = buildBackupDocument(seed);
  const existingCompanyId = 'local-AAA010101AAA-keep';
  const planned = planBackupImport(exported, {
    now: '2026-10-01T15:00:00.000Z',
    createId: (() => {
      let n = 0;
      return () => {
        n += 1;
        return `d-${n}`;
      };
    })(),
    companies: [{ id: existingCompanyId, rfc: 'AAA010101AAA', razon_social: 'Demo SA' }],
    invoices: [{ id: 'keep-inv', uuid: '11111111-1111-1111-1111-111111111111', empresa_id: existingCompanyId }],
    bankMovements: [{ id: 'keep-bank', fingerprint: 'fp-bank-1', empresa_id: existingCompanyId }],
    polizas: [{
      id: 'keep-poliza',
      empresa_id: existingCompanyId,
      empresa_rfc: 'AAA010101AAA',
      tipo: 'diario',
      numero: 1,
      mes: 1,
      anio: 2026,
      periodo: '2026-01',
      fecha: '2026-01-10',
      total: 100,
      cfdi: { uuid: '11111111-1111-1111-1111-111111111111' },
    }],
    accountMappings: [{
      id: 'keep-map',
      empresa_id: existingCompanyId,
      empresa_rfc: 'AAA010101AAA',
      tipo_regla: 'rfc',
      rfc_emisor: 'BBB010101BBB',
      nombre_cuenta: 'Papeleria',
      codigo_cuenta: '501-01',
    }],
  });

  assert.equal(planned.counts.companies, 1);
  assert.equal(planned.importedCompanies[0].id, existingCompanyId);
  assert.equal(planned.counts.invoices, 1); // only the second UUID
  assert.equal(planned.importedInvoices[0].uuid, '22222222-2222-2222-2222-222222222222');
  assert.equal(planned.counts.bankMovements, 0);
  assert.equal(planned.counts.polizas, 0);
  assert.equal(planned.counts.accountMappings, 0);
});

test('summarizeCoverage totals all sections', () => {
  const coverage = summarizeCoverage(seed);
  assert.equal(coverage.companies, 1);
  assert.equal(coverage.invoices, 2);
  assert.equal(coverage.bankMovements, 1);
  assert.equal(coverage.polizas, 1);
  assert.equal(coverage.accountMappings, 1);
  assert.equal(coverage.snapshots, 1);
  assert.equal(coverage.totalRecords, 7);
});
