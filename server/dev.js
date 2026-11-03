import 'dotenv/config'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const childEnvironment = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: process.env.PORT || '3001',
}

let stopping = false
const children = []

function startService(name, args) {
  const child = spawn(process.execPath, args, { cwd: projectRoot, env: childEnvironment, stdio: 'inherit' })
  children.push(child)
  child.once('error', (error) => {
    console.error(`${name} process failed:`, error.message)
    shutdown(1)
  })
  child.once('exit', (code) => {
    if (!stopping) {
      console.error(`${name} process exited with code ${code}.`)
      shutdown(code || 0)
    }
  })
  return child
}

async function shutdown(exitCode = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
  process.exitCode = exitCode
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

try {
  const api = startService('API', ['--watch', 'server/index.js'])
  const deadline = Date.now() + 30_000
  let apiReady = false
  while (Date.now() < deadline && api.exitCode === null) {
    try {
      const response = await fetch(`http://127.0.0.1:${childEnvironment.PORT}/api/health`)
      if (response.ok) {
        apiReady = true
        break
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  if (!apiReady) throw new Error('API did not become healthy. Check the MySQL connection and API logs.')
  console.log('API is healthy; starting the Vite frontend.')
  startService('Vite', ['node_modules/vite/bin/vite.js'])
} catch (error) {
  console.error('FurBloom development stack failed to start:', error.message)
  await shutdown(1)
}