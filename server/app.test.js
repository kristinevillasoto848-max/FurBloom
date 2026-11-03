import assert from 'node:assert/strict'
import { test } from 'node:test'
import argon2 from 'argon2'
import request from 'supertest'
import { createApp } from './app.js'
import { verifyPasswordHash } from './auth.js'
import { initializeAdminAccount, updateAdminPassword } from './reset-admin-password.js'

const owner = { id: '11111111-1111-4111-8111-111111111111', name: 'Maria Cruz', email: 'maria@example.com', role: 'owner', contact: '', address: '' }
const staff = { id: '22222222-2222-4222-8222-222222222222', name: 'Dr. Smith', email: 'smith@example.com', role: 'staff', contact: '', address: '' }
const pet = {
  id: '33333333-3333-4333-8333-333333333333', ownerId: owner.id, name: 'Nori', species: 'Cat',
  customSpecies: null, breed: 'Domestic shorthair', age: '2 years', sex: 'Female', color: 'Gray',
  image: null, ownerName: owner.name, ownerEmail: owner.email,
}
const normalizeId = (id) => String(id ?? '').trim().toLowerCase()

function mockPool({ user = owner, pets = [pet], updates = [], appointments = [], passwordHash = null, hasPurposeColumn = true } = {}) {
  const calls = []
  return {
    calls,
    async query(sql, values = []) {
      calls.push({ sql, values })
      if (sql.includes('FROM users WHERE lower(email) = lower(?)')) {
        return { rows: [{ ...user, passwordHash }], rowCount: 1 }
      }
      if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
        return { rows: hasPurposeColumn ? [{ available: 1 }] : [], rowCount: hasPurposeColumn ? 1 : 0 }
      }
      if (sql.includes('INSERT INTO sessions')) return { rows: [], rowCount: 1 }
      if (sql.includes('FROM sessions s JOIN users u')) return { rows: [user], rowCount: 1 }
      if (sql.includes('FROM appointments a JOIN pets p')) {
        const rows = appointments.filter((item) => user.role !== 'owner' || normalizeId(item.ownerId) === normalizeId(user.id))
        return { rows, rowCount: rows.length }
      }
      if (sql.includes('FROM pets p JOIN users u') && sql.includes('WHERE p.id = ?')) {
        const found = pets.find((item) => item.id === values[0] && (user.role !== 'owner' || normalizeId(item.ownerId) === normalizeId(user.id)))
        return { rows: found ? [found] : [], rowCount: found ? 1 : 0 }
      }
      if (sql.includes('INSERT INTO appointments')) {
        const appointmentPet = pets.find((item) => item.id === values[1])
        const hasPurpose = sql.includes('appointment_date, purpose, notes')
        appointments.unshift({
          id: values[0],
          petId: values[1],
          ownerId: values[2],
          dateTime: values[3],
          purpose: hasPurpose ? values[4] : '',
          notes: values[hasPurpose ? 5 : 4],
          status: 'Confirmed',
          pet: appointmentPet?.name,
          owner: user.name,
        })
        return { rows: [], rowCount: 1 }
      }
      if (sql.includes('FROM pets p JOIN users u')) {
        const visible = pets.filter((item) => user.role !== 'owner' || normalizeId(item.ownerId) === normalizeId(user.id))
        return { rows: visible, rowCount: visible.length }
      }
      if (sql.includes('UPDATE pets SET name = ?')) return { rows: [], rowCount: 1 }
      if (sql.includes('INSERT INTO pet_updates')) {
        const updatedPet = pets.find((item) => item.id === values[1])
        updates.unshift({
          id: values[0],
          petId: values[1],
          ownerId: updatedPet?.ownerId,
          petName: updatedPet?.name,
          type: values[3],
          note: values[6],
        })
        return { rows: [], rowCount: 1 }
      }
      if (sql.includes('FROM pet_updates pu JOIN pets p')) {
        const visible = updates.filter((item) => user.role !== 'owner' || normalizeId(item.ownerId) === normalizeId(user.id))
        return { rows: visible, rowCount: visible.length }
      }
      if (sql.includes('DELETE FROM sessions')) return { rows: [], rowCount: 1 }
      return { rows: [], rowCount: 0 }
    },
    async connect() {
      return {
        async query(sql, values = []) {
          calls.push({ sql, values })
          return { rows: [], rowCount: 1 }
        },
        async release() {},
      }
    },
  }
}

const sessionCookie = 'furbloom_session=test-session-token'

