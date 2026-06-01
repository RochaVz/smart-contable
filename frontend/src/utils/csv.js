const sanitizeCsvValue = (value) => {
  if (value === null || value === undefined) return '';

  const stringValue = String(value);
  if (/^[=+\-@\t\r]/.test(stringValue)) {
    return `'${stringValue}`;
  }

  return stringValue;
};

export const downloadCsv = (filename, rows) => {
  if (!rows.length) return;

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((header) => `"${sanitizeCsvValue(row[header]).replace(/"/g, '""')}"`)
        .join(',')
    ),
  ];

  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
