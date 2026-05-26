/**
 * Trigger a browser download of `text` as a file named `filename`.
 * Uses Blob + ObjectURL + a temporary anchor click. Cleans up after.
 */
export function download(text, filename, mimeType = 'application/octet-stream') {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (a.parentNode) document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}
