import argon2 from 'argon2'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createInterface, emitKeypressEvents } from 'node:readline'

export async function updateAdminPassword(database, email, password) {
  const normalizedEmail = typeof email === 'string' ? email.trim() : ''
  if (!normalizedEmail) throw new Error('An admin email address is required.')
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new Error('The password must be between 12 and 128 characters.')
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id })
  const result = await database.query(
    `UPDATE users SET password_hash = ?
     WHERE lower(email) = lower(?) AND role = 'admin'`,
    [passwordHash, normalizedEmail],
  )
  if (result.rowCount !== 1) {
    throw new Error('No admin account was updated. Check that the email belongs to an admin.')
  }
}

export async function initializeAdminAccount(database, email, name, password) {
  const normalizedEmail = typeof email === 'string' ? email.trim() : ''
  const normalizedName = typeof name === 'string' ? name.trim() : ''
  if (!normalizedEmail) throw new Error('An admin email address is required.')
  if (!normalizedName) throw new Error('An admin name is required when creating an account.')
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new Error('The password must be between 12 and 128 characters.')
  }

  const existing = await database.query(
    'SELECT id, role FROM users WHERE lower(email) = lower(?)',
    [normalizedEmail],
  )
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id })
  if (existing.rows.length) {
    if (existing.rows[0].role !== 'admin') {
      throw new Error('That email belongs to a non-admin account; no changes were made.')
    }
    await database.query(
      'UPDATE users SET password_hash = ? WHERE id = ? AND role = ?',
      [passwordHash, existing.rows[0].id, 'admin'],
    )
    return 'updated'
  }

  await database.query(
    `INSERT INTO users (id, name, email, password_hash, role, contact, address)
     VALUES (?, ?, lower(?), ?, 'admin', '', '')`,
    [randomUUID(), normalizedName, normalizedEmail, passwordHash],
  )
  return 'created'
}

function promptLine(question) {
  const terminal = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolveAnswer) => {
    terminal.question(question, (answer) => {
      terminal.close()
      resolveAnswer(answer)
    })
  })
}

function promptPassword(question) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Run this command from an interactive terminal to enter the password securely.')
  }

  emitKeypressEvents(process.stdin)
  process.stdout.write(question)
  process.stdin.setRawMode(true)
  process.stdin.resume()

  return new Promise((resolveAnswer, rejectAnswer) => {
    let password = ''
    const finish = (error) => {
      process.stdin.off('keypress', onKeypress)
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdout.write('\n')
      if (error) rejectAnswer(error)
      else resolveAnswer(password)
    }
    const onKeypress = (character, key = {}) => {
      if (key.ctrl && key.name === 'c') {
        finish(new Error('Password reset cancelled.'))
      } else if (key.name === 'return' || key.name === 'enter') {
        finish()
      } else if (key.name === 'backspace' || key.name === 'delete') {
        if (password.length) {
          password = password.slice(0, -1)
          process.stdout.write('\b \b')
        }
      } else if (character && !key.ctrl && !key.meta) {
        password += character
        process.stdout.write('*')
      }
    }
    process.stdin.on('keypress', onKeypress)
  })
}

async function main() {
  const { pool } = await import('./db.js')
  try {
    const email = await promptLine('Admin email: ')
    const name = await promptLine('Admin name (used only when creating the account): ')
    const password = await promptPassword('New password (input hidden): ')
    const action = await initializeAdminAccount(pool, email, name, password)
    console.log(`Admin account ${action}. Sign in using the entered password.`)
  } finally {
    await pool.end()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Admin password reset failed: ${error.message}`)
    process.exitCode = 1
  })
}
