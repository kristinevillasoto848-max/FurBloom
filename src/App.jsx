import { startTransition, useCallback, useEffect, useState } from 'react'
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, Bell, CalendarDays,
  Archive, Check, ChevronDown, ChevronRight, ClipboardList, Clock3, FilePlus2,
  Heart, Home, LogOut, Menu, PawPrint, Pencil, Plus, Search, Settings, ShieldCheck,
  Stethoscope, Syringe, UserRound, Users, X,
} from 'lucide-react'
import {
  BookingFormView, PetGridView, PetProfileView, OwnerDashboardView,
  PetEditFormView, PetRegistrationView, PetUpdateFormView, ProfilePanelView, StaffManagementView,
} from './WorkspaceViews.jsx'
import PetStatusUpdates from './PetStatusUpdates.jsx'
import { apiRequest } from './api.js'
import petFallback from './assets/hero.png'
import './App.css'

const images = {
  dog: 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=900&q=85',
  cat: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=500&q=85',
}

const normalizePet = (pet) => ({ ...pet, speciesValue: pet.species, species: pet.species === 'Other' ? pet.customSpecies : pet.species, speciesLabel: pet.speciesLabel || (pet.species === 'Other' ? pet.customSpecies : pet.species), image: pet.image || petFallback })
const normalizeAppointment = (appointment) => {
  const dateTime = new Date(appointment.dateTime)
  return { ...appointment, date: dateTime.toLocaleDateString(), time: dateTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }
}
const appointmentDateTimeToIso = (dateValue, timeValue) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || !/^\d{2}:\d{2}$/.test(timeValue)) {
    throw new Error('Choose a valid appointment date and time.')
  }
  const [year, month, day] = dateValue.split('-').map(Number)
  const [hours, minutes] = timeValue.split(':').map(Number)
  const dateTime = new Date(year, month - 1, day, hours, minutes)
  if (dateTime.getFullYear() !== year || dateTime.getMonth() !== month - 1 || dateTime.getDate() !== day
    || dateTime.getHours() !== hours || dateTime.getMinutes() !== minutes) {
    throw new Error('Choose a valid appointment date and time.')
  }
  if (dateTime.getTime() <= Date.now()) {
    throw new Error('Choose an appointment time in the future.')
  }
  return dateTime.toISOString()
}

const navGroups = {
  owner: [
    { label: 'Dashboard', icon: Home, page: 'owner-dashboard' },
    { label: 'My Pets', icon: PawPrint, page: 'my-pets' },
    { label: 'Appointments', icon: CalendarDays, page: 'appointments' },
    { label: 'Medical History', icon: ClipboardList, page: 'medical-history' },
    { label: 'Vaccinations', icon: Syringe, page: 'vaccinations' },
    { label: 'Profile', icon: UserRound, page: 'profile' },
  ],
  staff: [
    { label: 'Dashboard', icon: Home, page: 'staff-dashboard' },
    { label: 'Pet Owners', icon: Users, page: 'pet-owners' },
    { label: 'Pets', icon: PawPrint, page: 'pets' },
    { label: 'Appointments', icon: CalendarDays, page: 'appointments' },
    { label: 'Medical Records', icon: ClipboardList, page: 'medical-history' },
    { label: 'Vaccinations', icon: Syringe, page: 'vaccinations' },
    { label: 'Reports', icon: Activity, page: 'reports' },
    { label: 'Staff management', icon: Users, page: 'staff-management' },
    { label: 'Settings', icon: Settings, page: 'settings' },
  ],
}

function Brand({ light = false }) {
  return <span className={`brand ${light ? 'brand-light' : ''}`}><PawPrint size={24} fill="currentColor" strokeWidth={1.5} /><span>FurBloom</span></span>
}

