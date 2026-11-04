# General apartment submission and automatic SEND

The implementation is saved on `codex/apartment-sharing` in both `site` and `WebsiteAPI`. Nothing has been pushed, merged, deployed or migrated in production.

## Final workflow

Owners browse the existing public client cards and retain Contact Agent. A single **შესთავაზე ბინა** button opens `/submit-apartment`. There is no selected client, sharing checkbox, per-card submission action or bottom purple CTA banner. Empty boards show a real empty state rather than example client records.

The general form reuses the existing owner form, location catalogue, date picker, feature controls, validation, photo uploads and Supabase storage. It collects owner name/phone, rent/sale, city/district/street/address, USD price, area, rooms/bedrooms, floor/total floors, building type/condition, furniture, pet permission, parking, availability, description and photos. Residential apartment/house submissions are supported. Photos must be JPG/PNG/WebP, 1–15 files and no more than 8 MB each; the HTTP request limit is 60 MB. Submission creates both an actual private pending `Apartment` with its photo records and an `OwnerSubmission`. The server assigns an eligible reviewing staff account using pending workload. A random request key makes concurrent/retried submissions idempotent.

The existing CRM bell and `/crm/owner-submissions` show the assigned agent or authorized manager the owner's contact details and submitted information. The agent records owner contact, corrects details through the reused form, completes and saves the four verification checks, and approves or rejects. Correcting apartment details clears the previous approval/checklist. Approved submissions remain private until the explicit SEND action.

SEND publishes the verified listing and distributes it transactionally. It uses the existing Velven Match mandatory-requirements engine for deal type, city/location/map area, USD-converted budget, bedrooms, minimum area, stated resident limits, pets, rental term, availability and buyer condition. Optional priorities do not override mandatory requirements. Flexible move-in timing now correctly accepts a stated availability date in both Angular and .NET.

All compatible active agent intake profiles are associated internally, including profiles without public publication consent. Compatible private Velven Match saved searches receive the existing `SavedSearchMatch` associations and client notifications. Counts include agent profiles and distinct private client accounts; multiple searches belonging to one account do not produce duplicate SEND notifications. Client notification preferences remain respected. Agents receive their clients' apartment matches through `/crm/submission-matches` and the existing bell. No manual client selection is required. Zero matches produce an explicit result and a saved history event, without invalid associations.

PostgreSQL row locks serialize edits/reviews/SEND. Unique indexes protect submission keys, per-profile associations and the single SEND audit event. Repeated or concurrent SEND requests return the saved result. Submission, edits, contact, verification, approval/rejection and distribution events are retained in history.

## Privacy and compatibility

Public `/api/client-board` continues to use only active, publication-consented agent intake profiles assigned to current staff. Self-service Match searches remain in their separate private table and never enter public board responses. Public DTOs omit private names, phones, free text and map coordinates.

General pending apartments and submissions are accessible only to the assigned reviewer and authorized managers. Owners cannot inspect other people's submissions; unrelated agents cannot fetch a pending apartment through its direct detail URL. Generic listing publication endpoints cannot bypass the new approval/SEND workflow. Published listing responses continue to hide private owner contact details from anonymous visitors.

The obsolete offer controller, modal, service, review route and offer notifications were removed. Existing historical `ApartmentOffers` / `ApartmentOfferMatches` records and schema were retained. Existing agent owner-link intake, legacy review/publishing, CRM functions, public client filtering, and private Match workflows remain available.

## Migration

`20261104181133_GeneralApartmentSubmissions` adds general-submission, request-key, read and approval metadata to `OwnerSubmissions`, makes its agent-link reference nullable, and adds `SubmissionEvents` and `SubmissionClientMatches` with indexes/relationships. It does not delete or rewrite existing submissions or old offer records. EF reports no pending model changes. The migration was applied only to temporary local test databases.

## API and routes

| Endpoint | Behavior |
| --- | --- |
| `POST /api/owner-listings/submissions` | Anonymous, rate-limited multipart general submission; real pending apartment/photos |
| `GET /api/owner-listings/submissions` | Existing authorized review list, extended with status/approval/history |
| `GET /api/owner-listings/submissions/{id}` | Authorized submission details |
| `PATCH /api/owner-listings/submissions/{id}` | Assigned reviewer/manager edits, contact status and verification; legacy behavior retained |
| `POST /api/owner-listings/submissions/{id}/approve` | Requires recorded contact and complete verification |
| `POST /api/owner-listings/submissions/{id}/reject` | Reject before distribution |
| `POST /api/owner-listings/submissions/{id}/send` | Approved-only publication and automatic distribution, idempotent |
| `GET /api/owner-listings/matches` | Internal matches for the signed-in agent's active clients |
| `/api/Crm/notifications` and read/summary endpoints | Existing bell extended for owner submissions and distributed matches |
| `GET /api/Apartments/{id}` | Additional pending-submission privacy checks |
| `/api/apartment-offers` and its review/match routes | Removed |

New frontend routes are `/submit-apartment`, `/crm/owner-submissions/:id/edit`, and `/crm/submission-matches`. `/crm/apartment-offers` was removed. Existing `/owner/:token` remains supported.

## Validation

