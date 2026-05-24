const BASE_URL = import.meta.env.BASE_URL || "/";

export function publicPath(path) {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const cleanPath = String(path).replace(/^\/+/, "");
  return `${base}${cleanPath}`;
}

export function publicCssUrl(path) {
  return `url('${publicPath(path)}')`;
}
