import { createHash, randomBytes, randomUUID } from 'node:crypto'
import argon2 from 'argon2'

export const sessionCookieName = 'furbloom_session'
const sessionDurationMs = 7 * 24 * 60 * 60 * 1000

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

export async function verifyPasswordHash(passwordHash, password) {
  if (typeof passwordHash !== 'string' || passwordHash.length > 512 || !passwordHash.startsWith('$argon2')) {
    return false
  }

  try {
    return await argon2.verify(passwordHash, password)
  } catch {
    return false
  }
}

export function readCookie(request, name) {
  const cookie = request.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
  return cookie ? cookie.slice(name.length + 1) : null
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: sessionDurationMs,
  }
}

export async function createSession(pool, userId) {
  const token = randomBytes(32).toString('base64url')
  await pool.query(
    'INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(3), INTERVAL 7 DAY))',
    [randomUUID(), userId, hashSessionToken(token)],
  )
  return token
}

export function requireRole(...roles) {
  return function authorize(request, response, next) {
    if (!request.user || !roles.includes(request.user.role)) {
      return response.status(403).json({ error: 'Not authorized.' })
    }
    next()
  }
}

export function createAuthMiddleware(pool) {
  return async function authenticate(request, response, next) {
    try {
      const token = readCookie(request, sessionCookieName)
      if (!token) return response.status(401).json({ error: 'Authentication required.' })

      const result = await pool.query(
        `SELECT u.id, u.name, u.email, u.role, u.contact, u.address
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > NOW()`,
        [hashSessionToken(token)],
      )

      if (!result.rows.length) return response.status(401).json({ error: 'Session expired. Please log in again.' })

      request.user = result.rows[0]
      next()
    } catch (error) {
      next(error)
    }
  }
}