test('login rejects placeholder password hashes without a server error', async () => {
  const response = await request(createApp(mockPool({ passwordHash: 'CHANGE_ME' })))
    .post('/api/auth/login')
    .send({ email: 'maria@example.com', password: 'a-secure-password' })

  assert.equal(response.status, 401)
  assert.equal(response.body.error, 'Email or password is incorrect.')
})

test('login accepts a valid Argon2id password hash', async () => {
  const passwordHash = await argon2.hash('a-secure-password', { type: argon2.argon2id })
  const pool = mockPool({ passwordHash })
  const response = await request(createApp(pool))
    .post('/api/auth/login')
    .send({ email: 'maria@example.com', password: 'a-secure-password' })

  assert.equal(response.status, 200)
  assert.equal(response.body.user.id, owner.id)
  assert.ok(pool.calls.some((call) => call.sql.includes('INSERT INTO sessions')))
})

test('invalid or incompatible stored password hashes fail verification safely', async () => {
  assert.equal(await verifyPasswordHash(null, 'password'), false)
  assert.equal(await verifyPasswordHash('placeholder', 'password'), false)
  assert.equal(await verifyPasswordHash('$2b$invalid-bcrypt-hash', 'password'), false)
  assert.equal(await verifyPasswordHash('$argon2id$broken', 'password'), false)
})

test('admin password reset stores a new Argon2id hash for an admin account', async () => {
  let update
  await updateAdminPassword({
    async query(sql, values) {
      update = { sql, values }
      return { rowCount: 1 }
    },
  }, 'ADMIN@furbloom.local', 'a-new-secure-password')

  assert.match(update.sql, /role = 'admin'/)
  assert.equal(update.values[1], 'ADMIN@furbloom.local')
  assert.equal(await argon2.verify(update.values[0], 'a-new-secure-password'), true)
})

test('admin initialization creates a missing account using Argon2id', async () => {
  const calls = []
  const action = await initializeAdminAccount({
    async query(sql, values) {
      calls.push({ sql, values })
      if (sql.includes('SELECT id, role FROM users')) return { rows: [], rowCount: 0 }
      return { rows: [], rowCount: 1 }
    },
  }, 'admin@furbloom.local', 'FurBloom Admin', 'a-new-secure-password')

  assert.equal(action, 'created')
  const insert = calls.find((call) => call.sql.includes('INSERT INTO users'))
  assert.ok(insert)
  assert.equal(insert.values[2], 'admin@furbloom.local')
  assert.equal(await argon2.verify(insert.values[3], 'a-new-secure-password'), true)
})

test('admin initialization does not promote an existing non-admin account', async () => {
  const action = initializeAdminAccount({
    async query(sql) {
      if (sql.includes('SELECT id, role FROM users')) return { rows: [{ id: owner.id, role: 'owner' }], rowCount: 1 }
      assert.fail('No account update should be attempted')
    },
  }, 'maria@example.com', 'Maria Cruz', 'a-new-secure-password')

  await assert.rejects(action, /non-admin account/)
})

test('private APIs reject requests without a session', async () => {
  const response = await request(createApp(mockPool())).get('/api/pets')
  assert.equal(response.status, 401)
})

test('registration creates a user and a MySQL-compatible session', async () => {
  const pool = mockPool()
  const response = await request(createApp(pool))
    .post('/api/auth/register')
    .send({ name: 'Maria Cruz', email: 'MARIA@example.com', password: 'a-secure-password' })

  assert.equal(response.status, 201)
  assert.equal(response.body.user.email, 'maria@example.com')
  assert.ok(response.headers['set-cookie'][0].includes('HttpOnly'))
  assert.ok(pool.calls.some((call) => call.sql.includes('INSERT INTO sessions')))
})

test('state-changing requests require the configured browser origin', async () => {
  const previousOrigin = process.env.APP_ORIGIN
  process.env.APP_ORIGIN = 'https://furbloom.example'
  try {
    const response = await request(createApp(mockPool())).post('/api/auth/login').send({ email: 'maria@example.com', password: 'example-password' })
    assert.equal(response.status, 403)
  } finally {
    if (previousOrigin === undefined) delete process.env.APP_ORIGIN
    else process.env.APP_ORIGIN = previousOrigin
  }
})

