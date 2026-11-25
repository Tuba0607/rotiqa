import { createAuthClient } from 'better-auth/vue'

/** Better Auth browser client (same-origin /api/auth). */
export const authClient = createAuthClient()

const AUTH_ERRORS: Record<string, string> = {
  USER_ALREADY_EXISTS: 'Bu e-posta adresiyle kayıtlı bir hesap var. Giriş yapmayı deneyin.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Bu e-posta adresiyle kayıtlı bir hesap var. Giriş yapmayı deneyin.',
  INVALID_EMAIL_OR_PASSWORD: 'E-posta veya şifre hatalı.',
  INVALID_EMAIL: 'Geçerli bir e-posta adresi girin.',
  PASSWORD_TOO_SHORT: 'Şifre en az 8 karakter olmalı.',
  PASSWORD_TOO_LONG: 'Şifre en fazla 128 karakter olabilir.',
  INVALID_PASSWORD: 'Mevcut şifreniz hatalı.',
}

/** Turkish message for a Better Auth client error. Never shows raw server text. */
export function authErrorMessage(error: { code?: string, status?: number } | null | undefined): string {
  if (!error) return ''
  if (error.status === 429) return 'Çok fazla deneme yaptınız. Lütfen biraz bekleyip tekrar deneyin.'
  return (error.code && AUTH_ERRORS[error.code]) || 'İşlem tamamlanamadı. Lütfen tekrar deneyin.'
}
