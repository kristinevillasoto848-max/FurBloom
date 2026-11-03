import 'dotenv/config'
import { createApp } from './app.js'
import { pool } from './db.js'
import { startPetUpdateListener } from './events.js'

if (process.env.NODE_ENV === 'production' && !process.env.APP_ORIGIN) {
  throw new Error('APP_ORIGIN must be configured in production.')
}

const port = Number(process.env.PORT || 3001)
const app = createApp(pool)
let stopPetUpdateListener = () => {}

startPetUpdateListener(pool)
  .then((stop) => { stopPetUpdateListener = stop })
  .catch((error) => console.error('Pet update listener could not start:', error.message))

const server = app.listen(port, () => {
  console.log(`FurBloom API listening on http://localhost:${port}`)
})

async function shutdown(signal) {
  console.log(`${signal} received; closing API server.`)
  server.close(async () => {
    stopPetUpdateListener()
    await pool.end()
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))