import { useEffect, useState } from 'react'
import {
  ArrowRight, CalendarDays, Check, Clock3, FilePlus2, PawPrint,
  ShieldCheck, Stethoscope, Syringe, Upload, UserRound, Users,
} from 'lucide-react'

const petImages = {
  Dog: 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=500&q=85',
  Cat: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=500&q=85',
  Other: 'https://images.unsplash.com/photo-1558944351-cf6bcf1e14d8?auto=format&fit=crop&w=500&q=85',
}

function Field({ label, name, placeholder, type = 'text', required = false, defaultValue = '', minLength, min, onChange }) {
  return <label className="field"><span>{label}</span><input name={name} type={type} placeholder={placeholder} defaultValue={defaultValue} required={required} minLength={minLength} min={min} onChange={onChange} /></label>
}

function getLocalDateTimeValues() {
  const now = new Date()
  const minimum = new Date(now.getTime() + 2 * 60_000)
  minimum.setMinutes(minimum.getMinutes() + 1)
  minimum.setSeconds(0, 0)
  const localValue = (date) => {
    const pad = (value) => String(value).padStart(2, '0')
    return {
      date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    }
  }
  return { today: localValue(now).date, earliestTime: localValue(minimum).time }
}

function SectionHeading({ title, action, onClick }) {
  return <div className="section-heading"><h2>{title}</h2>{action && <button onClick={onClick}>{action}<ArrowRight size={14} /></button>}</div>
}

function StatusTag({ status }) {
  return <span className={`status-tag ${status === 'Confirmed' || status === 'Completed' || status === 'Active' ? 'status-green' : status === 'Pending' || status === 'Due Soon' ? 'status-amber' : 'status-red'}`}><i />{status}</span>
}

function EmptyState({ icon: Icon, title, detail }) {
  return <div className="empty-state"><Icon size={27} /><b>{title}</b><span>{detail}</span></div>
}

function PetCard({ pet, openPet }) {
  return <article className="pet-card"><button className="pet-card-photo" onClick={() => openPet(pet)}><img src={pet.image} alt={pet.name} /></button><div className="pet-card-content"><div><h3>{pet.name}</h3><p>{pet.breed}</p><span>{pet.sex} <i /> {pet.age}</span></div><button className="button button-small button-outline" onClick={() => openPet(pet)}>View profile</button></div></article>
}

function AppointmentTable({ appointments }) {
  return <div className="table-scroll"><table><thead><tr><th>Date</th><th>Purpose</th><th>Status</th></tr></thead><tbody>{appointments.map((appointment, index) => <tr key={`${appointment.date}-${index}`}><td>{appointment.date}<small>{appointment.time}</small></td><td>{appointment.purpose}</td><td><StatusTag status={appointment.status} /></td></tr>)}</tbody></table>{appointments.length === 0 && <EmptyState icon={CalendarDays} title="No appointments yet" detail="Scheduled visits for this pet will appear here." />}</div>
}

function RecordsTable({ records }) {
  return <section className="surface-section full-table-section"><div className="table-toolbar"><div className="filter-tabs"><button className="filter-active">Medical records</button></div></div><div className="table-scroll"><table><thead><tr><th>Date</th><th>Reason</th><th>Diagnosis</th><th>Treatment</th></tr></thead><tbody>{records.map((record, index) => <tr key={`${record.date}-${index}`}><td>{record.date}</td><td>{record.reason}</td><td>{record.diagnosis}</td><td>{record.treatment}</td></tr>)}</tbody></table>{records.length === 0 && <EmptyState icon={FilePlus2} title="No medical records yet" detail="Care records for this pet will appear here." />}</div></section>
}

function VaccinesTable({ vaccines }) {
  return <section className="surface-section full-table-section"><div className="table-toolbar"><div className="filter-tabs"><button className="filter-active">Vaccination history</button></div></div><div className="table-scroll"><table><thead><tr><th>Vaccine</th><th>Date given</th><th>Next vaccination</th><th>Status</th></tr></thead><tbody>{vaccines.map((vaccine, index) => <tr key={`${vaccine.given}-${index}`}><td>{vaccine.vaccine}</td><td>{vaccine.given}</td><td>{vaccine.next || 'Not scheduled'}</td><td><StatusTag status={vaccine.status} /></td></tr>)}</tbody></table>{vaccines.length === 0 && <EmptyState icon={Syringe} title="No vaccinations recorded" detail="Vaccine history for this pet will appear here." />}</div></section>
}

