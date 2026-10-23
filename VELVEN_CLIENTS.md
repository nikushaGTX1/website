# Velven Clients board and agent intake

Both repositories must ship together:

- Frontend: `C:\Users\user\Desktop\site`
- API: `C:\Users\user\Desktop\WebsiteAPI`

Implemented on 24 October 2026. Nothing was pushed or deployed, and no production
database was accessed. PostgreSQL integration tests use disposable local databases
on port 55432, following `MYHOME_VERIFICATION.md`.

## Behavior

`/clients` is a public, translated owners' board with household/pet illustrations,
requirements, three priorities and the assigned agent's contact. It supports API
filters, stable pagination, skeletons, empty results and retryable errors. The
navigation label is Clients / კლიენტები / Клиенты. Express metadata, sitemap and
the application's normal navigation/footer recognize the route.

The Admin panel and staff CRM dashboard include the intake card. Each signed-in
Admin, Manager or Agent can create their own links, copy/open/share them, revoke
them, view recent private submissions and change profile status. Uploaders and
public accounts do not have access. Agents cannot modify another agent's links
or profiles; Admin/Manager can revoke or update another agent's record by ID.

`/ai-home-match?intake=TOKEN` runs the existing questionnaire. At final submission
it asks for first name, phone, optional nationality, contact consent and separate,
optional publication consent. The existing Georgian-default phone utility is used
in the browser; the backend independently checks the input. A successful intake
atomically creates a profile and an assigned `CrmLead` with source `AiMatch`, then
continues through the unchanged `findMatches` / `rankMatches` results flow and the
existing Discover save behavior. Retrying match calculation does not resubmit an
already-saved intake in the same component. Contact details are not put in browser
storage. Apartment suggestions retain the district and bedroom query parameters
through the existing login continuation and prefill the upload form.

The public API uses an explicit DTO allowlist. It excludes client name, phone,
email, raw profile JSON, addresses, map coordinates, free-form answers, CRM IDs,
agent user IDs and intake tokens. Publication requires consent and Active status;
the assigned account must still have a staff role. Only rental profiles are shown
because this board's budgets are monthly. Purchase intakes still create private
profiles/CRM leads and receive the normal purchase Match results.

Profile JSON keeps validated questionnaire codes. Unknown JSON properties are
discarded before persistence; user-entered nationality, address and other-pet
descriptions remain private except the requested nationality field. Budget
conversion snapshots use the existing saved-search convention. Filters compare
overlapping budget ranges in USD/month. The move-in filter includes flexible
profiles and computes relative dates from intake creation time.

Identity verification defaults to false; completing Match never asserts KYC.
The KYC badge renders only when the persisted verification flag is true. This
change does not introduce a KYC provider or a verification workflow. The existing
questionnaire has no minimum-size question: missing size is shown as Not specified.
The available design reference was the written brief; no screenshot attachment was
present in this conversation.

## Additive migration

`WebsiteAPI/Migrations/20261023211048_AddClientBoard.cs` and its designer/snapshot:

- New `ClientIntakeLinks` and `ClientProfiles` tables; no backfill or existing-table
  mutation.
- Unique token and optional-slug indexes; status, creation time and agent indexes,
  plus stable board ordering index and relationship indexes.
- Link revocation is soft. It stops new intake without withdrawing previously
  consented profiles; use Paused/Closed to remove those from the board.
- Existing CRM lead/account deletion cascades to the associated new records,
  avoiding new restrictions on existing removal workflows.

Apply through the API's existing migration/release process. Local integration
tests apply the complete migration history to isolated fixture databases.

## Endpoints

| Method | Path | Access / behavior |
| --- | --- | --- |
| GET | `/api/client-intake-links` | Staff; own links including revoked links |
| POST | `/api/client-intake-links` | Staff; creates a cryptographically random token for the current account |
| PATCH | `/api/client-intake-links/{id}` | Staff; optional `{ "slug": "agent-example" }`, or null to clear; unique validated slug |
| DELETE | `/api/client-intake-links/{id}` | Staff; soft revocation |
| GET | `/api/client-profiles?page=1` | Staff; own recent private submissions, 20 per page |
| PATCH | `/api/client-profiles/{id}/status` | Staff; `{ "status": "Active" \| "Paused" \| "Closed" }` |
| POST | `/api/client-intake/{token}` | Public; accepts token or optional slug; existing `CrmInquiries` rate policy |
| GET | `/api/client-board` | Public; anonymised DTO only |

