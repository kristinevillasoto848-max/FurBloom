import { EventEmitter } from 'node:events'

export const petUpdateEvents = new EventEmitter()
petUpdateEvents.setMaxListeners(0)

export async function publishPetUpdate(_pool, update) {
  petUpdateEvents.emit('pet-update', update)
}

export async function startPetUpdateListener() {
  return () => undefined
}