test('owners cannot fetch pets owned by another account', async () => {
  const otherPet = { ...pet, ownerId: staff.id }
  const pool = mockPool({ pets: [otherPet] })
  const response = await request(createApp(pool)).get(`/api/pets/${pet.id}`).set('Cookie', sessionCookie)
  assert.equal(response.status, 404)
  assert.match(pool.calls.find((call) => call.sql.includes('WHERE p.id = ?')).sql, /LOWER\(TRIM\(p\.owner_id\)\) = LOWER\(TRIM\(\?\)\)/)
})

test('dashboard returns owner pets when MySQL owner IDs differ only by case', async () => {
  const user = { ...owner, id: 'abcdefab-cdef-4abc-8def-abcdefabcdef' }
  const caseVariantPet = { ...pet, ownerId: user.id.toUpperCase() }
  const pool = mockPool({ user, pets: [caseVariantPet] })

  const response = await request(createApp(pool)).get('/api/dashboard').set('Cookie', sessionCookie)

  assert.equal(response.status, 200)
  assert.deepEqual(response.body.pets.map((item) => item.id), [pet.id])
  assert.match(pool.calls.find((call) => call.sql.includes('FROM pets p JOIN users u')).sql, /LOWER\(TRIM\(p\.owner_id\)\) = LOWER\(TRIM\(\?\)\)/)
})

test('pet list returns owner pets when MySQL owner IDs differ only by case', async () => {
  const user = { ...owner, id: 'abcdefab-cdef-4abc-8def-abcdefabcdef' }
  const caseVariantPet = { ...pet, ownerId: user.id.toUpperCase() }
  const pool = mockPool({ user, pets: [caseVariantPet] })

  const response = await request(createApp(pool)).get('/api/pets').set('Cookie', sessionCookie)

  assert.equal(response.status, 200)
  assert.deepEqual(response.body.pets.map((item) => item.id), [pet.id])
  assert.match(pool.calls.find((call) => call.sql.includes('FROM pets p JOIN users u')).sql, /LOWER\(TRIM\(p\.owner_id\)\) = LOWER\(TRIM\(\?\)\)/)
})

test('staff cannot access administrator-only user management', async () => {
  const response = await request(createApp(mockPool({ user: staff }))).get('/api/admin/users').set('Cookie', sessionCookie)
  assert.equal(response.status, 403)
})

test('staff can post a note update for a registered pet', async () => {
  const pool = mockPool({ user: staff, pets: [pet], updates: [{ id: '44444444-4444-4444-8444-444444444444', petId: pet.id, ownerId: pet.ownerId, petName: pet.name, type: 'Note', note: 'Recovering well.' }] })
  const response = await request(createApp(pool))
    .post('/api/pet-updates')
    .set('Cookie', sessionCookie)
    .send({ petId: pet.id, type: 'Note', note: 'Recovering well.' })
  assert.equal(response.status, 201)
  assert.equal(response.body.update.petId, pet.id)
  assert.ok(pool.calls.some((call) => call.sql.includes('INSERT INTO pet_updates')))
})

test('owner update queries include owner scoping', async () => {
  const user = { ...owner, id: owner.id.toLowerCase() }
  const update = {
    id: '44444444-4444-4444-8444-444444444444',
    petId: pet.id,
    ownerId: user.id.toUpperCase(),
    petName: pet.name,
    type: 'Photo',
    mediaUrl: '/api/media/44444444-4444-4444-8444-444444444444.jpg',
    mediaType: 'image/jpeg',
    note: 'Nori is doing well.',
  }
  const pool = mockPool({ user, updates: [update] })
  const response = await request(createApp(pool)).get('/api/pet-updates').set('Cookie', sessionCookie)
  assert.equal(response.status, 200)
  assert.deepEqual(response.body.updates.map((item) => item.id), [update.id])
  assert.equal(response.body.updates[0].mediaUrl, update.mediaUrl)
  assert.match(pool.calls.find((call) => call.sql.includes('FROM pet_updates pu JOIN pets p')).sql, /LOWER\(TRIM\(p\.owner_id\)\) = LOWER\(TRIM\(\?\)\)/)
})

