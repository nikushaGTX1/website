# Velven Discover implementation and verification

This continues the existing Client Portal work in this Angular checkout and the
separate `C:\Users\user\Desktop\WebsiteAPI` ASP.NET checkout. Existing uncommitted
changes were retained. Both repositories must ship together.

## Implemented

Registration now offers Client / Property owner buttons. The choice changes the
registration guidance and benefits, persists as an existing Identity role, and
directs new clients to Discover and new owners to the property submission form.
Owners have listing-focused account navigation and do not receive client alerts.
`Owner` is seeded with the other Identity roles; no schema migration is needed.
Existing accounts retain their roles, and the Client backfill excludes Owners.
`scripts/test-registration-choice.mjs` verifies both choices in three languages
at 320, 390 and 1440 px, including the submitted account type and verification
continuation. Public registration accepts only Client or Owner, never staff roles.

- Client registration, existing email verification/password flows, Client role,
  private Discover route, account-menu entry and desktop/mobile notification bell.
- Persistent saved criteria, automatic save/update after Velven Match, rename,
  delete, per-search alerts and retained guest answers with retry.
- Discover new/current/saved lists, sorting/refinement, complete paginated ranked
  responses, reactive notification links and stable apartment highlighting.
- Favorites remain available without saved searches. Failed requests have visible
  recovery states. Deleted searches cannot receive another search's loading result.
- Georgian/English/Russian Discover and account copy, dynamic notification text,
  and explicit Georgian relative timestamps for browsers lacking that locale.
- API-owned saved searches, notifications, preferences, publication-triggered
  background matching and opt-in grouped email using the existing mail service.
- Strict criteria validation, current client/staff eligibility, read-history-safe
  rematching, and cancellation/revalidation of obsolete pending emails.
- Saved currency conversion snapshots keep budget qualification consistent across
  Discover and the worker. Editing the budget invalidates an old snapshot.

## Database and local development

The existing additive migration is
`WebsiteAPI/Migrations/20261023151540_AddVelvenDiscover.cs`. It adds saved searches,
matches, notifications, preference fields and publication timestamps with uniqueness
indexes. No additional migration was needed for the continuation fixes.

The API applies migrations at startup. Configure an explicitly local database
before launching it; never launch with an unspecified database configuration.
Use the local setup documented in `MYHOME_VERIFICATION.md`, then:

```powershell
$env:API_ORIGIN='http://localhost:5099'
node server.mjs
```

Run Angular with `--proxy-config proxy.local.conf.json` to use that local Express
proxy. The default `proxy.conf.json` targets the hosted API.

Client endpoints live under `/api/client`: `searches`, `matches`, `matches/seen`,
`notifications`, `notifications/summary`, `notifications/{id}/read`,
`notifications/read-all` and `preferences`. Existing matching accepts a `page`
parameter; its first-page behavior remains unchanged.

## Validation

Validated on 23 October 2026: 50 frontend tests and all 125 backend tests passed,
including the local PostgreSQL integration tests. Angular compiler checks and
the production build passed. The 27 browser scenarios passed across all three
languages and nine widths. Real provider email delivery was not exercised.

```powershell
npm run test:unit
npm run build
node node_modules/@angular/compiler-cli/bundles/src/bin/ngc.js -p tsconfig.app.json --noEmit

$env:MYHOME_TEST_DATABASE='Host=127.0.0.1;Port=55432;Database=velven_myhome_test;Username=postgres'
dotnet test 'C:\Users\user\Desktop\WebsiteAPI\Website API.Tests\Website API.Tests.csproj'
```

Backend integration tests create and remove uniquely named disposable local
databases. The lifecycle test covers concurrent deduplication, rejected homes,
read → mismatch → rematch, and unpublication. Pure tests cover malformed criteria,
localized deal classification and budget snapshots.

`scripts/test-discover-ui.mjs` uses browser-intercepted fixtures against a locally
built Express site on port 3098 (`DISCOVER_UI_BASE` overrides it). It checks
Discover, notification links, favorites without searches, profile settings and
registration validation at 320, 375, 390, 430, 768, 1024, 1280, 1440 and 1920 px in
all three languages. Screenshots are stored in ignored `tmp/discover-ui`.

Validation does not send real email or mutate hosted data. Deployment, production
migration application, and delivery through the real mail provider require the
normal release environment. Existing build warnings concern the main-page CSS
budget and SweetAlert CommonJS; NuGet also reports existing dependency warnings.
