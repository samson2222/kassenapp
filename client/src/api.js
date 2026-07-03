async function request(url, method = 'GET', data) {
  const opts = { method, headers: {} };
  if (data !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(data);
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw Object.assign(new Error(err.error || `HTTP ${res.status}`), { status: res.status });
  }
  return res.json();
}

export const api = {
  get:   (url)       => request(url),
  post:  (url, data) => request(url, 'POST',  data),
  put:   (url, data) => request(url, 'PUT',   data),
  patch: (url, data) => request(url, 'PATCH', data),
};
