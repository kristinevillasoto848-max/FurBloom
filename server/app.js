import { randomUUID } from 'node:crypto'
import argon2 from 'argon2'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import { z } from 'zod'
import { createAuthMiddleware, createSession, hashSessionToken, readCookie, requireRole, sessionCookieName, sessionCookieOptions, verifyPasswordHash } from './auth.js'
import { petUpdateEvents, publishPetUpdate } from './events.js'
import { removeMedia, resolveStoredMedia, saveMedia, upload } from './storage.js'

const idSchema = z.string().uuid()
const normalizeId = (id) => String(id ?? '').trim().toLowerCase()
const appointmentPurposeColumnCache = new WeakMap()
const speciesValues = ['Dog', 'Cat', 'Rabbit', 'Hamster', 'Bird', 'Other']
const petFieldsSchema = z.object({
  name: z.string().trim().min(1).max(100),
  species: z.enum(speciesValues),
  customSpecies: z.string().trim().max(80).optional().nullable(),
  breed: z.string().trim().max(120).optional().nullable(),
  age: z.string().trim().max(80).optional().nullable(),
  gender: z.enum(['Male', 'Female', 'Unknown']).optional().nullable(),
  color: z.string().trim().max(80).optional().nullable(),
})

const validateCustomSpecies = (pet, context) => {
  if (pet.species === 'Other' && !pet.customSpecies?.trim()) {
    context.addIssue({ code: 'custom', path: ['customSpecies'], message: 'Enter the animal species.' })
  }
}

const petSchema = petFieldsSchema.superRefine(validateCustomSpecies)
const petUpdateSchema = petFieldsSchema.partial().superRefine(validateCustomSpecies)

const PET_SELECT = `
  SELECT p.id, p.owner_id AS ownerId, p.name, p.species,
         p.custom_species AS customSpecies, p.breed, p.age,
         p.gender AS sex, p.color, p.photo_url AS image,
         p.created_at AS createdAt, u.name AS ownerName, u.email AS ownerEmail, u.contact AS ownerContact
  FROM pets p JOIN users u ON u.id = p.owner_id
`

function asyncRoute(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next)
}

function parse(schema, input) {
  const result = schema.safeParse(input)
  if (!result.success) {
    const error = new Error(result.error.issues.map((issue) => issue.message).join(' '))
    error.status = 400
    throw error
  }
  return result.data
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, contact: user.contact, address: user.address }
}

function serializePet(pet) {
  return { ...pet, speciesLabel: pet.species === 'Other' ? pet.customSpecies : pet.species }
}

function hasAppointmentPurposeColumn(pool) {
  let availability = appointmentPurposeColumnCache.get(pool)
  if (!availability) {
    availability = pool.query(
      `SELECT 1 AS available
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'purpose'
       LIMIT 1`,
    ).then((result) => result.rows.length > 0).catch((error) => {
      appointmentPurposeColumnCache.delete(pool)
      throw error
    })
    appointmentPurposeColumnCache.set(pool, availability)
  }
  return availability
}

const appointmentPurposePrefix = '[[furbloom-purpose:'
function notesWithPurpose(purpose, notes) {
  return `${appointmentPurposePrefix}${encodeURIComponent(purpose)}]]\n${notes}`
}

function restoreAppointmentPurpose(appointment, purposeColumnExists) {
  if (purposeColumnExists || typeof appointment.notes !== 'string') return appointment
  const marker = appointment.notes.match(/^\[\[furbloom-purpose:([^\]]*)\]\]\n?/)
  if (!marker) return appointment
  return {
    ...appointment,
    purpose: decodeURIComponent(marker[1]),
    notes: appointment.notes.slice(marker[0].length),
  }
}

async function findPet(pool, user, petId) {
  const result = await pool.query(
    `${PET_SELECT}
     WHERE p.id = ? AND p.archived_at IS NULL
       AND (? <> 'owner' OR LOWER(TRIM(p.owner_id)) = LOWER(TRIM(?)))`,
    [petId, user.role, user.id],
  )
  return result.rows[0] || null
}

async function listPets(pool, user) {
  const result = await pool.query(
    `${PET_SELECT}
     WHERE p.archived_at IS NULL AND (? <> 'owner' OR LOWER(TRIM(p.owner_id)) = LOWER(TRIM(?)))
     ORDER BY p.created_at DESC`,
    [user.role, user.id],
  )
  return result.rows.map(serializePet)
}

