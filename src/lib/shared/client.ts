/** Browser-side JSON fetch helper that surfaces server error messages. */
export async function apiFetch<T = unknown>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = Array.isArray(data?.details) ? data.details.map((d: { path?: string; message?: string }) => (d.path ? `${d.path}: ` : "") + d.message).join("; ") : "";
    throw new Error([data?.error ?? `Ошибка ${res.status}`, details].filter(Boolean).join(" — "));
  }
  return data as T;
}
