const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''

export async function apiRequest(path, { body, headers, ...options } = {}) {
  const requestHeaders = new Headers(headers)
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  if (body !== undefined && !isFormData) requestHeaders.set('Content-Type', 'application/json')

  const apiPath = path.startsWith('/api/') ? path : `/api${path}`
  const response = await fetch(`${apiBaseUrl}${apiPath}`, {
    ...options,
    body: body === undefined || isFormData ? body : JSON.stringify(body),
    cache: options.cache || 'no-store',
    credentials: 'same-origin',
    headers: requestHeaders,
  })

  if (response.status === 204) return null
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`)
  return result
}