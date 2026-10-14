# MyHome listing verification

## Browser-assisted update

The dashboard now starts `BROWSER` jobs by default. Reload the unpacked Nikas
extension from `C:\Users\user\Desktop\Nikas-Extension` in `chrome://extensions`,
sign in through its existing Website API connection with an Admin/Manager
account, then refresh the dashboard tab and click **Verify MyHome Listings**.
The extension opens one MyHome tab, checks public rendered evidence and sends
authenticated results to the API. CAPTCHA pauses the job for manual completion;
use **Resume verification** afterwards. Keep Chrome open while checking.

`AddBrowserMyHomeVerification` adds a job mode plus private browser lease fields.
Existing jobs retain `SERVER` mode. A two-minute lease prevents competing
browsers, validates the current ID, and rejects expired submissions. Browser
results are stored in the same history/report and update only verification
metadata. Agent access remains forbidden. No website token crosses the extension
bridge, and no CAPTCHA/access protection is bypassed. The API's original server
engine remains available through `POST /jobs?mode=server`.

New API file: `Controllers/MyHomeBrowserController.cs`; new tests:
`Website API.Tests/MyHomeBrowserTests.cs` plus browser lease integration checks.
Extension setup and file manifest are in its `VELVEN_VERIFICATION.md`.

The separately observed listing-save failure was a Supabase HTTP 502 during
photo upload. `Service/SupabaseStorageService.cs` now retries transient failures
up to three times with a fresh stream and the same uniquely generated path.
Retries can replace only their own new object. Failed-upload cleanup is bounded
and cannot mask the original error. `Services/StorageUploadException.cs` and the
apartment controller return a safe photo-specific error; the existing form shows
a translated message while preserving inputs. Tests cover 502 recovery,
exhausted retries, fresh bodies, permanent failures and cancellation.

Update validation: 85 backend tests, 32 frontend unit tests, four browser UI
scenarios and seven new extension verification tests pass. The new migration was
applied to isolated local PostgreSQL. The extension's full suite has seven
existing importer/SS.ge failures, also reproduced without the new feature.
No authenticated live MyHome check was performed automatically.

The original report below documents the server implementation and initial
validation; the extension-assisted mode above supersedes its default workflow.

Implemented in the existing Angular website and the separate API checkout at
`C:\Users\user\Desktop\WebsiteAPI`. Both checkouts are needed to run this feature.
Nothing was pushed, deployed, or applied to a production database. The original
extension was only read.

## Changes

Frontend:

- `src/app/myhome-verification/`: shared verification panel, translations, progress model and tests.
- `src/app/upload-apartment/upload-apartament.ts`, `upload-apartaments.html`, `upload-apartment.css`: optional MyHome ID in the shared upload/edit form.
- `src/app/models/apartment.ts`, `src/app/services/apartment.service.ts`: field types and multipart serialization, including explicit clearing and omitted-field preservation.
- `src/app/admin-panel/admin-panel.html`, `src/app/crm/crm-dashboard/crm-dashboard.{ts,html}`, `src/app/app-module.ts`: panel integration with existing role checks.
- `server.mjs`: `API_ORIGIN` override for local API development.
- `proxy.local.conf.json`: Angular local development proxy through Express.
- `scripts/test-myhome-ui.mjs`, `package.json`, `package-lock.json`: browser tests and Playwright development dependency.

API:

- `Models/Apartment.cs`, `DTO/ApartmentDtos.cs`, `Controllers/ApartmentsController.cs`: nullable MyHome ID, validation, mutation and response support. IDs are trimmed; existing upload/edit authorization is preserved. Changing a link clears old verification evidence.
- `Models/MyHomeVerification.cs`, `Data/AppDbContext.cs`: persisted jobs and per-apartment verification history.
- `Services/MyHomeVerifier.cs`: public HTTP verification, bounded response size, request/body timeouts, conservative evidence classification, transient retries and same-site listing redirects.
- `Services/MyHomeWorker.cs`, `Program.cs`: hosted background processor with PostgreSQL advisory locks, bounded concurrency, per-result transactions, restart recovery and structured logging.
- `Controllers/MyHomeVerificationController.cs`: role-secured job creation, latest overview and searchable paginated results. Existing Supabase signing/cache supplies thumbnails.
- `Migrations/20261014094602_AddMyHomeVerification.{cs,Designer.cs}`, `Migrations/AppDbContextModelSnapshot.cs`: additive EF migration.
- `Website API.Tests/MyHomeVerifierTests.cs`, `MyHomeJobTests.cs`, test project: mocked HTTP and real local PostgreSQL/API integration tests.

