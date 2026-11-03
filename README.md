# FurBloom

FurBloom is a pet healthcare workspace with a React frontend, an Express API, and a MySQL database.

## Requirements

- Node.js 20.19+ or 22.12+
- MySQL 8.0.16 or newer

## Quick Start

Create and manage your own MySQL database separately. This project does not create, migrate, or seed a database. Configure the connection to your database in `.env`:

```env
DATABASE_URL=mysql://USER:PASSWORD@127.0.0.1:3306/YOUR_DATABASE
```

Keep `.env` private; it is ignored by Git. Create the tables expected by the API in your own database, then install dependencies and start the app:

```powershell
npm install
npm run dev
```

If upgrading an existing database, you can run the one-time SQL migration in `server/migrations/20261102_add_appointment_purpose.sql` to add a dedicated `purpose` field. The API detects whether that column exists; when it does not, it stores the purpose in the appointment notes and restores it in appointment responses.

The dev command starts the API on port 3001 and Vite on the first available port (usually 5173). The API requires the separately managed MySQL database to be running and reachable. The Vite process proxies `/api` to the API. To run only the frontend, use `npm run frontend`.

## Production

Configure `DATABASE_URL`, `APP_ORIGIN`, and `NODE_ENV=production`. Create and back up your database independently. Run:

```powershell
npm run server
npm run build
```

Serve `dist/` and proxy `/api` through the same HTTPS origin as the API. Configure database backups and a durable private object store before deployment. Local development media is stored under `UPLOAD_DIR` (default `./uploads`) and is served only through an authenticated ownership-checked endpoint.

## API

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET/PATCH /api/auth/me`
- `GET /api/dashboard` returns the signed-in user and only their authorized workspace data.
- `GET/POST /api/pets`, `GET/PATCH/DELETE /api/pets/:petId`; delete archives a pet and retains clinical history.
- `GET/POST /api/appointments`, `PATCH /api/appointments/:appointmentId`
- `GET/POST /api/medical-records`
- `GET/POST /api/vaccinations`
- `GET /api/pets/:petId` returns the pet and its isolated medical, vaccination, appointment, and update history.
- `GET /api/pet-updates`, `GET /api/pets/:petId/updates`, `POST /api/pet-updates`
- `GET/POST /api/admin/users`, `GET /api/owners`
- `GET /api/media/:filename` serves media only after checking access to its pet.
- `GET /api/health` checks API and database readiness.

Passwords use Argon2id. Sessions use random opaque tokens; only SHA-256 token hashes are stored, and the browser token is held in an HttpOnly, SameSite cookie (Secure in production). API role checks and owner filters are server-side. Appointment rows use a composite foreign key to ensure the selected owner owns the selected pet. Uploads are limited to 50 MB and checked by file signature.

The API uses Argon2id hashes; PHP's `password_hash()` commonly creates bcrypt hashes, which are not compatible. To create a missing admin account or replace an existing admin password hash, start the app's configured MySQL connection and run `npm run admin:password` in an interactive terminal. Enter the email, account name, and a new password when prompted; the password is hidden while typing and stored as an Argon2id hash. This command runs only when explicitly invoked, does not overwrite non-admin accounts, and is not run automatically at server startup. If an account has a placeholder or incompatible hash, login safely returns the normal incorrect-email-or-password response until this command is used.

## Checks

```powershell
npm test
npm run lint
npm run build
npm audit --omit=dev
```
