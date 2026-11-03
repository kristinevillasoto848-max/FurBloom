import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import multer from 'multer'
import { fileTypeFromBuffer } from 'file-type'

export const uploadDirectory = path.resolve(process.env.UPLOAD_DIR || 'uploads')

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 12, fieldSize: 2 * 1024 * 1024 },
})

const allowedTypes = {
  photo: new Set(['image/jpeg', 'image/png', 'image/webp']),
  video: new Set(['video/mp4', 'video/webm']),
}

export async function saveMedia(file, kind) {
  const detected = await fileTypeFromBuffer(file.buffer)
  if (!detected || !allowedTypes[kind]?.has(detected.mime)) {
    const error = new Error(`Unsupported ${kind} file. Use ${kind === 'photo' ? 'JPG, PNG, or WebP' : 'MP4 or WebM'}.`)
    error.status = 400
    throw error
  }

  await mkdir(uploadDirectory, { recursive: true })
  const filename = `${randomUUID()}.${detected.ext}`
  await writeFile(path.join(uploadDirectory, filename), file.buffer, { flag: 'wx' })
  return { url: `/api/media/${filename}`, filename, mimeType: detected.mime }
}

export async function removeMedia(url) {
  const filename = path.basename(url || '')
  if (!/^[0-9a-f-]{36}\.[a-z0-9]+$/i.test(filename)) return
  await unlink(path.join(uploadDirectory, filename)).catch(() => {})
}

export function resolveStoredMedia(url) {
  const filename = path.basename(url || '')
  if (!/^[0-9a-f-]{36}\.[a-z0-9]+$/i.test(filename)) return null
  return path.join(uploadDirectory, filename)
}