test('owner dashboard returns staff photo and video updates for pet IDs owned by the account', async () => {
  const user = { ...owner, id: owner.id.toLowerCase() }
  const updates = [{
    id: '44444444-4444-4444-8444-444444444444',
    petId: pet.id,
    ownerId: user.id.toUpperCase(),
    petName: pet.name,
    type: 'Photo',
    mediaUrl: '/api/media/44444444-4444-4444-8444-444444444444.jpg',
    mediaType: 'image/jpeg',
    note: 'Nori is doing well.',
    author: staff.name,
  }]
  const pool = mockPool({ user, pets: [{ ...pet, ownerId: user.id.toUpperCase() }], updates })

  const response = await request(createApp(pool)).get('/api/dashboard').set('Cookie', sessionCookie)

  assert.equal(response.status, 200)
  assert.equal(response.body.updates.length, 1)
  assert.equal(response.body.updates[0].petId, pet.id)
  assert.equal(response.body.updates[0].mediaUrl, updates[0].mediaUrl)
  assert.equal('petUpdates' in response.body, false)
  assert.match(pool.calls.find((call) => call.sql.includes('FROM pet_updates pu JOIN pets p')).sql, /LOWER\(TRIM\(p\.owner_id\)\) = LOWER\(TRIM\(\?\)\)/)
})

test('owners can update only their own pet profiles', async () => {
  const pool = mockPool()
  const response = await request(createApp(pool))
    .patch(`/api/pets/${pet.id}`)
    .set('Cookie', sessionCookie)
    .field('name', 'Nori the Cat')
    .field('species', 'Cat')
  assert.equal(response.status, 200)
  assert.equal(response.body.pet.id, pet.id)
  assert.ok(pool.calls.some((call) => call.sql.includes('UPDATE pets SET name = ?') && call.sql.includes('owner_id = ?')))
})

test('new owner appointments are created as confirmed', async () => {
  const pool = mockPool()
  const response = await request(createApp(pool))
    .post('/api/appointments')
    .set('Cookie', sessionCookie)
    .send({
      pet_id: pet.id,
      owner_id: owner.id,
      appointment_date: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      purpose: 'General Checkup',
      notes: '',
    })

  assert.equal(response.status, 201)
  assert.equal(response.body.appointment.status, 'Confirmed')
  const insert = pool.calls.find((call) => call.sql.includes('INSERT INTO appointments'))
  assert.ok(insert)
  const insertedColumns = insert.sql.match(/INSERT INTO appointments \(([^)]+)\)/)?.[1]
    .split(',')
    .map((column) => column.trim())
  assert.deepEqual(insertedColumns, ['id', 'pet_id', 'owner_id', 'appointment_date', 'purpose', 'notes', 'status'])
  assert.equal(insert.values.length, 6)
  assert.match(insert.sql, /status\)\s+VALUES \(\?, \?, \?, \?, \?, \?, 'Confirmed'\)/)
})

test('simple booking payload with exact field names is saved as confirmed', async () => {
  const pool = mockPool()
  const future = new Date(Date.now() + 60 * 60 * 1000)
  const response = await request(createApp(pool))
    .post('/api/appointments')
    .set('Cookie', sessionCookie)
    .send({
      pet_id: pet.id,
      owner_id: owner.id,
      appointment_date: future.toISOString(),
      purpose: 'General Checkup',
      notes: 'Simple booking form payload',
    })

  assert.equal(response.status, 201)
  assert.equal(response.body.appointment.status, 'Confirmed')
  const insert = pool.calls.find((call) => call.sql.includes('INSERT INTO appointments'))
  assert.ok(insert)
  assert.equal(insert.values[1], pet.id)
  assert.equal(insert.values[2], owner.id)
  assert.equal(insert.values[3], future.toISOString().slice(0, 23).replace('T', ' '))
  assert.equal(insert.values[4], 'General Checkup')
  assert.equal(insert.values[5], 'Simple booking form payload')
})

test('booking saves and returns purpose when appointments table has no purpose column', async () => {
  const pool = mockPool({ hasPurposeColumn: false })
  const response = await request(createApp(pool))
    .post('/api/appointments')
    .set('Cookie', sessionCookie)
    .send({
      pet_id: pet.id,
      owner_id: owner.id,
      appointment_date: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      purpose: 'Vaccination',
      notes: 'Bring the vaccination card.',
    })

  assert.equal(response.status, 201)
  assert.equal(response.body.appointment.status, 'Confirmed')
  assert.equal(response.body.appointment.purpose, 'Vaccination')
  assert.equal(response.body.appointment.notes, 'Bring the vaccination card.')
  const insert = pool.calls.find((call) => call.sql.includes('INSERT INTO appointments'))
  assert.match(insert.sql, /appointment_date, notes, status/)
  assert.doesNotMatch(insert.sql, /appointment_date, purpose, notes/)
  assert.match(insert.values[4], /^\[\[furbloom-purpose:Vaccination\]\]\n/)
})