- Production Angular build passes.
- All 66 frontend unit tests pass, including new shared matching regressions.
- All 186 .NET tests pass, zero skips, against isolated local PostgreSQL; EF migration/model validation passes.
- Real-browser integration exercises public privacy, removal of obsolete UI, general form validation/photo submission, actual API persistence, owner contact, agent correction, verification, approval, SEND, compatible private/public recipient delivery and disabled repeat SEND. Owner page/form layouts are checked at 320, 375, 768 and 1440 pixels; agent layouts at 375 and 1440 pixels. Screenshots are stored under `tmp/submission-integration` and visually reviewed.
- The existing owner-submission browser regression passes, including legacy review, gallery, save failures, selection and responsive layouts.
- The public client/intake regression covers three languages and nine widths, including contact/filter/pagination, errors, intake privacy and existing Match results.

The browser integration uses real Angular, real controllers, real EF migrations and real PostgreSQL. Only the external cloud-storage transport is replaced by a test adapter; production storage and authentication are unchanged. Tests use temporary databases on loopback port 55432 and clean them afterward. No production email, storage or database is used.

Reproduce after building the website:

```powershell
npm run build
npm run test:unit
npm run test:submissions:integration
```

The integration runner calls the sibling API repository's `Test-Local.ps1`; its path can also be supplied to `scripts/test-apartment-submissions.ps1 -ApiDirectory ...`.

## Remaining issues and limits

No known feature blockers remain after the checks above. Production deployment and production migration application still require approval. Existing warnings remain for unrelated stylesheet budgets, SweetAlert CommonJS optimization, a redundant .NET package and the existing transitive `System.Security.Cryptography.Pkcs` vulnerability advisories. Live Supabase delivery and production email delivery were not tested against production services.

## Changed files

The manifest below includes additions, modifications and removals for this redesign. Historical backup patch files are untouched.

```text
site/D  docs/APARTMENT_SHARING.md
site/M  package.json
site/D  scripts/test-apartment-offer-integration.mjs
site/D  scripts/test-apartment-offer-ui.mjs
site/M  scripts/test-clients-ui.mjs
site/M  src/app/ai-home-match/models/home-match-profile.ts
site/M  src/app/ai-home-match/models/home-match-result.ts
site/M  src/app/ai-home-match/services/mandatory-requirements.spec.ts
site/M  src/app/ai-home-match/services/mandatory-requirements.ts
site/M  src/app/app-routing-module.ts
site/M  src/app/app.html
site/M  src/app/app.ts
site/M  src/app/clients/clients.css
site/M  src/app/clients/clients.html
site/M  src/app/clients/clients.ts
site/D  src/app/clients/offer-apartment-modal.css
site/D  src/app/clients/offer-apartment-modal.html
site/D  src/app/clients/offer-apartment-modal.ts
site/D  src/app/crm/apartment-offers/apartment-offers.css
site/D  src/app/crm/apartment-offers/apartment-offers.html
site/D  src/app/crm/apartment-offers/apartment-offers.ts
site/M  src/app/crm/owner-submissions/owner-submissions.css
site/M  src/app/crm/owner-submissions/owner-submissions.html
site/M  src/app/crm/owner-submissions/owner-submissions.ts
site/M  src/app/i18n/client-board-translations.ts
site/M  src/app/models/client.ts
site/M  src/app/notification-bell/notification-bell.html
site/M  src/app/notification-bell/notification-bell.ts
site/M  src/app/owner-listing/owner-listing.css
site/M  src/app/owner-listing/owner-listing.html
site/M  src/app/owner-listing/owner-listing.ts
site/D  src/app/services/apartment-offer.service.ts
site/M  src/app/services/owner-listing.service.ts
site/A  docs/APARTMENT_SUBMISSIONS.md
site/A  scripts/test-apartment-submission-integration.mjs
site/A  scripts/test-apartment-submissions.ps1
site/A  src/app/crm/submission-matches/submission-matches.ts
WebsiteAPI/D  Controllers/ApartmentOffersController.cs
WebsiteAPI/M  Controllers/ApartmentsController.cs
WebsiteAPI/M  Controllers/CrmNotificationsController.cs
WebsiteAPI/M  Controllers/OwnerListingsController.cs
WebsiteAPI/M  DTO/ClientBoardDtos.cs
WebsiteAPI/M  Data/AppDbContext.cs
WebsiteAPI/M  Migrations/AppDbContextModelSnapshot.cs
WebsiteAPI/M  Models/OwnerListing.cs
WebsiteAPI/M  Program.cs
WebsiteAPI/M  Service/HomeMatchRequirements.cs
WebsiteAPI/D  Services/ApartmentOfferMatching.cs
WebsiteAPI/D  Website API.Tests/ApartmentOfferTests.cs
WebsiteAPI/A  Controllers/ApartmentSubmissionsController.cs
WebsiteAPI/A  Migrations/20261104181133_GeneralApartmentSubmissions.Designer.cs
WebsiteAPI/A  Migrations/20261104181133_GeneralApartmentSubmissions.cs
WebsiteAPI/A  Services/ApartmentSubmissionMatching.cs
WebsiteAPI/A  Services/ApartmentSubmissionService.cs
WebsiteAPI/A  Website API.Tests/ApartmentSubmissionMatchingTests.cs
WebsiteAPI/A  Website API.Tests/ApartmentSubmissionTests.cs
```