Intake body: `firstName`, `phone`, optional `nationality`, `consent`,
`publishConsent`, and `profile`. Contact consent is mandatory; publication consent
is mandatory only for publication. Profile input and normalized stored profile
are capped at 100 KiB, with a 110 KiB request-body limit. Invalid/revoked links
return 404; invalid contact, consent or profile returns 400. Link row locking
serializes submission with revocation; lead and profile persistence is atomic.

Board query parameters: `district` (questionnaire code), `budgetMin`, `budgetMax`
(USD/month), `moveInBefore` (`yyyy-MM-dd`), `residents` (1–7), `pets` (boolean),
`page` (default 1), `pageSize` (default 12, maximum 48). Response: `items`, `total`,
`page`, `pageSize`. All filtering and pagination run in PostgreSQL.

## Changed files

Frontend additions:

- `src/app/clients/clients.{ts,html,css}`
- `src/app/admin-panel/client-intake-card.{ts,html,css}`
- `src/app/services/client-board.service.ts`
- `src/app/i18n/client-board-translations.ts`
- `src/app/i18n/client-board-translations.spec.ts`
- `scripts/test-clients-ui.mjs`
- `VELVEN_CLIENTS.md`

Frontend integrations:

- `src/app/admin-panel/admin-panel.{ts,html}`
- `src/app/crm/crm-dashboard/crm-dashboard.{ts,html}`
- `src/app/ai-home-match/ai-home-match-page/ai-home-match-page.component.{ts,html,css}`
- `src/app/app-routing-module.ts`, `src/app/app.ts`
- `src/app/navigation/navigation.html`
- `src/app/services/seo.service.ts`
- `src/app/upload-apartment/upload-apartament.ts`
- `src/app/i18n/georgian-translations.ts`, `src/app/i18n/russian-translations.ts`
- `server.mjs`, `package.json`

API additions/integrations:

- `Controllers/ClientBoardController.cs`
- `DTO/ClientBoardDtos.cs`
- `Models/ClientBoard.cs`
- `Data/AppDbContext.cs`
- `Migrations/20261023211048_AddClientBoard.{cs,Designer.cs}`
- `Migrations/AppDbContextModelSnapshot.cs`
- `Website API.Tests/ClientBoardTests.cs`

## Verification

```powershell
npm run test:unit
npm run build

$env:MYHOME_TEST_DATABASE='Host=127.0.0.1;Port=55432;Database=velven_myhome_test;Username=postgres'
dotnet test 'C:\Users\user\Desktop\WebsiteAPI\Website API.Tests\Website API.Tests.csproj'

# Serve the built frontend on 3098 with a local API origin, as documented in
# MYHOME_VERIFICATION.md. Browser scripts intercept API requests with fixtures.
npm run test:clients:ui
node scripts/test-discover-ui.mjs
```

Frontend unit tests: 56 passed. Production build: passed. Backend: 136 passed,
zero skipped, including LocalPostgresFact integration tests. New tests cover
completed/valid coded profiles, required token/contact consent, size limits,
anonymous DTO privacy, staff role/agent ownership checks, optional slugs,
revocation, status transitions, filters, stable paging, rate limiting, atomic CRM
assignment, demoted staff and compatibility with lead/account deletion.

Clients UI: 27 scenarios passed. Existing Discover UI regression suite: 27
scenarios passed, covering notification routing, favorites without saved searches,
profile settings and registration validation. Migration model consistency check:
no pending model changes.

The Clients browser script covers English/Georgian/Russian at 320, 375, 390, 430,
768, 1024, 1280, 1440 and 1920 px. It checks navigation, translations, household
avatars, conditional KYC, filters sent to the API, paging, error recovery,
copy/share/revoke/status, intake validation and continuation to normal results.
Screenshots are under ignored `tmp/clients-ui`.

Existing build warnings remain: main-page CSS budget and SweetAlert CommonJS;
NuGet reports the existing redundant HTTP package and Pkcs dependency advisories.
External KYC, real WhatsApp/Telegram delivery and hosted deployment were not
exercised. No share message was sent.
