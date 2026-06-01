export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const filenameFromContentDisposition = (header) => {
  if (!header) return null;
  const match = /filename="?([^";\n]+)"?/i.exec(header);
  return match ? match[1].trim() : null;
};
