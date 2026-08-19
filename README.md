# Coffee Field OS Backend

Express.js backend for the Shecha Estate farm management ERP.

Silva governs. SPX manages as principal. B-Agro (and other vendors) execute. All vendor data reaches Silva only after SPX validation.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in values:

   ```bash
   cp .env.example .env
   ```

3. Start PostgreSQL and Redis:

   ```bash
   docker compose -f docker/docker-compose.yml up -d postgres redis minio
   ```

4. Run Prisma migrations:

   ```bash
   npx prisma migrate dev --name init
   ```

5. Seed the database:

   ```bash
   node prisma/seed.js
   ```

6. Start the server:

   ```bash
   npm run dev
   ```

Server runs on `http://localhost:3000`.

## API Documentation

OpenAPI/Swagger: `http://localhost:3000/api/docs`

Base path: `/api/v1`

## Postman

Import both files from `postman/`:

1. `Coffee_Field_OS.postman_collection.json`
2. `Coffee_Field_OS.postman_environment.json`

Then select the **Coffee Field OS — Local** environment and run **Auth → Login as SPX principal**. That stores `accessToken` for the rest of the collection.

Seed IDs (`AFP-2026-001`, `AFE-0001`, `WO-0001`, `vnd_bagro`) are pre-filled in the environment. Password for every seeded user: `Password123!`

Regenerate the files after API changes:

```bash
npm run postman:generate
```

## Seed logins

Password for every seeded user: `Password123!`

| Role | Email |
| --- | --- |
| Silva owner | `owner@silva.example` |
| Silva country manager | `naomi@silva.example` |
| Silva finance | `finance@silva.example` |
| SPX principal | `principal@spx.example` |
| SPX account handler | `handler@spx.example` |
| SPX field supervisor | `supervisor@spx.example` |
| System admin | `admin@spx.example` |
| B-Agro admin | `admin@bagro.example` |
| B-Agro field lead | `lead@bagro.example` |
| B-Agro worker | `worker@bagro.example` |

```http
POST /api/v1/auth/login
{ "email": "principal@spx.example", "password": "Password123!" }
```

## Testing

```bash
npm run test:unit
npm run test:integration
npm test
```

Integration tests require `DATABASE_URL` pointing at Postgres.

## Firewalls

1. Revenue ledger — `spx_principal` only (`403 FIREWALL_VIOLATION`)
2. GL export rows — restricted credential only
3. No vendor→Silva raw field tickets
4. Maker-checker — submitter cannot approve/validate/verify own work (`409 MAKER_CHECKER_VIOLATION`)

## Project structure

```
app.js
config/
middleware/
utils/
routes/
controllers/
services/
schemas/
prisma/
jobs/
docker/
tests/
```
# silva_backend
# silva_backend