function App() {
  const [page, setPage] = useState('landing')
  const [role, setRole] = useState('owner')
  const [sessionUser, setSessionUser] = useState(null)
  const [pets, setPets] = useState([])
  const [activePet, setActivePet] = useState(null)
  const [account, setAccount] = useState({ fullName: '', email: '', contact: '', address: '' })
  const [registrationReturnPage, setRegistrationReturnPage] = useState('owner-dashboard')
  const [appointments, setAppointments] = useState([])
  const [records, setRecords] = useState([])
  const [vaccines, setVaccines] = useState([])
  const [petUpdates, setPetUpdates] = useState([])
  const [owners, setOwners] = useState([])
  const [staffAccounts, setStaffAccounts] = useState([])
  const [mobileMenu, setMobileMenu] = useState(false)
  const [toast, setToast] = useState('')
  const ownerPets = sessionUser?.role === 'owner' ? pets : []

  const navigate = (target) => {
    setPage(target)
    setMobileMenu(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const notify = useCallback((message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3000)
  }, [])

  useEffect(() => {
    let active = true
    apiRequest('/api/auth/me')
      .then(({ user }) => {
        if (!active) return
        startTransition(() => {
          setSessionUser(user)
          setAccount({ fullName: user.name, email: user.email, contact: user.contact || '', address: user.address || '' })
          setRole(user.role)
          setPage(user.role === 'owner' ? 'owner-dashboard' : 'staff-dashboard')
        })
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!sessionUser?.id) return
    let active = true

    apiRequest('/api/pets')
      .then(({ pets: petRows }) => {
        if (active) startTransition(() => setPets(petRows.map(normalizePet)))
      })
      .catch((error) => {
        if (active) startTransition(() => setToast(error.message))
      })

    apiRequest('/api/dashboard')
      .then((data) => {
        if (!active) return
        startTransition(() => {
          setAppointments(data.appointments.map(normalizeAppointment))
          setRecords(data.medicalRecords)
          setVaccines(data.vaccinations)
          setPetUpdates(data.updates)
        })
      })
      .catch((error) => {
        if (active) startTransition(() => setToast(error.message))
      })
    return () => { active = false }
  }, [sessionUser])

  useEffect(() => {
    if (sessionUser?.role !== 'owner') return
    const eventSource = new EventSource('/api/events')
    eventSource.addEventListener('pet-update', () => {
      apiRequest('/api/dashboard')
        .then((data) => startTransition(() => setPetUpdates(data.updates)))
        .catch((error) => startTransition(() => setToast(error.message)))
    })
    return () => eventSource.close()
  }, [sessionUser?.id, sessionUser?.role])

  useEffect(() => {
    if (role !== 'admin' || page !== 'staff-management') return
    let active = true
    apiRequest('/api/admin/users')
      .then(({ users }) => {
        if (active) setStaffAccounts(users.filter((user) => user.role !== 'owner').map((user) => ({
          fullName: user.name, role: user.role === 'admin' ? 'Clinic Admin' : 'Veterinarian', email: user.email, status: 'Active',
        })))
      })
      .catch((error) => { if (active) notify(error.message) })
    return () => { active = false }
  }, [role, page, notify])

  useEffect(() => {
    if (!['staff', 'admin'].includes(role) || page !== 'pet-owners') return
    let active = true
    apiRequest('/api/owners')
      .then(({ owners: ownerRows }) => { if (active) setOwners(ownerRows) })
      .catch((error) => { if (active) notify(error.message) })
    return () => { active = false }
  }, [role, page, notify])

  const openPet = (pet) => {
    setActivePet(pet)
    navigate('pet-profile')
  }
  const startPetRegistration = () => {
    setRegistrationReturnPage(ownerPets.length ? 'my-pets' : 'owner-dashboard')
    navigate('pet-registration')
  }
  const adoptUser = (user, target) => {
    setPets([])
    setSessionUser(user)
    setAccount({ fullName: user.name, email: user.email, contact: user.contact || '', address: user.address || '' })
    setRole(user.role)
    navigate(target || (user.role === 'owner' ? 'owner-dashboard' : 'staff-dashboard'))
  }
  const createAccount = async (values) => {
    const { user } = await apiRequest('/api/auth/register', { method: 'POST', body: values })
    setRegistrationReturnPage('owner-dashboard')
    adoptUser(user, 'pet-registration')
  }
  const login = async (credentials) => {
    const { user } = await apiRequest('/api/auth/login', { method: 'POST', body: credentials })
    adoptUser(user)
  }
  const logout = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setSessionUser(null)
    setPets([])
    setAppointments([])
    setRecords([])
    setVaccines([])
    setPetUpdates([])
    setRole('owner')
    setAccount({ fullName: '', email: '', contact: '', address: '' })
    navigate('landing')
  }
  const createStaffAccount = async (staffMember) => {
    try {
      const { user } = await apiRequest('/api/admin/users', { method: 'POST', body: {
        name: staffMember.fullName,
        email: staffMember.email,
        password: staffMember.password,
        role: staffMember.role === 'Clinic Admin' ? 'admin' : 'staff',
      } })
      setStaffAccounts((current) => [{ fullName: user.name, role: staffMember.role, email: user.email, status: 'Active' }, ...current])
      notify(`${user.name} was added to clinic staff`)
    } catch (error) {
      notify(error.message)
      throw error
    }
  }
  const addPet = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const species = form.get('species')
    const payload = new FormData()
    payload.set('name', form.get('name'))
    payload.set('species', species)
    payload.set('customSpecies', species === 'Other' ? form.get('animal') || '' : '')
    payload.set('breed', form.get('breed') || '')
    payload.set('age', form.get('age') || '')
    payload.set('gender', form.get('sex') || 'Unknown')
    payload.set('color', form.get('color') || '')
    if (form.get('photo') instanceof File && form.get('photo').size) payload.set('photo', form.get('photo'))
    try {
      const { pet: createdPet } = await apiRequest('/api/pets', { method: 'POST', body: payload })
      const pet = normalizePet(createdPet)
      setPets((current) => [pet, ...current])
      setActivePet(pet)
      navigate(registrationReturnPage)
      notify(`${pet.name} was added to your pets`)
    } catch (error) {
      notify(error.message)
    }
  }
  const updatePet = async (event) => {
    event.preventDefault()
    if (!activePet) return
    const form = new FormData(event.currentTarget)
    const payload = new FormData()
    for (const field of ['name', 'species', 'customSpecies', 'breed', 'age', 'gender', 'color']) payload.set(field, form.get(field) || '')
    const photo = form.get('photo')
    if (photo instanceof File && photo.size) payload.set('photo', photo)
    try {
      const { pet: updatedPet } = await apiRequest(`/api/pets/${activePet.id}`, { method: 'PATCH', body: payload })
      const normalized = normalizePet(updatedPet)
      setPets((current) => current.map((pet) => pet.id === normalized.id ? normalized : pet))
      setActivePet(normalized)
      navigate('pet-profile')
      notify(`${normalized.name}’s profile was updated`)
    } catch (error) {
      notify(error.message)
    }
  }
  const archivePet = async () => {
    if (!activePet || !window.confirm(`Archive ${activePet.name}? Their medical history will be retained but removed from active pet lists.`)) return
    try {
      await apiRequest(`/api/pets/${activePet.id}`, { method: 'DELETE' })
      setPets((current) => current.filter((pet) => pet.id !== activePet.id))
      setPetUpdates((current) => current.filter((update) => update.petId !== activePet.id))
      setActivePet(null)
      navigate(role === 'owner' ? 'my-pets' : 'pets')
      notify('Pet archived')
    } catch (error) {
      notify(error.message)
    }
  }
  const postPetUpdate = async (event) => {
    event.preventDefault()
    if (!['staff', 'admin'].includes(role)) return
    const form = new FormData(event.currentTarget)
    const pet = pets.find((item) => item.id === form.get('petId'))
    const media = form.get('media')
    const type = form.get('type')
    if (!pet) {
      notify('Select a registered pet before posting an update')
      return
    }
    if (type !== 'Note' && (!(media instanceof File) || !media.size)) {
      notify('Choose a photo or video for this update')
      return
    }
    if (media instanceof File && media.size > 50 * 1024 * 1024) {
      notify('Media files must be 50 MB or smaller')
      return
    }
    if (type === 'Photo' && media.size && !media.type.startsWith('image/')) {
      notify('Choose an image file for a photo update')
      return
    }
    if (type === 'Video' && media.size && !media.type.startsWith('video/')) {
      notify('Choose a video file for a video update')
      return
    }
    try {
      const { update } = await apiRequest('/api/pet-updates', { method: 'POST', body: form })
      setPetUpdates((current) => [update, ...current])
      navigate('staff-dashboard')
      notify(`Update posted for ${pet.name}`)
    } catch (error) {
      notify(error.message)
    }
  }
  const bookAppointment = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      const dateTime = appointmentDateTimeToIso(String(form.get('date') || ''), String(form.get('time') || ''))
      const { appointment } = await apiRequest('/api/appointments', {
        method: 'POST',
        body: {
          pet_id: form.get('pet'),
          owner_id: sessionUser.id,
          appointment_date: dateTime,
          purpose: form.get('purpose'),
          notes: form.get('notes') || '',
        },
      })
      setAppointments((current) => [normalizeAppointment(appointment), ...current])
      navigate('appointments')
      notify('Appointment booked.')
    } catch (error) {
      notify(error.message)
    }
  }
  const saveRecord = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      await apiRequest('/api/medical-records', { method: 'POST', body: {
        petId: form.get('pet'), checkupDate: form.get('date'), reason: form.get('reason'),
        diagnosis: form.get('diagnosis'), treatment: form.get('treatment'),
      } })
      const { medicalRecords } = await apiRequest('/api/medical-records')
      setRecords(medicalRecords)
      navigate('medical-history')
      notify('Medical record saved')
    } catch (error) {
      notify(error.message)
    }
  }
  const saveVaccine = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      await apiRequest('/api/vaccinations', { method: 'POST', body: {
        petId: form.get('pet'), vaccineName: form.get('vaccine'), dateGiven: form.get('given'),
        nextDueDate: form.get('next') || '', status: form.get('status'),
      } })
      const { vaccinations } = await apiRequest('/api/vaccinations')
      setVaccines(vaccinations)
      navigate('vaccinations')
      notify('Vaccination record saved')
    } catch (error) {
      notify(error.message)
    }
  }

  const saveOwnerProfile = async (nextAccount) => {
    try {
      const { user } = await apiRequest('/api/auth/me', { method: 'PATCH', body: {
        name: nextAccount.fullName, email: nextAccount.email, contact: nextAccount.contact, address: nextAccount.address,
      } })
      setSessionUser(user)
      setAccount({ fullName: user.name, email: user.email, contact: user.contact || '', address: user.address || '' })
      notify('Profile saved')
    } catch (error) {
      notify(error.message)
    }
  }

  if (page === 'landing') return <Landing navigate={navigate} />
  if (page === 'login' || page === 'signup') return <AuthPage page={page} setPage={navigate} onLogin={login} onSignup={createAccount} />
  if (page === 'pet-registration') return <PetRegistrationView onSubmit={addPet} onSkip={() => navigate(registrationReturnPage)} account={account} />

  const isStaff = role !== 'owner'
  const navItems = navGroups[isStaff ? 'staff' : 'owner'].filter((item) => item.page !== 'staff-management' || role === 'admin')
  const currentItem = navItems.find((item) => item.page === page)
  const titles = {
    'owner-dashboard': [`Welcome, ${account.fullName || 'Pet parent'}!`, 'Here’s an overview of your pets and upcoming appointments.'],
    'staff-dashboard': [`Good morning, ${sessionUser?.name || 'clinic team'}!`, 'Here’s what’s happening at the clinic today.'],
    'post-pet-update': ['Post Pet Update', 'Share a photo, video, or care note with a pet’s owner.'],
    'my-pets': ['My Pets', 'A little care goes a long way.'],
    appointments: ['Appointments', 'Keep track of upcoming visits and requests.'],
    'medical-history': ['Medical History', 'A complete record of your pet’s care.'],
    vaccinations: ['Vaccinations', 'Stay up to date on every important dose.'],
    'pet-profile': [`${activePet?.name || 'Pet'}’s Profile`, `${activePet?.breed || ''} · ${activePet?.age || ''}`],
    'pet-edit': [`Edit ${activePet?.name || 'pet'}`, 'Update profile details and photo.'],
    'pet-owners': ['Pet Owners', 'Manage client profiles and their pets.'],
    pets: ['All Pets', 'Browse every pet registered with the clinic.'],
    reports: ['Reports', 'A snapshot of clinic activity.'],
    'staff-management': ['Staff management', 'Manage clinic team accounts and access.'],
    settings: ['Settings', 'Manage your account preferences.'],
    profile: ['My Profile', 'Your account and contact information.'],
  }
  const [title, subtitle] = titles[page] || titles['owner-dashboard']

  return (
    <div className="app-shell">
      {mobileMenu && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileMenu(false)} />}
      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <button className="sidebar-brand" onClick={() => navigate(isStaff ? 'staff-dashboard' : 'owner-dashboard')}><Brand light /></button>
        <div className="workspace-label">{isStaff ? 'STAFF PORTAL' : 'OWNER PORTAL'}</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navItems.map(({ label, icon: Icon, page: target }) => (
            <button className={`nav-link ${page === target ? 'nav-active' : ''}`} key={label} onClick={() => navigate(target)}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="clinic-chip"><span className="online-dot" /><span>{isStaff ? 'Greenfield Veterinary' : 'Pet parent since 2024'}</span></div>
          <button className="nav-link logout-link" onClick={logout}><LogOut size={18} /><span>Log out</span></button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <button className="icon-button menu-toggle" aria-label="Open navigation" onClick={() => setMobileMenu(true)}><Menu size={20} /></button>
          <div className="breadcrumbs"><span>FurBloom</span><ChevronRight size={14} /><b>{currentItem?.label || title}</b></div>
          <div className="topbar-actions">
            <button className="icon-button notification-button" aria-label="Notifications" onClick={() => notify('You’re all caught up')}><Bell size={18} /><i /></button>
            <div className="user-chip"><span className="avatar avatar-small">{(sessionUser?.name || account.fullName || 'P').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span><span><b>{sessionUser?.name || account.fullName || 'Pet owner'}</b><small>{role === 'admin' ? 'Administrator' : role === 'staff' ? 'Clinic staff' : 'Pet Owner'}</small></span><ChevronDown size={15} /></div>
          </div>
        </header>
        <div className={`page-content ${page === 'owner-dashboard' ? 'owner-dashboard-content' : ''}`}>
          {page !== 'owner-dashboard' && <div className="page-heading"><div><p className="eyebrow">{isStaff ? 'CLINIC WORKSPACE' : 'YOUR PET CARE SPACE'}</p><h1>{title}</h1><p>{subtitle}</p></div>
            {page === 'my-pets' && <button className="button button-primary" onClick={startPetRegistration}><Plus size={17} /> Add a pet</button>}
            {isStaff && (page === 'staff-dashboard' || page === 'pets') && <button className="button button-primary" onClick={() => navigate('post-pet-update')}><FilePlus2 size={16} /> Post Pet Update</button>}
            {page === 'appointments' && !isStaff && <button className="button button-primary" onClick={() => navigate('book-appointment')}><Plus size={17} /> Book appointment</button>}
            {page === 'medical-history' && isStaff && <button className="button button-primary" onClick={() => navigate('new-record')}><Plus size={17} /> New record</button>}
            {page === 'vaccinations' && isStaff && <button className="button button-primary" onClick={() => navigate('new-vaccine')}><Plus size={17} /> Add vaccine</button>}
          </div>}
          {page === 'owner-dashboard' && <><OwnerDashboardView account={account} pets={ownerPets} appointments={appointments} vaccines={vaccines} openPet={openPet} navigate={navigate} onAddPet={startPetRegistration} /><PetStatusUpdates pets={ownerPets} updates={petUpdates} /></>}
          {page === 'staff-dashboard' && <StaffDashboard appointments={appointments} vaccines={vaccines} pets={pets} navigate={navigate} />}
          {page === 'post-pet-update' && isStaff && <PetUpdateFormView pets={pets} onSubmit={postPetUpdate} onCancel={() => navigate('staff-dashboard')} />}
          {page === 'pet-edit' && activePet && <PetEditFormView pet={activePet} onSubmit={updatePet} onCancel={() => navigate('pet-profile')} />}
          {page === 'my-pets' && <PetGridView pets={ownerPets} openPet={openPet} />}
          {page === 'pets' && <PetGridView pets={pets} openPet={openPet} staff />}
          {page === 'pet-profile' && activePet && <div className="pet-profile-layout"><PetProfileView pet={activePet} account={isStaff ? { fullName: activePet.ownerName, contact: activePet.ownerContact } : account} records={records} vaccines={vaccines} appointments={appointments} navigate={navigate} staff={isStaff} /><div className="pet-profile-actions"><button className="button button-outline" onClick={() => navigate('pet-edit')}><Pencil size={15} /> Edit pet details</button><button className="button button-quiet" onClick={archivePet}><Archive size={15} /> Archive pet</button></div></div>}
          {page === 'appointments' && <Appointments appointments={appointments} staff={isStaff} navigate={navigate} setAppointments={setAppointments} notify={notify} />}
          {page === 'book-appointment' && <BookingFormView pets={isStaff ? pets : ownerPets} onSubmit={bookAppointment} onCancel={() => navigate('appointments')} />}
          {page === 'new-record' && <MedicalRecordForm pets={pets} onSubmit={saveRecord} onCancel={() => navigate('medical-history')} />}
          {page === 'new-vaccine' && <VaccineForm pets={pets} onSubmit={saveVaccine} onCancel={() => navigate('vaccinations')} />}
          {page === 'medical-history' && <RecordsTable records={records} />}
          {page === 'vaccinations' && <VaccinesTable vaccines={vaccines} />}
          {page === 'pet-owners' && <OwnersTable owners={owners} openPet={openPet} />}
          {page === 'profile' && <ProfilePanelView account={account} onSave={saveOwnerProfile} />}
          {page === 'settings' && <SettingsPanel notify={notify} />}
          {page === 'reports' && <ReportsPanel appointments={appointments} pets={pets} vaccines={vaccines} />}
          {page === 'staff-management' && role === 'admin' && <StaffManagementView staffAccounts={staffAccounts} onCreate={createStaffAccount} notify={notify} />}
          {toast && <div className="toast"><Check size={17} />{toast}</div>}
        </div>
      </main>
    </div>
  )
}

function StaffDashboard({ appointments, vaccines, pets, navigate }) {
  const confirmed = appointments.filter((item) => item.status === 'Confirmed')
  const dueVaccines = vaccines.filter((item) => item.status === 'Due Soon' || item.status === 'Overdue')
  return (
    <>
      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-icon mint"><PawPrint size={19} /></span>
          <div className="stat-copy"><span>Total pets</span><b>{pets.length}</b><small>Registered patients</small></div>
        </div>
        <div className="stat-card">
          <span className="stat-icon peach"><CalendarDays size={19} /></span>
          <div className="stat-copy"><span>Appointments</span><b>{appointments.length}</b><small>Scheduled visits</small></div>
        </div>
        <div className="stat-card">
          <span className="stat-icon rose"><Syringe size={19} /></span>
          <div className="stat-copy"><span>Vaccinations due</span><b>{dueVaccines.length}</b><small>Due soon or overdue</small></div>
        </div>
      </div>
      <section className="surface-section">
        <div className="section-heading">
          <h2>Today's appointments</h2>
          <button onClick={() => navigate('appointments')}>View calendar <ArrowRight size={14} /></button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Pet</th><th>Owner</th><th>Date & time</th><th>Purpose</th><th>Status</th></tr>
            </thead>
            <tbody>
              {confirmed.slice(0, 5).map((item, index) => (
                <tr key={`${item.pet}-${index}`}>
                  <td><b>{item.pet}</b></td>
                  <td>{item.owner}</td>
                  <td>{item.date}<small>{item.time}</small></td>
                  <td>{item.purpose}</td>
                  <td><span className={`status-tag status-${item.status === 'Confirmed' ? 'green' : 'amber'}`}><i />{item.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {confirmed.length === 0 && (
            <div className="empty-state">
              <CalendarDays size={27} />
              <b>No appointments scheduled</b>
              <span>Upcoming clinic visits will appear here.</span>
            </div>
          )}
        </div>
      </section>
    </>
  )
}

function ReportsPanel({ appointments, pets, vaccines }) {
  return (
    <div className="reports-layout">
      <div className="stat-grid owner-stats">
        <div className="stat-card">
          <span className="stat-icon mint"><PawPrint size={19} /></span>
          <div className="stat-copy">
            <span>Registered pets</span>
            <b>{pets.length}</b>
            <small>Active clinic patients</small>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon peach"><CalendarDays size={19} /></span>
          <div className="stat-copy">
            <span>Appointments</span>
            <b>{appointments.length}</b>
            <small>Recorded visits</small>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon rose"><Syringe size={19} /></span>
          <div className="stat-copy">
            <span>Vaccines completed</span>
            <b>{vaccines.length}</b>
            <small>Total administered doses</small>
          </div>
        </div>
      </div>
      <section className="surface-section">
        <div className="section-heading">
          <h2>Clinic activity summary</h2>
        </div>
        <p>All metrics are synchronized directly from live database records.</p>
      </section>
    </div>
  )
}

function Landing({ navigate }) {
  const [activeModal, setActiveModal] = useState(null)
  const modalContent = {
    why: {
      eyebrow: 'CARE THAT STAYS IN SYNC',
      title: 'Why FurBloom?',
      description: 'Keep the important parts of your pet’s care together, so it is easier to stay organized and give them the attention they deserve.',
      details: ['Pet profiles for every companion', 'Health records and vaccination history', 'Appointments in one convenient place'],
    },
    care: {
      eyebrow: 'A LITTLE MORE PEACE OF MIND',
      title: 'Pet care, made easier.',
      description: 'FurBloom helps you keep up with your pet’s routine and share the details your clinic needs for their care.',
      details: ['Keep your pet’s details close at hand', 'Remember checkups and vaccines', 'Plan visits without the back-and-forth'],
    },
    contact: {
      eyebrow: 'WE’RE HERE TO HELP',
      title: 'Contact your clinic.',
      description: 'For help with appointments, your pet’s care, or your account, get in touch with your veterinary clinic. FurBloom keeps your care information organized in one place.',
      details: ['Ask your clinic about scheduling a visit', 'Share relevant health information with your care team'],
    },
  }
  const selectedModal = activeModal ? modalContent[activeModal] : null

  useEffect(() => {
    if (!activeModal) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setActiveModal(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeModal])

  return <div className="landing-page">
    <header className="landing-header"><nav aria-label="Landing page navigation"><button type="button" onClick={() => setActiveModal('why')}>Why FurBloom</button><button type="button" onClick={() => setActiveModal('care')}>Pet care</button><button type="button" onClick={() => setActiveModal('contact')}>Contact</button></nav></header>
    <main>
      <section className="landing-hero" id="pet-care">
        <div className="hero-copy"><span className="hero-kicker"><Heart size={15} fill="currentColor" /> A healthier, happier life together</span><h1 className="hero-brand-lockup"><PawPrint size={68} fill="currentColor" strokeWidth={1.6} /><span>FurBloom</span></h1><p>Manage your pet’s health records, vaccinations, and appointments in one place.</p><div className="hero-buttons"><button className="button button-primary button-large" onClick={() => navigate('signup')}>Get started <ArrowRight size={17} /></button><button className="button button-text" onClick={() => navigate('login')}>I already have an account <ChevronRight size={16} /></button></div><div className="hero-trust"><div className="avatar-stack"><span>🐾</span><span>🐶</span><span>🐱</span></div><span><b>Care that stays in sync</b><small>For every pet and every person who loves them</small></span></div></div>
        <div className="hero-visual"><div className="hero-image-backdrop" /><img className="hero-dog" src={images.dog} alt="Golden retriever looking happily at the camera" /><img className="hero-cat" src={images.cat} alt="A curious gray cat" /><div className="floating-note note-checkup"><span className="note-icon mint"><CalendarDays size={17} /></span><span><b>Next checkup</b><small>Sep 30 · 10:30 AM</small></span><Check className="note-check" size={17} /></div><div className="floating-note note-vaccine"><span className="note-icon peach"><ShieldCheck size={17} /></span><span><b>All caught up</b><small>Vaccinations on track</small></span></div><span className="hero-sparkle sparkle-one">✳</span><span className="hero-sparkle sparkle-two">✳</span></div>
      </section>
      <section className="care-strip" id="why-furbloom"><div className="care-strip-title"><span className="eyebrow">A LITTLE MORE PEACE OF MIND</span><h2>Everything your pet needs,<br />all in one happy place.</h2></div><Feature icon={PawPrint} title="Pet profiles" text="Keep each pet’s details close at hand." /><Feature icon={Syringe} title="Health records" text="Remember every checkup and vaccine." /><Feature icon={CalendarDays} title="Easy appointments" text="Book a visit without the back-and-forth." /></section>
      <section className="landing-cta" id="contact"><div><span className="eyebrow">YOUR PET’S NEW FAVORITE PLACE</span><h2>Let’s make their next chapter a healthy one.</h2></div></section>
    </main>
    <footer className="landing-footer"><Brand /><span>Made for the love they give us.</span><span>© 2026 FurBloom</span></footer>
    {selectedModal && <div className="landing-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setActiveModal(null)
    }}>
      <section className="landing-modal" role="dialog" aria-modal="true" aria-labelledby="landing-modal-title">
        <button className="landing-modal-close" type="button" aria-label="Close dialog" onClick={() => setActiveModal(null)}><X size={19} /></button>
        <span className="eyebrow">{selectedModal.eyebrow}</span>
        <h2 id="landing-modal-title">{selectedModal.title}</h2>
        <p>{selectedModal.description}</p>
        <ul>{selectedModal.details.map((detail) => <li key={detail}><Check size={16} />{detail}</li>)}</ul>
      </section>
    </div>}
  </div>
}

function Feature({ icon: Icon, title, text }) {
  return <article className="feature-item"><span className="feature-icon"><Icon size={21} /></span><h3>{title}</h3><p>{text}</p></article>
}

function AuthPage({ page, setPage, onLogin, onSignup }) {
  const signup = page === 'signup'
  const [staff, setStaff] = useState(false)
  const [authError, setAuthError] = useState('')
  const submit = async (event) => {
    event.preventDefault()
    setAuthError('')
    const form = new FormData(event.currentTarget)
    if (signup && form.get('password') !== form.get('confirm')) {
      setAuthError('Passwords do not match.')
      return
    }
    try {
      if (signup) {
        await onSignup({ name: form.get('name'), email: form.get('email'), password: form.get('password'), contact: form.get('contact'), address: form.get('address') })
      } else {
        await onLogin({ email: form.get('email'), password: form.get('password') })
      }
    } catch (error) {
      setAuthError(error.message)
    }
  }
  return <div className="auth-layout"><div className="auth-photo"><button className="auth-brand" onClick={() => setPage('landing')}><Brand light /></button><div className="auth-photo-caption"><span className="eyebrow">THE GOOD DAYS START HERE</span><h2>Because every wag, purr, and nuzzle matters.</h2><p>A little organization makes a lot more room for the moments you love.</p></div><img src={images.dog} alt="Happy golden retriever" /></div><section className="auth-panel"><button className="back-link" onClick={() => setPage('landing')}><ArrowLeft size={16} /> Back to home</button><div className="auth-form-wrap"><div className="auth-mobile-brand"><Brand /></div><span className="eyebrow">{signup ? 'WELCOME TO THE FAMILY' : staff ? 'CLINIC TEAM' : 'GOOD TO SEE YOU'}</span><h1>{signup ? 'Create your account' : staff ? 'Staff portal' : 'Welcome back'}</h1><p className="auth-intro">{signup ? 'A healthier routine for every pet you love.' : 'Log in to keep your pet’s care close.'}</p>{!signup && <div className="role-switch"><button className={!staff ? 'selected' : ''} onClick={() => setStaff(false)}>Pet owner</button><button className={staff ? 'selected' : ''} onClick={() => setStaff(true)}>Staff</button></div>}
      {authError && <p className="auth-error" role="alert">{authError}</p>}<form className="form-stack" onSubmit={submit}>{signup && <><Field label="Full name" name="name" placeholder="Maria Dela Cruz" required /><Field label="Contact number" name="contact" placeholder="09XX XXX XXXX" required /></>}<Field label={staff ? 'Email or username' : 'Email address'} name="email" type={staff ? 'text' : 'email'} placeholder={staff ? 'doctor@clinic.com' : 'you@example.com'} required /><Field label="Password" name="password" type="password" placeholder="••••••••" required minLength={signup ? 12 : 1} />{signup && <Field label="Confirm password" name="confirm" type="password" placeholder="••••••••" required minLength={12} />}<div className="form-footer"><button className="button button-primary button-full" type="submit">{signup ? 'Create account' : 'Log in'}</button></div></form><p className="auth-switch">{signup ? 'Already have an account?' : 'Don’t have an account?'}<button type="button" onClick={() => setPage(signup ? 'login' : 'signup')}>{signup ? 'Log in' : 'Sign up'}</button></p></div></section></div>
}

function Field({ label, name, placeholder, type = 'text', required = false, defaultValue = '', minLength }) {
  return <label className="field"><span>{label}</span><input name={name} type={type} placeholder={placeholder} defaultValue={defaultValue} required={required} minLength={minLength} /></label>
}

function Appointments({ appointments, staff, navigate, setAppointments, notify }) {
  const updateStatus = async (appointmentId, status) => {
    try {
      const { appointment } = await apiRequest(`/api/appointments/${appointmentId}`, { method: 'PATCH', body: { status } })
      setAppointments((current) => current.map((item) => item.id === appointmentId ? normalizeAppointment(appointment) : item))
      notify(`Appointment status updated to ${status}`)
    } catch (error) {
      notify(error.message)
    }
  }
  return <section className="surface-section full-table-section"><div className="table-toolbar"><div className="filter-tabs"><button className="filter-active">All appointments</button></div>{!staff && <button className="button button-primary" onClick={() => navigate('book-appointment')}>Book appointment</button>}</div><div className="table-scroll"><table><thead><tr><th>Pet</th><th>Owner</th><th>Date & time</th><th>Purpose</th><th>Status</th>{staff && <th>Actions</th>}</tr></thead><tbody>{appointments.map((item, index) => <tr key={`${item.id || item.date}-${index}`}><td><b>{item.pet}</b></td><td>{item.owner}</td><td>{item.date}<small>{item.time}</small></td><td>{item.purpose}</td><td><span className={`status-tag status-${item.status === 'Confirmed' || item.status === 'Completed' ? 'green' : item.status === 'Pending' ? 'status-amber' : 'status-red'}`}><i />{item.status}</span></td>{staff && <td>{item.status === 'Confirmed' && <div className="table-actions"><button className="button button-small button-outline" onClick={() => updateStatus(item.id, 'Completed')}>Complete</button><button className="button button-small button-quiet" onClick={() => updateStatus(item.id, 'Cancelled')}>Cancel</button></div>}</td>}</tr>)}</tbody></table>{appointments.length === 0 && <div className="empty-state"><CalendarDays size={27} /><b>No appointments</b><span>Scheduled visits will appear here.</span></div>}</div></section>
}

function RecordsTable({ records }) {
  return <section className="surface-section full-table-section"><div className="table-toolbar"><div className="filter-tabs"><button className="filter-active">Medical records</button></div></div><div className="table-scroll"><table><thead><tr><th>Pet</th><th>Date</th><th>Reason</th><th>Diagnosis</th><th>Treatment</th><th>Attending vet</th></tr></thead><tbody>{records.map((item, index) => <tr key={`${item.id || item.date}-${index}`}><td><b>{item.pet}</b></td><td>{item.checkupDate || item.date}</td><td>{item.reason}</td><td>{item.diagnosis}</td><td>{item.treatment}</td><td>{item.veterinarianName || 'Clinic Staff'}</td></tr>)}</tbody></table>{records.length === 0 && <div className="empty-state"><ClipboardList size={27} /><b>No medical records</b><span>Care documentation will appear here.</span></div>}</div></section>
}

function VaccinesTable({ vaccines }) {
  return <section className="surface-section full-table-section"><div className="table-toolbar"><div className="filter-tabs"><button className="filter-active">Vaccination records</button></div></div><div className="table-scroll"><table><thead><tr><th>Pet</th><th>Vaccine</th><th>Date given</th><th>Next due</th><th>Status</th></tr></thead><tbody>{vaccines.map((item, index) => <tr key={`${item.id || item.given}-${index}`}><td><b>{item.pet}</b></td><td>{item.vaccine}</td><td>{item.dateGiven || item.given}</td><td>{item.nextDueDate || item.next || 'Not scheduled'}</td><td><span className={`status-tag status-${item.status === 'Completed' ? 'green' : item.status === 'Due Soon' ? 'status-amber' : 'status-red'}`}><i />{item.status}</span></td></tr>)}</tbody></table>{vaccines.length === 0 && <div className="empty-state"><Syringe size={27} /><b>No vaccinations recorded</b><span>Immunization histories will appear here.</span></div>}</div></section>
}

function OwnersTable({ owners, openPet }) {
  return <section className="surface-section full-table-section"><div className="table-toolbar"><div className="filter-tabs"><button className="filter-active">Registered owners</button></div></div><div className="table-scroll"><table><thead><tr><th>Owner name</th><th>Email</th><th>Contact</th><th>Address</th><th>Registered pets</th></tr></thead><tbody>{owners.map((owner) => <tr key={owner.id}><td><b>{owner.name}</b></td><td>{owner.email}</td><td>{owner.contact || 'Not provided'}</td><td>{owner.address || 'Not provided'}</td><td><div className="owner-pet-list">{owner.pets.map((pet) => <button key={pet.id} className="owner-pet-chip" onClick={() => openPet(pet)}>{pet.name} ({pet.species})</button>)}</div></td></tr>)}</tbody></table>{owners.length === 0 && <div className="empty-state"><Users size={27} /><b>No pet owners found</b><span>Client profiles will appear here.</span></div>}</div></section>
}

function MedicalRecordForm({ pets, onSubmit, onCancel }) {
  return <form className="surface-section workflow-form" onSubmit={onSubmit}><div className="workflow-title"><span className="section-icon"><ClipboardList size={20} /></span><div><h2>New medical record</h2><p>Document a consultation, diagnosis, or treatment.</p></div></div><div className="form-grid"><label className="field"><span>Select pet</span><select name="pet" required>{pets.map((pet) => <option key={pet.id} value={pet.id}>{pet.name} ({pet.species})</option>)}</select></label><Field label="Checkup date" name="date" type="date" required /><Field label="Reason for visit" name="reason" placeholder="e.g. Annual wellness exam" required /><label className="field field-wide"><span>Diagnosis</span><textarea name="diagnosis" placeholder="Clinical findings..." rows="3" /></label><label className="field field-wide"><span>Treatment & prescriptions</span><textarea name="treatment" placeholder="Medications, care instructions..." rows="3" /></label></div><div className="form-footer"><button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button><button type="submit" className="button button-primary">Save record</button></div></form>
}

function VaccineForm({ pets, onSubmit, onCancel }) {
  return <form className="surface-section workflow-form" onSubmit={onSubmit}><div className="workflow-title"><span className="section-icon"><Syringe size={20} /></span><div><h2>Record vaccination</h2><p>Log a vaccine administered to a patient.</p></div></div><div className="form-grid"><label className="field"><span>Select pet</span><select name="pet" required>{pets.map((pet) => <option key={pet.id} value={pet.id}>{pet.name} ({pet.species})</option>)}</select></label><Field label="Vaccine name" name="vaccine" placeholder="e.g. Rabies, DHPP" required /><Field label="Date given" name="given" type="date" required /><Field label="Next due date" name="next" type="date" /><label className="field"><span>Status</span><select name="status"><option value="Completed">Completed</option><option value="Due Soon">Due Soon</option><option value="Overdue">Overdue</option></select></label></div><div className="form-footer"><button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button><button type="submit" className="button button-primary">Save vaccination</button></div></form>
}

function SettingsPanel({ notify }) {
  return <section className="surface-section workflow-form"><div className="workflow-title"><span className="section-icon"><Settings size={20} /></span><div><h2>Clinic Settings</h2><p>Manage system preferences and configurations.</p></div></div><div className="form-footer"><button className="button button-primary" onClick={() => notify('Settings saved')}>Save settings</button></div></section>
}

export default App