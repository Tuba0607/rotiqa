interface ApiErrorData {
  code?: string
  message?: string
  fields?: Record<string, string>
}

function dataOf(error: unknown): ApiErrorData | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const data = (error as { data?: unknown }).data
  return typeof data === 'object' && data !== null ? data as ApiErrorData : undefined
}

/** User-facing Turkish message from an API error (messages are produced by server/utils/api.ts). */
export function apiErrorMessage(error: unknown): string {
  if (!error) return ''
  const data = dataOf(error)
  if (data?.message) return data.message
  return 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.'
}

export function apiFieldErrors(error: unknown): Record<string, string> {
  return dataOf(error)?.fields ?? {}
}

export function apiErrorCode(error: unknown): string | undefined {
  return dataOf(error)?.code
}