## Database and job architecture

`Apartments` gains nullable `MyHomeId` (maximum 8 characters), `MyHomeStatus` and
`MyHomeCheckedAt`, plus an ID index. `MyHomeJobs` stores the trigger, snapshot
counts, state, timestamps and interruption message. `MyHomeChecks` stores the
apartment/ID snapshot, status, check time, HTTP status and evidence/error detail.
Each run preserves its own history, including `NO_MYHOME_ID` rows.

A PostgreSQL transaction lock serializes start requests. A partial unique index
allows only one `RUNNING` job. The worker uses a separate PostgreSQL session lock
so only one API instance processes jobs at a time. No Redis, separate worker
deployment, GPU, browser scraping or paid service is required. The existing
Docker deployment runs ASP.NET continuously and already uses hosted services.
Pending results resume when the API restarts. A request interrupted before its
transaction commits may be retried after restart.

All apartments are snapshotted by SQL, including unapproved records and every
dashboard page. Duplicate MyHome IDs share evidence within a job. Checks update
only verification fields and only if an apartment still has the snapshotted ID.
They never publish, unpublish, delete or change listing content.

Endpoints require the backend's existing `Admin` or `Manager` roles:

- `POST /api/MyHomeVerification/jobs`
- `GET /api/MyHomeVerification/latest`
- `GET /api/MyHomeVerification/jobs/{id}/results?status=REMOVED&search=...&page=1`

## Verification evidence and limits

The implementation adapts `scrapeRenderedListing` in the original extension's
`background.js`: Cloudflare/challenge detection, its exact Georgian deleted or
inactive message, and `__NEXT_DATA__` hydrated statement identity. No supported
official listing API or reusable server-side listing lookup was found in either
project, so the implementation uses public listing HTML.

`ACTIVE` requires a matching hydrated statement ID with listing data.
`REMOVED` requires public HTTP 404/410 or the visible deleted/inactive message.
The message inside a script/translation dictionary is insufficient.
HTTP 401/403/429, challenges, unrelated redirects and ambiguous/malformed HTML
produce `UNCERTAIN`. Network failures, timeouts and persistent server failures
produce `ERROR`. No access restriction is bypassed.

Direct local probes returned HTTP 403. Live active-listing detection has **not**
been demonstrated. MyHome client-only rendering or schema changes can yield
`UNCERTAIN`; this is intentional. MyHome explicitly combines removed and inactive
listings in its message, so `REMOVED` means the original listing is unavailable,
not proof of a permanent deletion. Automatic history retention/deletion is not
configured. History may need a retention policy after prolonged use.

Configuration environment variables:

| Variable | Default | Bounds/purpose |
| --- | --- | --- |
| `MyHome__Concurrency` | 2 | 1–8 simultaneous listing requests |
| `MyHome__BatchDelayMs` | 1000 | 250–60000 ms between normal batches |
| `MyHome__RateLimitBackoffSeconds` | 60 | 10–900 seconds after HTTP 429 |

HTTP has a 20-second header timeout and separate 20-second body deadline, a 4 MB
body limit, up to three transient attempts and at most four same-site redirects.
Authentication/CAPTCHA responses are not retried as though they were transient.

## Run locally (PowerShell)

The isolated database used for validation is `velven_myhome_test` on
`127.0.0.1:55432`. A portable PostgreSQL copy is available under the ignored
`site\tmp\pgsql` directory; it does not replace the machine's installation.
Start it if it is stopped:

```powershell
Set-Location C:\Users\user\Desktop\site
& .\tmp\pgsql\bin\pg_ctl.exe -D "$PWD\tmp\myhome-pg" -l "$PWD\tmp\myhome-pg.log" -o '-p 55432 -h 127.0.0.1' start
```

Start the API in a separate terminal using **local development** settings:

```powershell
Set-Location C:\Users\user\Desktop\WebsiteAPI
$env:ASPNETCORE_ENVIRONMENT='Development'
$env:ConnectionStrings__Default='Host=127.0.0.1;Port=55432;Database=velven_myhome_test;Username=postgres'
$env:Jwt__Key='velven-local-development-key-at-least-32-characters'
$env:Jwt__Issuer='velven-local'
$env:Jwt__Audience='velven-local'
$env:Admin__Email='admin@local.velven.test'
$env:Admin__Password='LocalVelven123!'
$env:GoogleMaps__ApiKey='local-placeholder'
$env:Supabase__Url='https://example.invalid'
$env:Supabase__SecretKey='local-placeholder'
$env:Supabase__Bucket='apartments'
dotnet ef database update
dotnet run --no-launch-profile --urls http://localhost:5099
```

These Supabase/Google placeholders allow verification against existing local
records without using production credentials. Actual photo uploads and map
features require your existing development service credentials. API startup
uses the project's existing admin-account and role seeding. The local database
has no apartments; automated tests create and remove their own fixture database.
Enter local listings through the existing upload workflow or
use a sanitized development database for manual verification.

Start Express and Angular in two more terminals:

```powershell
Set-Location C:\Users\user\Desktop\site
$env:API_ORIGIN='http://localhost:5099'
node server.mjs
```

```powershell
Set-Location C:\Users\user\Desktop\site
npx ng serve --host localhost --port 4200 --proxy-config proxy.local.conf.json
```

Open `http://localhost:4200`, sign in with the local admin credentials, enter a
MyHome ID in an apartment upload/edit, and open `/admin` or `/crm` as a manager.
Click **Verify MyHome Listings**, refresh during processing, inspect results and
use **Review removed listings**. Agents can edit their own links but cannot start
or read bulk jobs. The API applies migrations on startup using its established
convention; deployment was not performed.

## Validation

```powershell
Set-Location C:\Users\user\Desktop\WebsiteAPI
$env:MYHOME_TEST_DATABASE='Host=127.0.0.1;Port=55432;Database=velven_myhome_test;Username=postgres'
dotnet test '.\Website API.Tests\Website API.Tests.csproj'
```

Integration tests refuse non-local database hosts and create/drop a uniquely
named fixture database. Without `MYHOME_TEST_DATABASE`, that integration test is
explicitly skipped; mocked verifier tests still run.

```powershell
Set-Location C:\Users\user\Desktop\site
npm run test:unit
npm run build
npx tsc --noEmit -p tsconfig.app.json
```

Browser tests use intercepted fixture responses only. With the built Express
site running locally, run:

```powershell
$env:MYHOME_UI_BASE='http://localhost:3000'
npm run test:myhome:ui
```

The test defaults to installed Chrome; set `MYHOME_BROWSER=msedge` to use Edge.
Screenshots are written to `tmp/myhome-ui-results`. Covered states include
running progress, completion, refresh persistence, search, removed filtering,
mobile manager layout, desktop admin layout and agent restrictions in both
dashboards. Upload/edit API integration covers trimming, omitted-field
preservation, explicit clearing, invalid IDs, agent ownership and preserving
other listing fields.

Builds have existing Angular bundle/CSS budget and SweetAlert CommonJS warnings.
The backend reports an existing redundant HTTP package warning, and the test
dependency tree reports existing `System.Security.Cryptography.Pkcs` advisories.
There is no configured lint command. The original extension remains unchanged.

Validated results: 80 backend tests, 32 frontend unit tests and four browser
scenarios passed. Production Angular build and TypeScript check passed. All
migrations were applied to the isolated local PostgreSQL database. A real local
admin login and JWT-authenticated job start through Express returned HTTP 200
and 202 respectively. This smoke test used an empty apartment catalogue and did
not establish live MyHome scraping.