test('appointment booking rejects extra fields outside the booking contract', async () => {
  const pool = mockPool()
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const response = await request(createApp(pool))
    .post('/api/appointments')
    .set('Cookie', sessionCookie)
    .send({
      pet_id: pet.id,
      owner_id: owner.id,
      appointment_date: future,
      notes: '',
      purpose: 'General Checkup',
      service_type: 'Legacy field',
    })

  assert.equal(response.status, 400)
  assert.match(response.body.error, /Unrecognized key/)
  assert.equal(pool.calls.some((call) => call.sql.includes('INSERT INTO appointments')), false)
})

test('appointment booking cannot assign a different owner', async () => {
  const pool = mockPool()
  const response = await request(createApp(pool))
    .post('/api/appointments')
    .set('Cookie', sessionCookie)
    .send({
      pet_id: pet.id,
      owner_id: staff.id,
      appointment_date: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      purpose: 'Consultation',
      notes: '',
    })

  assert.equal(response.status, 403)
  assert.equal(pool.calls.some((call) => call.sql.includes('INSERT INTO appointments')), false)
})
test('appointment owner listing handles case differences in owner IDs', async () => {
  const user = { ...owner, id: owner.id.toLowerCase() }
  const appointment = {
    id: '55555555-5555-4555-8555-555555555555',
    petId: pet.id,
    ownerId: user.id.toUpperCase(),
    pet: pet.name,
    owner: user.name,
    dateTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    purpose: 'Routine checkup',
    status: 'Confirmed',
    notes: '',
  }
  const pool = mockPool({ user, pets: [{ ...pet, ownerId: user.id.toUpperCase() }], appointments: [appointment] })

  const response = await request(createApp(pool)).get('/api/appointments').set('Cookie', sessionCookie)

  assert.equal(response.status, 200)
  assert.deepEqual(response.body.appointments.map((item) => item.id), [appointment.id])
  const listingQuery = pool.calls.find((call) => call.sql.includes('FROM appointments a JOIN pets p'))
  assert.match(listingQuery.sql, /a\.purpose/)
  assert.match(listingQuery.sql, /a\.appointment_date AS dateTime/)
  assert.match(listingQuery.sql, /ORDER BY \(a\.appointment_date < NOW\(\)\) ASC, a\.appointment_date ASC/)
  assert.match(listingQuery.sql, /LOWER\(TRIM\(a\.owner_id\)\) = LOWER\(TRIM\(\?\)\)/)
  assert.match(listingQuery.sql, /LOWER\(TRIM\(u\.id\)\) = LOWER\(TRIM\(a\.owner_id\)\)/)
})

test('owner booking stores the authenticated owner ID and is returned in appointments list', async () => {
  const user = { ...owner, id: owner.id.toLowerCase() }
  const pets = [{ ...pet, ownerId: user.id.toUpperCase() }]
  const pool = mockPool({ user, pets })
  const created = await request(createApp(pool))
    .post('/api/appointments')
    .set('Cookie', sessionCookie)
    .send({
      pet_id: pet.id,
      owner_id: user.id,
      appointment_date: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      purpose: 'Consultation',
      notes: 'Annual visit',
    })

  assert.equal(created.status, 201)
  assert.equal(created.body.appointment.ownerId, user.id)
  const insert = pool.calls.find((call) => call.sql.includes('INSERT INTO appointments'))
  assert.equal(insert.values[2], user.id)
  assert.equal(insert.values[4], 'Consultation')
  assert.equal(insert.values[5], 'Annual visit')

  const listed = await request(createApp(pool)).get('/api/appointments').set('Cookie', sessionCookie)
  assert.equal(listed.status, 200)
  assert.equal(listed.body.appointments.length, 1)
  assert.equal(listed.body.appointments[0].id, created.body.appointment.id)
})

test('appointment booking rejects past dates before writing to the database', async () => {
  const pool = mockPool()
  const response = await request(createApp(pool))
    .post('/api/appointments')
    .set('Cookie', sessionCookie)
    .send({
      pet_id: pet.id,
      owner_id: owner.id,
      appointment_date: new Date(Date.now() - 10 * 60_000).toISOString(),
      purpose: 'General Checkup',
      notes: '',
    })

  assert.equal(response.status, 400)
  assert.equal(response.body.error, 'Appointment time must be in the future.')
  assert.equal(pool.calls.some((call) => call.sql.includes('INSERT INTO appointments')), false)
})