async function ownerAppointments(pool, user) {
  const purposeColumnExists = await hasAppointmentPurposeColumn(pool)
  const result = await pool.query(
    `SELECT a.id, a.pet_id AS petId, a.owner_id AS ownerId, p.name AS pet,
            u.name AS owner, a.appointment_date AS dateTime, ${purposeColumnExists ? 'a.purpose' : "'' AS purpose"}, a.status,
            a.notes, a.created_at AS createdAt
    FROM appointments a JOIN pets p ON p.id = a.pet_id AND p.archived_at IS NULL
     JOIN users u ON LOWER(TRIM(u.id)) = LOWER(TRIM(a.owner_id))
     WHERE (? <> 'owner' OR LOWER(TRIM(a.owner_id)) = LOWER(TRIM(?)))
    ORDER BY (a.appointment_date < NOW()) ASC, a.appointment_date ASC LIMIT 500`,
    [user.role, user.id],
  )
  return result.rows.map((appointment) => restoreAppointmentPurpose(appointment, purposeColumnExists))
}

async function listMedicalRecords(pool, user, petId) {
  const result = await pool.query(
    `SELECT mr.id, mr.pet_id AS petId, p.name AS pet, mr.checkup_date AS checkupDate,
            mr.checkup_date AS date, mr.reason, mr.diagnosis, mr.treatment,
            mr.veterinarian_name AS veterinarianName, mr.created_at AS createdAt
     FROM medical_records mr JOIN pets p ON p.id = mr.pet_id
     WHERE p.archived_at IS NULL AND (? <> 'owner' OR p.owner_id = ?)
       AND (? IS NULL OR mr.pet_id = ?)
     ORDER BY mr.checkup_date DESC, mr.created_at DESC LIMIT 500`,
    [user.role, user.id, petId || null, petId || null],
  )
  return result.rows
}

async function listVaccinations(pool, user, petId) {
  const result = await pool.query(
    `SELECT v.id, v.pet_id AS petId, p.name AS pet, v.vaccine_name AS vaccine,
            v.date_given AS dateGiven, v.date_given AS given,
            v.next_due_date AS nextDueDate, v.next_due_date AS next,
            v.status, v.created_at AS createdAt
     FROM vaccinations v JOIN pets p ON p.id = v.pet_id
     WHERE p.archived_at IS NULL AND (? <> 'owner' OR p.owner_id = ?)
       AND (? IS NULL OR v.pet_id = ?)
     ORDER BY v.date_given DESC, v.created_at DESC LIMIT 500`,
    [user.role, user.id, petId || null, petId || null],
  )
  return result.rows
}

async function listPetUpdates(pool, user, petId) {
  const result = await pool.query(
    `SELECT pu.id, pu.pet_id AS petId, p.owner_id AS ownerId, p.name AS petName,
            pu.staff_id AS staffId, staff.name AS author, 'Greenfield Veterinary' AS clinic,
            pu.update_type AS type, pu.media_url AS mediaUrl, pu.media_mime_type AS mediaType,
            pu.caption_notes AS note, pu.created_at AS date
     FROM pet_updates pu JOIN pets p ON p.id = pu.pet_id
     JOIN users staff ON staff.id = pu.staff_id
     WHERE p.archived_at IS NULL AND (? <> 'owner' OR LOWER(TRIM(p.owner_id)) = LOWER(TRIM(?)))
       AND (? IS NULL OR pu.pet_id = ?)
     ORDER BY pu.created_at DESC LIMIT 200`,
    [user.role, user.id, petId || null, petId || null],
  )
  return result.rows
}

