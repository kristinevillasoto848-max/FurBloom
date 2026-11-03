import { useState } from 'react'
import { Camera, Check, Heart, MessageCircle, PawPrint, Play, Stethoscope, Video } from 'lucide-react'

const filters = ['All updates', 'Photos', 'Video', 'Notes']

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function UpdateTypeIcon({ type }) {
  if (type === 'Photo') return <Camera size={13} />
  if (type === 'Video') return <Video size={13} />
  return <MessageCircle size={13} />
}

function normalizeUpdate(update) {
  return {
    ...update,
    petId: update.petId ?? update.pet_id,
    petName: update.petName ?? update.pet_name,
    mediaUrl: update.mediaUrl ?? update.media_url,
    mediaType: update.mediaType ?? update.media_mime_type,
    posterUrl: update.posterUrl ?? update.poster_url,
    note: update.note ?? update.caption_notes ?? '',
    date: update.date ?? update.createdAt ?? update.created_at,
  }
}

export default function PetStatusUpdates({ pets = [], updates = [] }) {
  const [filter, setFilter] = useState('All updates')
  const [likedUpdates, setLikedUpdates] = useState([])
  const registeredPetIds = new Set(pets.map((pet) => pet.id ?? pet.petId ?? pet.pet_id)
    .filter(Boolean)
    .map((id) => String(id).trim().toLowerCase()))
  const ownerUpdates = updates.map(normalizeUpdate)
    .filter((update) => registeredPetIds.has(String(update.petId || '').trim().toLowerCase()))
  const visibleUpdates = ownerUpdates.filter((update) => filter === 'All updates' || filter === update.type || `${update.type}s` === filter)

  const toggleLike = (id) => {
    setLikedUpdates((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  return (
    <section className="status-feed" aria-labelledby="status-feed-title">
      <div className="status-feed-heading">
        <div>
          <p className="eyebrow">A NOTE FROM YOUR CARE TEAM</p>
          <h2 id="status-feed-title">Pet Status Updates <span>Fresh from the clinic</span></h2>
        </div>
        <span className="feed-source"><span /> Greenfield Veterinary</span>
      </div>
      {ownerUpdates.length === 0 ? <div className="status-feed-empty"><PawPrint size={23} /><b>No clinic updates yet</b><span>Updates will appear here when the care team shares a photo, video, or note for your pets.</span></div> : <>
        <div className="status-feed-filters" role="group" aria-label="Filter pet updates">
          {filters.map((item) => <button key={item} className={filter === item ? 'selected' : ''} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}
        </div>
        <div className="status-update-grid">
          {visibleUpdates.map((update) => {
          const liked = likedUpdates.includes(update.id)
          return (
            <article className="status-update-card" key={update.id}>
              <header className="update-author">
                <span className="update-avatar"><Stethoscope size={15} /></span>
                <span className="update-byline"><b>{update.author}</b><small>{update.clinic} · {formatDate(update.date)}</small></span>
                <span className="update-pet"><PawPrint size={12} /> {update.petName}</span>
              </header>
              <p className="update-note">{update.note}</p>
              {update.type === 'Video' ? (
                <div className="update-media video-media">
                  <video controls playsInline preload="metadata" poster={update.posterUrl} aria-label={`${update.petName} video update`}>
                    <source src={update.mediaUrl} type={update.mediaType || 'video/mp4'} />
                  </video>
                  <span className="video-duration"><Play size={11} fill="currentColor" /> VIDEO UPDATE</span>
                </div>
              ) : update.type === 'Photo' ? (
                <figure className="update-media">
                  <img src={update.mediaUrl} alt={`${update.petName} care update`} loading="lazy" />
                  <figcaption><Camera size={12} /> Photo update for {update.petName}</figcaption>
                </figure>
              ) : (
                <div className="care-note-media"><span><Check size={15} /></span><div><b>Care progress note</b><small>Shared by {update.author}</small></div></div>
              )}
              <footer className="update-actions">
                <button className={liked ? 'liked' : ''} aria-pressed={liked} onClick={() => toggleLike(update.id)}><Heart size={15} fill={liked ? 'currentColor' : 'none'} /> {liked ? 'Liked' : 'Helpful'}</button>
                <span><UpdateTypeIcon type={update.type} /> {update.type}</span>
              </footer>
            </article>
          )
          })}
        </div>
      </>}
    </section>
  )
}