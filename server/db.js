import 'dotenv/config'
import mysql from 'mysql2/promise'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Configure it to point to your separately managed MySQL database.')
}

const databaseUrl = process.env.DATABASE_URL

const parsed = new URL(databaseUrl)
if (!['mysql:', 'mysql2:'].includes(parsed.protocol) || !parsed.pathname.replace(/^\//, '')) {
  throw new Error('DATABASE_URL must be a MySQL URL that includes a database name.')
}

const nativePool = mysql.createPool({
  host: parsed.hostname,
  port: Number(parsed.port || 3306),
  user: decodeURIComponent(parsed.username || 'root'),
  password: decodeURIComponent(parsed.password || ''),
  database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_MAX || 10),
  queueLimit: 0,
  charset: 'utf8mb4',
  multipleStatements: true,
})

function normalizeResult(result) {
  if (Array.isArray(result)) return { rows: result, rowCount: result.length }
  return { rows: [], rowCount: result?.affectedRows ?? 0, insertId: result?.insertId }
}

async function query(connection, sql, values) {
  const [result] = values.length
    ? await connection.execute(sql, values)
    : await connection.query(sql)
  return normalizeResult(result)
}

export const pool = {
  async query(sql, values = []) {
    return query(nativePool, sql, values)
  },
  async connect() {
    const connection = await nativePool.getConnection()
    return {
      async query(sql, values = []) {
        return query(connection, sql, values)
      },
      async release() {
        connection.release()
      },
      async rollback() {
        await connection.rollback()
      },
      async beginTransaction() {
        await connection.beginTransaction()
      },
      async commit() {
        await connection.commit()
      },
    }
  },
  async end() {
    await nativePool.end()
  },
}

process.on('exit', () => {
  nativePool.end().catch(() => undefined)
})