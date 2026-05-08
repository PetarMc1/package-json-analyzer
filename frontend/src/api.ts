export const API_BASE = (import.meta.env.VITE_API_BASE as string) ?? '';

export function apiUrl(path: string) {
  const base = API_BASE.replace(/\/$/, '');
  const p = String(path).replace(/^\//, '');
  return base ? `${base}/${p}` : `/${p}`;
}
