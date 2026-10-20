// In development: React dev server proxies or runs on different port
// In production: frontend is served by the same server, so use relative paths
const API_BASE = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:8000';

function getCSRFToken() {
  const name = 'csrftoken';
  const cookies = document.cookie.split(';');
  for (let cookie of cookies) {
    cookie = cookie.trim();
    if (cookie.startsWith(name + '=')) {
      return cookie.substring(name.length + 1);
    }
  }
  return null;
}

export async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const method = (options.method || 'GET').toUpperCase();

  const headers = { ...options.headers };

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers['X-CSRFToken'] = getCSRFToken();
  }

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 403 || response.status === 401) {
    if (!path.startsWith('/api/auth/')) {
      window.location.reload();
    }
  }

  return response;
}

/**
 * Fetch a file from the API and hand it to the browser as a download.
 * The filename comes from the server's Content-Disposition header.
 */
export async function downloadFile(path, fallbackName) {
  const response = await apiFetch(path);
  if (!response.ok) throw new Error('Datei konnte nicht erstellt werden');

  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : fallbackName;

  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