export function PetRegistrationView({ onSubmit, onSkip, account }) {
  const [species, setSpecies] = useState('Dog')
  return <div className="registration-layout"><header className="registration-header"><span className="brand"><PawPrint size={24} fill="currentColor" /> FurBloom</span><span>PET REGISTRATION</span></header><div className="registration-wrap"><div className="registration-intro"><span className="eyebrow">A NEW LITTLE FRIEND</span><h1>Let’s meet your pet.</h1><p>Add their details to get their care journey started. You can add more pets any time.</p></div><form className="registration-form" onSubmit={onSubmit}><div className="form-section-heading"><span className="section-icon"><PawPrint size={19} /></span><div><h2>Pet information</h2><p>Tell us a little about your companion.</p></div></div><div className="form-grid"><Field label="Pet name" name="name" placeholder="e.g. Max" required /><label className="field"><span>Species</span><select name="species" value={species} onChange={(event) => setSpecies(event.target.value)}><option>Dog</option><option>Cat</option><option>Rabbit</option><option>Hamster</option><option>Bird</option><option>Other</option></select></label>{species === 'Other' && <Field label="Specify Animal" name="animal" placeholder="e.g. Turtle, iguana" required />}<Field label="Breed" name="breed" placeholder="e.g. Golden Retriever" /><Field label="Date of birth / Age" name="age" placeholder="e.g. 3 years" /><label className="field"><span>Sex</span><select name="sex" defaultValue="Male"><option>Male</option><option>Female</option></select></label><Field label="Color" name="color" placeholder="e.g. Golden" /></div><label className="field photo-field"><span>Pet photo <small>Optional</small></span><span className="upload-box"><Upload size={20} /><b>Choose a photo</b><small>JPG or PNG, up to 10 MB</small><input name="photo" type="file" accept="image/*" /></span></label><div className="form-section-heading owner-section"><span className="section-icon"><UserRound size={18} /></span><div><h2>Owner information</h2><p>Contact details for this pet’s primary caregiver.</p></div></div><div className="form-grid"><Field label="Owner name" name="owner" placeholder="Full name" defaultValue={account.fullName} required /><Field label="Contact number" name="phone" placeholder="09XX XXX XXXX" defaultValue={account.contact} required /></div><div className="form-footer"><button type="button" className="button button-quiet" onClick={onSkip}>Cancel</button><button className="button button-primary" type="submit">Save pet <ArrowRight size={16} /></button></div></form></div></div>
}

export function OwnerDashboardView({ account, pets, appointments, openPet, navigate, onAddPet }) {
  const next = appointments[0]
  return <><div className="welcome-banner"><div><span className="eyebrow">YOUR PET CARE SPACE</span><h2>Welcome, {account.fullName || 'Pet parent'}!</h2><p>Here’s a little look at your pets’ care today.</p></div><div className="welcome-illustration"><PawPrint size={48} fill="currentColor" /></div></div><div className="stat-grid owner-stats"><div className="stat-card"><span className="stat-icon mint"><PawPrint size={19} /></span><div className="stat-copy"><span>My pets</span><b>{pets.length}</b><small>Registered companions</small></div></div><div className="stat-card"><span className="stat-icon peach"><CalendarDays size={19} /></span><div className="stat-copy"><span>Upcoming visits</span><b>{appointments.length}</b><small>Across your pets</small></div></div><div className="stat-card"><span className="stat-icon rose"><Syringe size={19} /></span><div className="stat-copy"><span>Vaccinations due</span><b>0</b><small>Nothing scheduled</small></div></div></div><div className="content-grid dashboard-grid"><section className="surface-section"><SectionHeading title="My pets" action={pets.length ? 'View all' : 'Add a pet'} onClick={pets.length ? () => navigate('my-pets') : onAddPet} />{pets.length ? <div className="pet-card-grid">{pets.slice(0, 2).map((pet) => <PetCard key={pet.id || pet.name} pet={pet} openPet={openPet} />)}</div> : <EmptyState icon={PawPrint} title="Your pet list is empty" detail="Add your first pet to start tracking their care." />}</section><section className="surface-section appointment-spotlight"><SectionHeading title="Coming up" action="All visits" onClick={() => navigate('appointments')} />{next ? <div className="upcoming-card"><div className="upcoming-date"><CalendarDays size={20} /></div><div className="upcoming-info"><StatusTag status={next.status} /><h3>{next.pet} · {next.purpose}</h3><p><Clock3 size={14} /> {next.date} · {next.time}</p><p><Stethoscope size={14} /> Greenfield Veterinary</p></div></div> : <EmptyState icon={CalendarDays} title="No upcoming visits" detail="Book an appointment when your pet is ready." />}<button className="button button-soft button-full" onClick={() => navigate(pets.length ? 'book-appointment' : 'my-pets')}>{pets.length ? 'Book a visit' : 'View my pets'} <ArrowRight size={16} /></button></section></div></>
}