export function createApp(pool) {
  const app = express()
  const authenticate = createAuthMiddleware(pool)
  const ownerOnly = requireRole('owner')
  const staffOnly = requireRole('staff', 'admin')
  const adminOnly = requireRole('admin')
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false })

  app.disable('x-powered-by')
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1)
  app.use(helmet({ contentSecurityPolicy: false }))
  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: false, limit: '1mb' }))
  const allowedOrigin = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).origin : null
  app.use((request, response, next) => {
    const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
    const origin = request.headers.origin
    let isTrustedDevelopmentOrigin = false
    if (process.env.NODE_ENV !== 'production' && origin) {
      try {
        const parsedOrigin = new URL(origin)
        isTrustedDevelopmentOrigin = parsedOrigin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsedOrigin.hostname)
      } catch {
        isTrustedDevelopmentOrigin = false
      }
    }
    if (isMutation && allowedOrigin && origin !== allowedOrigin && !isTrustedDevelopmentOrigin) {
      return response.status(403).json({ error: 'Request origin is not allowed.' })
    }
    next()
  })

  app.get('/api/health', asyncRoute(async (request, response) => {
    await pool.query('SELECT 1')
    response.json({ status: 'ok' })
  }))

  app.post('/api/auth/register', authLimiter, asyncRoute(async (request, response) => {
    const body = parse(z.object({
      name: z.string().trim().min(1).max(120),
      email: z.string().trim().email().max(254),
      password: z.string().min(12).max(128),
      contact: z.string().trim().max(40).optional().default(''),
      address: z.string().trim().max(240).optional().default(''),
    }), request.body)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const passwordHash = await argon2.hash(body.password, { type: argon2.argon2id })
      const userId = randomUUID()
      await client.query(
        `INSERT INTO users (id, name, email, password_hash, role, contact, address)
         VALUES (?, ?, lower(?), ?, 'owner', ?, ?)`,
        [userId, body.name, body.email, passwordHash, body.contact, body.address],
      )
      const token = await createSession(client, userId)
      await client.query('COMMIT')
      response.cookie(sessionCookieName, token, sessionCookieOptions())
      response.status(201).json({
        user: publicUser({ id: userId, name: body.name, email: body.email.toLowerCase(), role: 'owner', contact: body.contact, address: body.address }),
      })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }))

  app.post('/api/auth/login', authLimiter, asyncRoute(async (request, response) => {
    const body = parse(z.object({ email: z.string().trim().min(1).max(254), password: z.string().min(1).max(128) }), request.body)
    const result = await pool.query(
      `SELECT id, name, email, password_hash AS passwordHash, role, contact, address
       FROM users WHERE lower(email) = lower(?)`,
      [body.email],
    )
    const user = result.rows[0]
    if (!user || !(await verifyPasswordHash(user.passwordHash, body.password))) {
      return response.status(401).json({ error: 'Email or password is incorrect.' })
    }
    const token = await createSession(pool, user.id)
    response.cookie(sessionCookieName, token, sessionCookieOptions())
    response.json({ user: publicUser(user) })
  }))

  app.post('/api/auth/logout', authenticate, asyncRoute(async (request, response) => {
    const token = readCookie(request, sessionCookieName)
    await pool.query('DELETE FROM sessions WHERE token_hash = ?', [hashSessionToken(token)])
    response.clearCookie(sessionCookieName, sessionCookieOptions())
    response.status(204).end()
  }))

  app.get('/api/auth/me', authenticate, (request, response) => response.json({ user: publicUser(request.user) }))

  app.patch('/api/auth/me', authenticate, asyncRoute(async (request, response) => {
    const body = parse(z.object({
      name: z.string().trim().min(1).max(120).optional(),
      email: z.string().trim().email().max(254).optional(),
      contact: z.string().trim().max(40).optional(),
      address: z.string().trim().max(240).optional(),
    }).refine((value) => Object.keys(value).length > 0), request.body)
    await pool.query(
      `UPDATE users SET name = COALESCE(?, name), email = COALESCE(lower(?), email),
         contact = COALESCE(?, contact), address = COALESCE(?, address)
       WHERE id = ?`,
      [body.name ?? null, body.email ?? null, body.contact ?? null, body.address ?? null, request.user.id],
    )
    const result = await pool.query(
      'SELECT id, name, email, role, contact, address FROM users WHERE id = ?',
      [request.user.id],
    )
    response.json({ user: publicUser(result.rows[0]) })
  }))

  app.get('/api/dashboard', authenticate, asyncRoute(async (request, response) => {
    const [pets, appointments, medicalRecords, vaccinations, petUpdates] = await Promise.all([
      listPets(pool, request.user),
      ownerAppointments(pool, request.user),
      listMedicalRecords(pool, request.user),
      listVaccinations(pool, request.user),
      listPetUpdates(pool, request.user),
    ])
    response.json({
      user: publicUser(request.user), pets, appointments, medicalRecords, vaccinations, updates: petUpdates,
    })
  }))

  app.get('/api/events', authenticate, (request, response) => {
    response.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    response.flushHeaders()
    response.write('retry: 5000\n\n')
    const sendHeartbeat = () => response.write(': keepalive\n\n')
    const heartbeat = setInterval(sendHeartbeat, 25_000)
    const onPetUpdate = (update) => {
      if (request.user.role !== 'owner' || normalizeId(update.ownerId) !== normalizeId(request.user.id)) return
      response.write(`event: pet-update\ndata: ${JSON.stringify({ petId: update.petId })}\n\n`)
    }
    petUpdateEvents.on('pet-update', onPetUpdate)
    response.on('close', () => {
      clearInterval(heartbeat)
      petUpdateEvents.off('pet-update', onPetUpdate)
    })
  })

  app.get('/api/pets', authenticate, asyncRoute(async (request, response) => {
    response.json({ pets: await listPets(pool, request.user) })
  }))

  app.get('/api/owners', authenticate, staffOnly, asyncRoute(async (request, response) => {
    const [owners, pets] = await Promise.all([
      pool.query('SELECT id, name, email, contact, address FROM users WHERE role = ? ORDER BY created_at DESC LIMIT 500', ['owner']),
      pool.query(`${PET_SELECT} WHERE p.archived_at IS NULL ORDER BY p.created_at DESC`),
    ])
    const petsByOwner = new Map()
    for (const pet of pets.rows.map(serializePet)) {
      const ownerPets = petsByOwner.get(pet.ownerId) || []
      ownerPets.push(pet)
      petsByOwner.set(pet.ownerId, ownerPets)
    }
    response.json({ owners: owners.rows.map((user) => ({ ...user, pets: petsByOwner.get(user.id) || [] })) })
  }))

  app.post('/api/pets', authenticate, ownerOnly, upload.single('photo'), asyncRoute(async (request, response) => {
    const body = parse(petSchema, request.body)
    const saved = request.file ? await saveMedia(request.file, 'photo') : null
    const petId = randomUUID()
    try {
      await pool.query(
        `INSERT INTO pets (id, owner_id, name, species, custom_species, breed, age, gender, color, photo_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [petId, request.user.id, body.name, body.species, body.species === 'Other' ? body.customSpecies : null,
          body.breed || null, body.age || null, body.gender || 'Unknown', body.color || null, saved?.url || null],
      )
      const pet = await findPet(pool, request.user, petId)
      response.status(201).json({ pet: serializePet(pet) })
    } catch (error) {
      if (saved) await removeMedia(saved.url)
      throw error
    }
  }))

  app.get('/api/pets/:petId', authenticate, asyncRoute(async (request, response) => {
    const petId = parse(idSchema, request.params.petId)
    const pet = await findPet(pool, request.user, petId)
    if (!pet) return response.status(404).json({ error: 'Pet not found.' })
    const [medicalRecords, vaccinations, appointments, updates] = await Promise.all([
      listMedicalRecords(pool, request.user, petId),
      listVaccinations(pool, request.user, petId),
      ownerAppointments(pool, request.user).then((items) => items.filter((item) => item.petId === petId)),
      listPetUpdates(pool, request.user, petId),
    ])
    response.json({ pet: serializePet(pet), medicalRecords, vaccinations, appointments, updates })
  }))

  app.patch('/api/pets/:petId', authenticate, upload.single('photo'), asyncRoute(async (request, response) => {
    const petId = parse(idSchema, request.params.petId)
    if (!['owner', 'staff', 'admin'].includes(request.user.role)) return response.status(403).json({ error: 'Not authorized.' })
    const existing = await findPet(pool, request.user, petId)
    if (!existing) return response.status(404).json({ error: 'Pet not found.' })
    const body = parse(petUpdateSchema, request.body)
    if (!Object.keys(body).length && !request.file) return response.status(400).json({ error: 'Provide at least one field to update.' })
    const nextSpecies = body.species || existing.species
    const nextCustomSpecies = nextSpecies === 'Other' ? body.customSpecies ?? existing.customSpecies : null
    if (nextSpecies === 'Other' && !nextCustomSpecies?.trim()) return response.status(400).json({ error: 'Enter the animal species.' })
    const saved = request.file ? await saveMedia(request.file, 'photo') : null
    try {
      await pool.query(
        `UPDATE pets SET name = ?, species = ?, custom_species = ?, breed = ?,
             age = ?, gender = ?, color = ?, photo_url = ?
         WHERE id = ? AND archived_at IS NULL
           AND (? <> 'owner' OR owner_id = ?)`,
        [body.name ?? existing.name, nextSpecies, nextCustomSpecies,
          body.breed ?? existing.breed, body.age ?? existing.age, body.gender ?? existing.sex,
          body.color ?? existing.color, saved?.url ?? existing.image, petId, request.user.role, request.user.id],
      )
      if (!await findPet(pool, request.user, petId)) {
        if (saved) await removeMedia(saved.url)
        return response.status(404).json({ error: 'Pet not found.' })
      }
      if (saved && existing.image) await removeMedia(existing.image)
      response.json({ pet: serializePet(await findPet(pool, request.user, petId)) })
    } catch (error) {
      if (saved) await removeMedia(saved.url)
      throw error
    }
  }))

  app.delete('/api/pets/:petId', authenticate, asyncRoute(async (request, response) => {
    const petId = parse(idSchema, request.params.petId)
    const result = await pool.query(
      `UPDATE pets SET archived_at = NOW()
       WHERE id = ? AND archived_at IS NULL AND (? <> 'owner' OR owner_id = ?)`,
      [petId, request.user.role, request.user.id],
    )
    if (!result.rowCount) return response.status(404).json({ error: 'Pet not found.' })
    response.status(204).end()
  }))

  app.get('/api/appointments', authenticate, asyncRoute(async (request, response) => {
    response.json({ appointments: await ownerAppointments(pool, request.user) })
  }))

  app.post('/api/appointments', authenticate, asyncRoute(async (request, response) => {
    const body = parse(z.object({
      pet_id: idSchema,
      owner_id: idSchema,
      appointment_date: z.string().datetime(),
      purpose: z.string().trim().min(1).max(160),
      notes: z.string().trim().max(2000).optional().default(''),
    }).strict(), request.body)
    const dateTime = new Date(body.appointment_date)
    if (dateTime.getTime() < Date.now() - 60_000) return response.status(400).json({ error: 'Appointment time must be in the future.' })
    const pet = await findPet(pool, request.user, body.pet_id)
    if (!pet) return response.status(404).json({ error: 'Pet not found.' })
    const appointmentOwnerId = request.user.role === 'owner' ? request.user.id : pet.ownerId
    if (normalizeId(body.owner_id) !== normalizeId(appointmentOwnerId)) {
      return response.status(403).json({ error: 'The selected owner does not match this pet.' })
    }
    const appointmentId = randomUUID()
    const appointmentDate = dateTime.toISOString().slice(0, 23).replace('T', ' ')
    if (await hasAppointmentPurposeColumn(pool)) {
      await pool.query(
        `INSERT INTO appointments (id, pet_id, owner_id, appointment_date, purpose, notes, status)
         VALUES (?, ?, ?, ?, ?, ?, 'Confirmed')`,
        [appointmentId, pet.id, appointmentOwnerId, appointmentDate, body.purpose, body.notes],
      )
    } else {
      await pool.query(
        `INSERT INTO appointments (id, pet_id, owner_id, appointment_date, notes, status)
         VALUES (?, ?, ?, ?, ?, 'Confirmed')`,
        [appointmentId, pet.id, appointmentOwnerId, appointmentDate, notesWithPurpose(body.purpose, body.notes)],
      )
    }
    const appointment = (await ownerAppointments(pool, request.user)).find((item) => item.id === appointmentId)
    if (!appointment) throw new Error('Appointment was saved but could not be loaded.')
    response.status(201).json({ appointment })
  }))

  app.patch('/api/appointments/:appointmentId', authenticate, asyncRoute(async (request, response) => {
    const appointmentId = parse(idSchema, request.params.appointmentId)
    const body = parse(z.object({ status: z.enum(['Pending', 'Confirmed', 'Completed', 'Cancelled']).optional(), notes: z.string().trim().max(2000).optional() }).refine((value) => Object.keys(value).length > 0), request.body)
    if (request.user.role === 'owner' && body.status && body.status !== 'Cancelled') {
      return response.status(403).json({ error: 'Owners may only cancel an appointment.' })
    }
    await pool.query(
      `UPDATE appointments SET status = COALESCE(?, status), notes = COALESCE(?, notes)
       WHERE id = ? AND (? <> 'owner' OR (LOWER(TRIM(owner_id)) = LOWER(TRIM(?)) AND status IN ('Pending', 'Confirmed')))`,
      [body.status || null, body.notes ?? null, appointmentId, request.user.role, request.user.id],
    )
    const appointment = (await ownerAppointments(pool, request.user)).find((item) => item.id === appointmentId)
    if (!appointment) return response.status(404).json({ error: 'Appointment not found or no longer editable.' })
    response.json({ appointment })
  }))

  app.get('/api/medical-records', authenticate, asyncRoute(async (request, response) => {
    const petId = request.query.petId ? parse(idSchema, request.query.petId) : null
    response.json({ medicalRecords: await listMedicalRecords(pool, request.user, petId) })
  }))

  app.post('/api/medical-records', authenticate, staffOnly, asyncRoute(async (request, response) => {
    const body = parse(z.object({
      petId: idSchema,
      checkupDate: z.string().date(),
      reason: z.string().trim().min(1).max(240),
      diagnosis: z.string().trim().max(2000).optional().default(''),
      treatment: z.string().trim().max(2000).optional().default(''),
    }), request.body)
    if (!(await findPet(pool, request.user, body.petId))) return response.status(404).json({ error: 'Pet not found.' })
    await pool.query(
      `INSERT INTO medical_records (id, pet_id, checkup_date, reason, diagnosis, treatment, veterinarian_name)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), body.petId, body.checkupDate, body.reason, body.diagnosis, body.treatment, request.user.name],
    )
    response.status(201).json({ medicalRecords: await listMedicalRecords(pool, request.user, body.petId) })
  }))

  app.get('/api/vaccinations', authenticate, asyncRoute(async (request, response) => {
    const petId = request.query.petId ? parse(idSchema, request.query.petId) : null
    response.json({ vaccinations: await listVaccinations(pool, request.user, petId) })
  }))

  app.post('/api/vaccinations', authenticate, staffOnly, asyncRoute(async (request, response) => {
    const body = parse(z.object({
      petId: idSchema,
      vaccineName: z.string().trim().min(1).max(160),
      dateGiven: z.string().date(),
      nextDueDate: z.string().date().optional().or(z.literal('')),
      status: z.enum(['Completed', 'Due Soon', 'Overdue']).default('Completed'),
    }), request.body)
    if (!(await findPet(pool, request.user, body.petId))) return response.status(404).json({ error: 'Pet not found.' })
    await pool.query(
      `INSERT INTO vaccinations (id, pet_id, vaccine_name, date_given, next_due_date, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [randomUUID(), body.petId, body.vaccineName, body.dateGiven, body.nextDueDate || null, body.status],
    )
    response.status(201).json({ vaccinations: await listVaccinations(pool, request.user, body.petId) })
  }))

  app.get('/api/pet-updates', authenticate, asyncRoute(async (request, response) => {
    const petId = request.query.petId ? parse(idSchema, request.query.petId) : null
    response.json({ updates: await listPetUpdates(pool, request.user, petId) })
  }))

  app.get('/api/pets/:petId/updates', authenticate, asyncRoute(async (request, response) => {
    const petId = parse(idSchema, request.params.petId)
    if (!(await findPet(pool, request.user, petId))) return response.status(404).json({ error: 'Pet not found.' })
    response.json({ updates: await listPetUpdates(pool, request.user, petId) })
  }))

  app.post('/api/pet-updates', authenticate, staffOnly, upload.single('media'), asyncRoute(async (request, response) => {
    const body = parse(z.object({
      petId: idSchema,
      type: z.enum(['Photo', 'Video', 'Note']),
      note: z.string().trim().min(1).max(2000),
    }), request.body)
    if (body.type === 'Note' && request.file) return response.status(400).json({ error: 'Note-only updates cannot include a media file.' })
    if (body.type !== 'Note' && !request.file) return response.status(400).json({ error: 'A photo or video file is required for this update type.' })
    const pet = await findPet(pool, request.user, body.petId)
    if (!pet) return response.status(404).json({ error: 'Pet not found.' })
    const saved = request.file ? await saveMedia(request.file, body.type.toLowerCase()) : null
    const updateId = randomUUID()
    try {
      await pool.query(
        `INSERT INTO pet_updates (id, pet_id, staff_id, update_type, media_url, media_mime_type, caption_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [updateId, pet.id, request.user.id, body.type, saved?.url || null, saved?.mimeType || null, body.note],
      )
      const update = (await listPetUpdates(pool, request.user, pet.id)).find((item) => item.id === updateId)
      await publishPetUpdate(pool, { ownerId: pet.ownerId, petId: pet.id }).catch((error) => {
        console.error('Pet update notification failed:', error.message)
      })
      response.status(201).json({ update })
    } catch (error) {
      if (saved) await removeMedia(saved.url)
      throw error
    }
  }))

  app.get('/api/media/:filename', authenticate, asyncRoute(async (request, response) => {
    const filename = request.params.filename
    if (!/^[0-9a-f-]{36}\.(jpg|jpeg|png|webp|mp4|webm)$/i.test(filename)) {
      return response.status(404).json({ error: 'Media not found.' })
    }
    const url = `/api/media/${filename}`
    const access = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM pets p WHERE p.photo_url = ? AND p.archived_at IS NULL
           AND (? <> 'owner' OR LOWER(TRIM(p.owner_id)) = LOWER(TRIM(?)))
       ) OR EXISTS (
         SELECT 1 FROM pet_updates pu JOIN pets p ON p.id = pu.pet_id
         WHERE pu.media_url = ? AND p.archived_at IS NULL
           AND (? <> 'owner' OR LOWER(TRIM(p.owner_id)) = LOWER(TRIM(?)))
       ) AS allowed,
       (SELECT media_mime_type FROM pet_updates WHERE media_url = ? LIMIT 1) AS mime_type`,
      [url, request.user.role, request.user.id, url, request.user.role, request.user.id, url],
    )
    if (!access.rows[0].allowed) return response.status(404).json({ error: 'Media not found.' })
    const filePath = resolveStoredMedia(url)
    if (!filePath) return response.status(404).json({ error: 'Media not found.' })
    const extension = filename.split('.').pop().toLowerCase()
    const mimeType = access.rows[0].mime_type || ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm' })[extension]
    response.set({ 'Content-Type': mimeType, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=300' })
    response.sendFile(filePath, (error) => {
      if (error && !response.headersSent) response.status(error.statusCode === 404 ? 404 : 500).end()
    })
  }))

  app.get('/api/admin/users', authenticate, adminOnly, asyncRoute(async (request, response) => {
    const result = await pool.query(
      `SELECT id, name, email, role, contact, address, created_at AS createdAt
       FROM users ORDER BY created_at DESC LIMIT 500`,
    )
    response.json({ users: result.rows })
  }))

  app.post('/api/admin/users', authenticate, adminOnly, asyncRoute(async (request, response) => {
    const body = parse(z.object({
      name: z.string().trim().min(1).max(120),
      email: z.string().trim().email().max(254),
      password: z.string().min(12).max(128),
      role: z.enum(['staff', 'admin']),
      contact: z.string().trim().max(40).optional().default(''),
    }), request.body)
    const passwordHash = await argon2.hash(body.password, { type: argon2.argon2id })
    const userId = randomUUID()
    await pool.query(
      `INSERT INTO users (id, name, email, password_hash, role, contact)
       VALUES (?, ?, lower(?), ?, ?, ?)`,
      [userId, body.name, body.email, passwordHash, body.role, body.contact],
    )
    const result = await pool.query(
      `SELECT id, name, email, role, contact, address, created_at AS createdAt
       FROM users WHERE id = ?`,
      [userId],
    )
    response.status(201).json({ user: result.rows[0] })
  }))

  app.use('/api', (request, response) => response.status(404).json({ error: 'API route not found.' }))

  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error)
    if (error.code === 'ER_DUP_ENTRY') return response.status(409).json({ error: 'A record with that value already exists.' })
    if (['ER_NO_REFERENCED_ROW_2', 'ER_CHECK_CONSTRAINT_VIOLATED'].includes(error.code)) {
      return response.status(400).json({ error: 'The submitted data violates a database constraint.' })
    }
    if (error.name === 'MulterError') {
      const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400
      return response.status(status).json({ error: status === 413 ? 'Media files must be 50 MB or smaller.' : error.message })
    }
    if (error.status && error.status < 500) return response.status(error.status).json({ error: error.message })
    console.error('API error:', error)
    response.status(500).json({ error: 'An unexpected server error occurred.' })
  })

  return app
}