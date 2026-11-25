/**
 * Domain errors with stable codes. API handlers translate them to HTTP responses with a
 * Turkish user-facing message; technical details are never sent to the client.
 */
export type AppErrorCode
  = | 'UNAUTHENTICATED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'VALIDATION'
    | 'CONFLICT'
    | 'INVITATION_INVALID'
    | 'INVITATION_EXPIRED'
    | 'INVITATION_USED'
    | 'INVITATION_REVOKED'
    | 'INVITATION_EMAIL_MISMATCH'
    | 'INVITATION_ALREADY_MEMBER'

const STATUS: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  INVITATION_INVALID: 404,
  INVITATION_EXPIRED: 410,
  INVITATION_USED: 410,
  INVITATION_REVOKED: 410,
  INVITATION_EMAIL_MISMATCH: 403,
  INVITATION_ALREADY_MEMBER: 409,
}

const DEFAULT_MESSAGE: Record<AppErrorCode, string> = {
  UNAUTHENTICATED: 'Devam etmek için giriş yapın.',
  FORBIDDEN: 'Bu işlem için yetkiniz yok.',
  NOT_FOUND: 'Aradığınız kayıt bulunamadı.',
  VALIDATION: 'Lütfen bilgileri kontrol edin.',
  CONFLICT: 'Bu kayıt zaten mevcut.',
  INVITATION_INVALID: 'Davet bağlantısı geçersiz.',
  INVITATION_EXPIRED: 'Davetin süresi dolmuş. Yeni bir davet isteyin.',
  INVITATION_USED: 'Bu davet daha önce kullanılmış.',
  INVITATION_REVOKED: 'Bu davet iptal edilmiş.',
  INVITATION_EMAIL_MISMATCH: 'Bu davet başka bir e-posta adresine gönderilmiş. Davet edilen hesapla giriş yapın.',
  INVITATION_ALREADY_MEMBER: 'Zaten bu işletmenin üyesisiniz.',
}

export class AppError extends Error {
  readonly status: number

  constructor(
    readonly code: AppErrorCode,
    message: string = DEFAULT_MESSAGE[code],
    readonly fields?: Record<string, string>,
  ) {
    super(message)
    this.name = 'AppError'
    this.status = STATUS[code]
  }
}

/** Prisma unique-constraint violation. */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 'P2002'
}