export function PetGridView({ pets, openPet, staff = false }) {
  return pets.length ? <div className="pet-grid-page">{pets.map((pet) => <PetCard key={pet.id || pet.name} pet={pet} openPet={openPet} />)}</div> : <section className="surface-section"><EmptyState icon={PawPrint} title={staff ? 'No pets registered' : 'No pets yet'} detail={staff ? 'Registered patients will appear here.' : 'Use the Add a pet action above to register your first companion.'} /></section>
}

export function PetEditFormView({ pet, onSubmit, onCancel }) {
  const [species, setSpecies] = useState(pet.speciesValue || pet.species)
  return <form className="surface-section workflow-form" onSubmit={onSubmit} encType="multipart/form-data"><div className="workflow-title"><span className="section-icon"><PawPrint size={20} /></span><div><h2>Edit {pet.name}</h2><p>Keep this pet’s profile and care details up to date.</p></div></div><div className="form-grid"><Field label="Pet name" name="name" defaultValue={pet.name} required /><label className="field"><span>Species</span><select name="species" value={species} onChange={(event) => setSpecies(event.target.value)}><option>Dog</option><option>Cat</option><option>Rabbit</option><option>Hamster</option><option>Bird</option><option>Other</option></select></label>{species === 'Other' && <Field label="Specify species" name="customSpecies" defaultValue={pet.customSpecies || ''} required />}<Field label="Breed" name="breed" defaultValue={pet.breed || ''} /><Field label="Date of birth / Age" name="age" defaultValue={pet.age || ''} /><label className="field"><span>Sex</span><select name="gender" defaultValue={pet.sex || 'Unknown'}><option>Male</option><option>Female</option><option>Unknown</option></select></label><Field label="Color" name="color" defaultValue={pet.color || ''} /><label className="field field-wide"><span>Replace pet photo <small>Optional</small></span><span className="upload-box"><Upload size={20} /><b>Choose a new photo</b><small>JPG, PNG, or WebP · Up to 50 MB</small><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" /></span></label></div><div className="form-footer"><button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button><button type="submit" className="button button-primary"><Check size={16} /> Save pet details</button></div></form>
}

