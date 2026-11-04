# Apartment offers: implementation and verification

The website and API are prepared on `codex/apartment-sharing` in their respective repositories. This builds on the saved `feature/apartment-offers` work. Production deployment and production migrations have not been run.

## Behavior

Both client-card actions remain. “Offer your apartment” opens a responsive Georgian/English/Russian modal with the client's anonymous requirements, the owner's existing listings, sharing permission, validation and submission confirmation. Owners must sign in and select their own listing; users without a listing can follow the existing upload flow. The modal restores page scrolling and keyboard focus when closed and prevents repeated submissions.

Offers enter the selected client's agent queue. The existing CRM bell provides a notification with client ID, apartment details, date, sharing preference and a review link. Agents can inspect, approve or reject the apartment from `/crm/apartment-offers`. Approval does not publish it. Sharing disabled creates no additional client associations. Sharing enabled creates associations only after approval and only for compatible eligible clients, with notifications to those clients' agents.

The public board uses `ClientProfiles` created through staff intake links, with active status, explicit publication consent and a current staff assignment. Self-service Velven Match searches remain in `SavedSearches`; no duplicate origin field was added. Public responses use explicit anonymous DTOs and never include client names, phone numbers, free text or private map coordinates. Private search endpoints remain scoped to the authenticated account. Owners cannot submit listings belonging to other accounts. Non-staff users cannot review offers. Unpublished listing detail URLs now return 404 to anonymous visitors and unrelated owners; staff and the uploader retain access.

Matching calls the existing `HomeMatchRequirements` engine for goal, budget, location/map area, bedrooms, lease duration, availability and pet permissions. The offer adapter additionally checks minimum area, stated occupant limits, unknown prices and explicit buyer property conditions from existing listing tags. Optional lifestyle priorities do not become hard filters. An unconfirmed hard requirement cannot qualify an apartment for sharing.

## Database and API

Existing additive EF migration: `20261104170000_AddApartmentOffers`. It creates `ApartmentOffers` and `ApartmentOfferMatches`, relationships, review timestamps, sharing permission, notification read timestamps and unique indexes preventing duplicate offers/matches. It does not rewrite existing client data. No further migration is required; EF reports no pending model changes.

| Endpoint | Access / purpose |
| --- | --- |
| `POST /api/apartment-offers` | Signed-in listing owner; persist pending offer |
| `GET /api/apartment-offers?status=pending|approved|rejected` | Assigned agent or manager/admin review queue |
| `POST /api/apartment-offers/{id}/approve` | Assigned agent or manager/admin; transactional review and matching |
| `POST /api/apartment-offers/{id}/reject` | Assigned agent or manager/admin; reject once |
| `GET /api/apartment-offers/matches` | Additional matches for the signed-in agent's clients |
| `GET /api/client-board` | Public, anonymous eligible profiles only |
| `GET /api/Apartments/{id}` | Published listing, or unpublished listing for staff/uploader |
| `/api/Crm/notifications`, `/summary`, `/{type}/{id}/read`, `/read-all` | Existing staff notification endpoints extended for offers and matches |

## Files

Frontend feature: `src/app/clients/offer-apartment-modal.{ts,html,css}`, client-card integration in `src/app/clients/clients.{ts,html,css}`, `src/app/services/apartment-offer.service.ts`, `src/app/crm/apartment-offers/apartment-offers.{ts,html,css}`, `src/app/i18n/client-board-translations.ts`, notification types/bell, application routes and CRM navigation. Browser checks live in `scripts/test-apartment-offer-ui.mjs` and `scripts/test-apartment-offer-integration.mjs`.

Backend feature: `Controllers/ApartmentOffersController.cs`, `Services/ApartmentOfferMatching.cs`, `Models/ApartmentOffer.cs`, `Data/AppDbContext.cs`, `Controllers/ClientBoardController.cs`, `Controllers/CrmNotificationsController.cs`, `Controllers/ApartmentsController.cs`, migration/snapshot and `Website API.Tests/ApartmentOfferTests.cs`.

## Reproduce checks

Verified results: production Angular build passed; 64 frontend unit tests passed; 74 responsive UI checks passed at widths from 320 to 1920 pixels; all 184 API tests passed with zero skips, including the real API/PostgreSQL browser journey. EF migration/model validation passed. Desktop and mobile screenshots were visually inspected.

Website, from the `site` directory:

```powershell
npm run build
npm run test:unit
npm run test:offer:ui
```

API and real browser integration, from `WebsiteAPI` after the website build:

```powershell
$env:VELVEN_OFFER_BROWSER_SCRIPT = 'C:\Users\user\Desktop\site\scripts\test-apartment-offer-integration.mjs'
.\Test-Local.ps1
Remove-Item Env:\VELVEN_OFFER_BROWSER_SCRIPT
```

`Test-Local.ps1` uses the isolated PostgreSQL cluster on loopback port 55432. Tests create temporary databases, apply real migrations and remove those databases afterward. Browser integration starts a test-only loopback API host with a test authentication handler; production authentication is unchanged. It exercises Angular submission, real persistence, CRM notification, approval, rejection, sharing on/off and compatible/incompatible client delivery. Screenshots are written to `tmp/offer-integration` and responsive UI screenshots to `tmp/offer-ui`. The UI-only test uses intercepted API responses for error/empty states; the integration journey uses real controllers and PostgreSQL.

Existing build warnings concern unrelated stylesheet budgets, SweetAlert's CommonJS bundle, a redundant .NET package and NuGet vulnerability advisories for the existing transitive `System.Security.Cryptography.Pkcs` 9.0.4 dependency. This feature does not update those dependencies.