export function PetProfileView({ pet, account, records, vaccines, appointments, navigate, staff }) {
  const [activeTab, setActiveTab] = useState('Overview')
  const petRecords = records.filter((record) => record.petId === pet.id)
  const petVaccines = vaccines.filter((vaccine) => vaccine.petId === pet.id)
  const petAppointments = appointments.filter((appointment) => appointment.petId === pet.id)
  const tabs = ['Overview', 'Medical records', 'Vaccinations', 'Appointments']
  return <><div className="profile-hero"><img src={pet.image || petImages[pet.species] || petImages.Other} alt={pet.name} /><div><span className="eyebrow">PET PROFILE</span><h2>{pet.name}</h2><p>{pet.breed} <i /> {pet.sex} <i /> {pet.age}</p></div><button className="button button-outline profile-edit" onClick={() => navigate(staff ? 'new-record' : 'book-appointment')}>{staff ? <FilePlus2 size={16} /> : <CalendarDays size={16} />}{staff ? 'Add record' : 'Book visit'}</button></div><div className="profile-tabs" role="tablist">{tabs.map((tab) => <button key={tab} role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? 'tab-active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}</div>{activeTab === 'Overview' && <div className="profile-overview"><section className="surface-section information-panel"><SectionHeading title="Pet information" /><InfoRow label="Species" value={pet.species} /><InfoRow label="Breed" value={pet.breed} /><InfoRow label="Age" value={pet.age} /><InfoRow label="Sex" value={pet.sex} /><InfoRow label="Color" value={pet.color} /><InfoRow label="Owner" value={account.fullName || 'Pet owner'} /><InfoRow label="Contact" value={account.contact || 'Not provided'} /></section><section className="surface-section health-panel"><SectionHeading title="Health summary" /><div className="health-row"><ShieldCheck size={18} /><span><small>Last checkup</small><b>{petRecords[0]?.date || 'No checkup recorded'}</b></span></div><div className="health-row"><Syringe size={18} /><span><small>Last vaccination</small><b>{petVaccines[0]?.given || 'No vaccination recorded'}</b></span></div><div className="health-row"><CalendarDays size={18} /><span><small>Next vaccination</small><b>{petVaccines[0]?.next || 'Not scheduled'}</b></span></div><button className="button button-primary button-full" onClick={() => navigate(staff ? 'new-record' : 'book-appointment')}>{staff ? 'Add medical record' : 'Book appointment'} <ArrowRight size={16} /></button></section></div>}{activeTab === 'Medical records' && <RecordsTable records={petRecords} />}{activeTab === 'Vaccinations' && <VaccinesTable vaccines={petVaccines} />}{activeTab === 'Appointments' && <section className="surface-section full-table-section"><div className="table-toolbar"><div className="filter-tabs"><button className="filter-active">Appointments for {pet.name}</button></div><button className="button button-primary" onClick={() => navigate(staff ? 'appointments' : 'book-appointment')}>{staff ? 'Clinic schedule' : 'Book appointment'}</button></div><AppointmentTable appointments={petAppointments} /></section>}</>
}

function InfoRow({ label, value }) {
  return <div className="info-row"><span>{label}</span><b>{value}</b></div>
}

export function BookingFormView({ pets, onSubmit, onCancel }) {
  const [selectedDate, setSelectedDate] = useState('')
  const [localDateTime, setLocalDateTime] = useState(getLocalDateTimeValues)

  useEffect(() => {
    const timer = window.setInterval(() => setLocalDateTime(getLocalDateTimeValues()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <form className="surface-section workflow-form" onSubmit={onSubmit}>
      <div className="workflow-title">
        <span className="section-icon"><CalendarDays size={20} /></span>
        <div><h2>Book an appointment</h2><p>Choose a time that works for you and your pet.</p></div>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Select pet</span>
          <select name="pet" required>{pets.map((pet) => <option key={pet.id} value={pet.id}>{pet.name}</option>)}</select>
        </label>
        <Field label="Date" name="date" type="date" required min={localDateTime.today} onChange={(event) => setSelectedDate(event.target.value)} />
        <Field label="Time" name="time" type="time" required min={selectedDate === localDateTime.today ? localDateTime.earliestTime : undefined} />
        <label className="field">
          <span>Purpose</span>
          <select name="purpose" required>
            <option value="General Checkup">General Checkup</option>
            <option value="Vaccination">Vaccination</option>
            <option value="Consultation">Consultation</option>
            <option value="Other">Other</option>
          </select>
        </label>
        <label className="field field-wide">
          <span>Notes <small>Optional</small></span>
          <textarea name="notes" placeholder="Anything the vet should know before your visit?" rows="4" />
        </label>
      </div>
      <div className="form-footer">
        <button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button>
        <button type="submit" className="button button-primary">Book appointment <ArrowRight size={16} /></button>
      </div>
    </form>
  )
}

export function PetUpdateFormView({ pets, onSubmit, onCancel }) {
  const [type, setType] = useState('Photo')
  const [petId, setPetId] = useState(pets[0]?.id || '')
  const [fileName, setFileName] = useState('')
  const selectedPet = pets.find((pet) => pet.id === petId)

  if (!pets.length) {
    return <section className="surface-section workflow-form"><div className="workflow-title"><span className="section-icon"><FilePlus2 size={20} /></span><div><h2>Post Pet Update</h2><p>Share a care update with a pet owner.</p></div></div><div className="empty-state"><PawPrint size={27} /><b>No registered patients yet</b><span>Register a pet before posting a clinic update.</span></div><div className="form-footer"><button type="button" className="button button-quiet" onClick={onCancel}>Back to dashboard</button></div></section>
  }

  return <form className="surface-section workflow-form pet-update-form" onSubmit={onSubmit}>
    <div className="workflow-title"><span className="section-icon"><FilePlus2 size={20} /></span><div><h2>Post Pet Update</h2><p>Share a photo, video, or care progress note with the pet’s owner.</p></div></div>
    <div className="form-grid">
      <label className="field"><span>Registered pet</span><select name="petId" value={petId} onChange={(event) => setPetId(event.target.value)} required>{pets.map((pet) => <option key={pet.id} value={pet.id}>{pet.name} · {pet.ownerName || 'Pet owner'}</option>)}</select></label>
      <label className="field"><span>Update type</span><select name="type" value={type} onChange={(event) => { setType(event.target.value); setFileName('') }}><option value="Photo">Photo update</option><option value="Video">Video update</option><option value="Note">Care note only</option></select></label>
      {type !== 'Note' && <label className="field field-wide"><span>{type} file</span><span className="upload-box update-upload"><Upload size={20} /><b>{fileName || `Choose a ${type.toLowerCase()}`}</b><small>{type === 'Photo' ? 'JPG, PNG, or WebP · Up to 50 MB' : 'MP4 or WebM · Up to 50 MB'}</small><input key={type} name="media" type="file" accept={type === 'Photo' ? 'image/*' : 'video/*'} required onChange={(event) => setFileName(event.target.files?.[0]?.name || '')} /></span></label>}
      <label className="field field-wide"><span>Care progress or status note</span><textarea name="note" rows="5" maxLength="2000" placeholder={`Share an update about ${selectedPet?.name || 'this pet'}’s visit, condition, or next steps.`} required /></label>
    </div>
    <div className="update-privacy-note"><ShieldCheck size={17} /><span>This update will only appear in {selectedPet?.ownerName || 'the pet owner'}’s dashboard for {selectedPet?.name || 'this pet'}.</span></div>
    <div className="form-footer"><button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button><button type="submit" className="button button-primary"><FilePlus2 size={16} /> Post update</button></div>
  </form>
}

export function ProfilePanelView({ account, onSave }) {
  const submit = (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    onSave({ fullName: form.get('fullName'), email: form.get('email'), contact: form.get('contact'), address: form.get('address') })
  }
  return <form className="surface-section profile-settings profile-edit-form" onSubmit={submit}><div className="profile-settings-avatar">{(account.fullName || 'P').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</div><div><span className="eyebrow">ACCOUNT DETAILS</span><h2>{account.fullName || 'Your profile'}</h2><p>Update your owner account details.</p></div><div className="settings-divider" /><div className="form-grid"><Field label="Full name" name="fullName" defaultValue={account.fullName} required /><Field label="Email address" name="email" type="email" defaultValue={account.email} required /><Field label="Contact number" name="contact" defaultValue={account.contact} /><Field label="Address" name="address" defaultValue={account.address} /></div><div className="form-footer"><button className="button button-primary" type="submit"><Check size={16} /> Save changes</button></div></form>
}

export function StaffManagementView({ staffAccounts, onCreate, notify }) {
  const submit = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const staffMember = { fullName: form.get('fullName'), role: form.get('role'), email: form.get('email'), password: form.get('password') }
    try {
      await onCreate(staffMember)
      event.currentTarget.reset()
    } catch (error) {
      notify(error.message)
    }
  }
  return <div className="staff-management-layout"><form className="surface-section staff-create-form" onSubmit={submit}><div className="workflow-title"><span className="section-icon"><UserRound size={20} /></span><div><h2>Create staff account</h2><p>Set up a clinic team member and their access.</p></div></div><div className="form-grid"><Field label="Full name" name="fullName" placeholder="e.g. Ana Reyes" required /><label className="field"><span>Professional title / role</span><select name="role"><option>Veterinarian</option><option>Receptionist</option><option>Clinic Admin</option></select></label><Field label="Official email address" name="email" type="email" placeholder="name@clinic.com" required /><Field label="Temporary password" name="password" type="password" placeholder="At least 12 characters" minLength={12} required /></div><fieldset className="permission-fieldset"><legend>Access permissions</legend><label><input type="checkbox" name="permissions" value="Appointments" defaultChecked /> Appointments</label><label><input type="checkbox" name="permissions" value="Pet profiles" defaultChecked /> Pet profiles</label><label><input type="checkbox" name="permissions" value="Medical records" /> Medical records</label><label><input type="checkbox" name="permissions" value="Vaccinations" /> Vaccinations</label><label><input type="checkbox" name="permissions" value="Reports" /> Reports</label><label><input type="checkbox" name="permissions" value="Staff management" /> Staff management</label></fieldset><div className="form-footer"><button type="submit" className="button button-primary"><Users size={16} /> Create staff account</button></div></form><section className="surface-section staff-table-section"><SectionHeading title="Clinic staff" action={`${staffAccounts.length} active`} /><div className="table-scroll"><table><thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Status</th></tr></thead><tbody>{staffAccounts.map((staffMember, index) => <tr key={`${staffMember.email}-${index}`}><td><b>{staffMember.fullName}</b></td><td>{staffMember.role}</td><td>{staffMember.email}</td><td><StatusTag status={staffMember.status} /></td></tr>)}</tbody></table></div></section></div>
}
