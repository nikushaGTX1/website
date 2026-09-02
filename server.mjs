import express from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import {
  brotliCompressSync,
  constants as zlibConstants,
  gzipSync,
} from 'node:zlib';

const app = express();
const port = Number(process.env.PORT) || 3000;
const apiOrigin = 'https://websiteapi-production-c970.up.railway.app';
const canonicalHost = 'velven.ge';
const canonicalOrigin = `https://${canonicalHost}`;
const legacyHosts = new Set([
  'website-production-ab09.up.railway.app',
  'website-lff1.onrender.com',
]);
const supabaseHost = 'zhijxljnddhvlxzhrckz.supabase.co';
const publicApiPaths = new Set([
  '/api/Apartments',
  '/api/Agents',
  '/api/Blog',
  '/api/Locations',
  '/api/Locations/cities',
]);
const publicApiWarmPaths = [
  '/api/Apartments?page=1&pageSize=100',
  '/api/Agents',
  '/api/Blog',
  '/api/Locations',
  '/api/Locations/cities',
];
const publicApiCache = new Map();
const publicApiRequests = new Map();
const apartmentImageCache = new Map();
const apartmentImageRequests = new Map();
const streetGeometryCache = new Map();
const boundaryGeometryCache = new Map();
const districtStreetCache = new Map();
const districtStreetRequests = new Map();
const approvalDataDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const approvalDataFile = path.join(approvalDataDirectory, 'apartment-approval-requests.json');
const districtStreetDataFile = path.join(approvalDataDirectory, 'district-street-geometry.json');
let districtStreetDataLoaded;
let districtStreetWriteQueue = Promise.resolve();
const publicCacheLifetimeMs = 60_000;
const publicCacheStaleLifetimeMs = 5 * 60_000;
const browserDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'dist',
  'site',
  'browser',
);
const defaultSeo = {
  title: 'Verified Apartments for Rent in Tbilisi | Velven',
  description: 'Find verified apartments for rent in Tbilisi with accurate prices, trusted listings, local agents and personalized AI home matching.',
  image: `${canonicalOrigin}/banner.jpg`,
  type: 'website',
};
const routeSeo = new Map([
  ['/main', defaultSeo],
  ['/ExploreProperty', {
    title: 'Apartments for Rent and Sale in Tbilisi | Velven',
    description: 'Browse verified Tbilisi apartments by location, price, bedrooms and amenities. Compare trusted listings and find your next home.',
  }],
  ['/agent-profile', {
    title: 'Trusted Real Estate Agents in Tbilisi | Velven',
    description: 'Meet experienced Tbilisi real estate agents who can help you rent, buy or list a verified property with confidence.',
  }],
  ['/blog', {
    title: 'Tbilisi Real Estate Guides and Insights | Velven',
    description: 'Read practical guides about renting, buying, neighborhoods and property trends in Tbilisi, Georgia.',
  }],
  ['/ai-home-match', {
    title: 'AI Home Matcher for Tbilisi Apartments | Velven',
    description: 'Create a personalized home profile and discover Tbilisi apartments matched to your budget, commute and lifestyle.',
  }],
  ['/find-my-home', {
    title: 'Find My Home in Tbilisi | Velven',
    description: 'Tell us what matters to you and get personalized Tbilisi apartment recommendations for your needs and lifestyle.',
  }],
  ['/about', {
    title: 'About Velven | Tbilisi Real Estate Platform',
    description: 'Learn how Velven makes apartment searches in Tbilisi clearer with verified listings, local expertise and smart matching.',
  }],
  ['/services', {
    title: 'Real Estate Services in Tbilisi | Velven',
    description: 'Explore professional property search, listing and real estate support services for renters, buyers and owners in Tbilisi.',
  }],
]);
const privateRoutePattern = /^\/(?:admin|crm(?:\/|$)|crm-questioner(?:\/|$)|questions(?:\/|$)|my-profile|my-listings|saved-listings|upload-apartment|login|premium|balance|payment-methods|my-business)/;
let sitemapCache;

function crmQuestionnaireSeo(pathname) {
  if (!/^\/(?:crm-questioner|questions)\/(?:agent-)?[a-z0-9-]+$/i.test(pathname)) return undefined;
  return {
    title: 'Your Personalized Home Search | Velven',
    description: 'Complete this short, secure questionnaire so your Velven real estate agent can prepare a personalized property shortlist for you.',
    image: `${canonicalOrigin}/velven-questionnaire-preview-v2.jpg`,
    imageAlt: 'Velven — Your Personalized Home Search',
    imageWidth: '1200',
    imageHeight: '630',
    imageType: 'image/jpeg',
    type: 'website',
  };
}

app.use((request, response, next) => {
  const forwardedHost = request.get('x-forwarded-host')?.split(',')[0].trim();
  const requestHost = (forwardedHost || request.get('host') || '').split(':')[0].toLowerCase();

  if (requestHost === `www.${canonicalHost}` || legacyHosts.has(requestHost)) {
    response.redirect(301, `https://${canonicalHost}${request.originalUrl}`);
    return;
  }

  next();
});

app.use((_request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  next();
});

app.get('/map-data/street', async (request, response) => {
  const requestedStreet = typeof request.query.street === 'string' ? request.query.street.trim() : '';
  const streetCorrections = new Map([
    ['a.kalandaze st.', 'Ana Kalandadze Street'],
    ['a. kalandaze st.', 'Ana Kalandadze Street'],
    ['a.kalandadze st.', 'Ana Kalandadze Street'],
    ['ა.კალანდაძე ქუჩა', 'ანა კალანდაძის ქუჩა'],
  ]);
  const street = streetCorrections.get(requestedStreet.toLowerCase()) || requestedStreet;
  const requestedBbox = typeof request.query.bbox === 'string'
    ? request.query.bbox.split(',').map(Number)
    : [];
  const validBbox = requestedBbox.length === 4
    && requestedBbox.every(Number.isFinite)
    && requestedBbox[0] >= 41.50 && requestedBbox[2] <= 41.92
    && requestedBbox[1] >= 44.55 && requestedBbox[3] <= 45.10
    && requestedBbox[0] < requestedBbox[2] && requestedBbox[1] < requestedBbox[3];
  const bbox = validBbox ? requestedBbox : [41.50, 44.55, 41.92, 45.10];
  if (!street || street.length > 120) {
    response.status(400).json({ message: 'A valid street name is required.' });
    return;
  }
  const cacheKey = `${street.toLowerCase()}:${bbox.join(',')}`;
  const cached = streetGeometryCache.get(cacheKey);
  if (cached) {
    response.setHeader('Cache-Control', 'public, max-age=86400');
    response.json(cached);
    return;
  }
  try {
    const tokens = street.replace(/[.,]/g, ' ').split(/\s+/)
      .filter((token) => token.length >= 2 && !/^(street|st|avenue|ave|road|rd|lane|alley|square|i|ii|iii|iv)$/i.test(token))
      .reverse();
    // Names commonly begin with a person's first name, so search using the
    // final meaningful token (normally the distinctive surname).
    const searchToken = (tokens[0] || street).replace(/[\\"\n\r]/g, (character) => `\\${character}`);
    const query = `[out:json][timeout:10];way["highway"][~"^(name|name:en|name:ka)$"~"${searchToken}",i](${bbox.join(',')});out geom;`;
    const nominatimParams = new URLSearchParams({
      q: `${street}, Tbilisi, Georgia`,
      format: 'jsonv2',
      limit: '8',
      countrycodes: 'ge',
      polygon_geojson: '1',
      viewbox: `${bbox[1]},${bbox[2]},${bbox[3]},${bbox[0]}`,
      bounded: '1',
    });
    const nominatim = await fetch(`https://nominatim.openstreetmap.org/search?${nominatimParams}`, {
      headers: { 'Accept-Language': 'ka,en;q=0.9', 'User-Agent': 'VelvenRealEstate/1.0' },
      signal: AbortSignal.timeout(8000),
    }).catch(() => undefined);
    if (nominatim?.ok) {
      const matches = await nominatim.json();
      const lines = matches.flatMap((match) => {
        if (match.geojson?.type === 'LineString') return [match.geojson.coordinates];
        if (match.geojson?.type === 'MultiLineString') return match.geojson.coordinates;
        return [];
      }).filter((line) => line.length >= 2);
      if (lines.length) {
        const result = { lines };
        streetGeometryCache.set(cacheKey, result);
        response.setHeader('Cache-Control', 'public, max-age=86400');
        response.json(result);
        return;
      }
    }
    const encodedQuery = encodeURIComponent(query);
    // For guaranteed coverage, point this at a managed or self-hosted
    // Overpass instance. Public community instances may rate-limit any IP.
    const providers = process.env.OVERPASS_API_URL
      ? [process.env.OVERPASS_API_URL.replace(/\/$/, '')]
      : [
          'https://overpass.private.coffee/api/interpreter',
          'https://overpass-api.de/api/interpreter',
        ];
    const payload = await Promise.any(providers.map(async (provider) => {
      const upstream = await fetch(`${provider}?data=${encodedQuery}`, {
        signal: AbortSignal.timeout(12000),
      });
      if (!upstream.ok) throw new Error(`${provider} returned HTTP ${upstream.status}.`);
      const candidate = await upstream.json();
      if (!(candidate.elements || []).some((element) => (element.geometry || []).length >= 2)) {
        throw new Error(`${provider} returned no street geometry.`);
      }
      return candidate;
    }));
    const result = {
      lines: (payload.elements || []).map((element) =>
        (element.geometry || []).map((point) => [point.lon, point.lat]),
      ).filter((line) => line.length >= 2),
    };
    streetGeometryCache.set(cacheKey, result);
    if (streetGeometryCache.size > 500) streetGeometryCache.delete(streetGeometryCache.keys().next().value);
    response.setHeader('Cache-Control', 'public, max-age=86400');
    response.json(result);
  } catch (error) {
    console.error('Street geometry proxy error:', error);
    response.setHeader('Cache-Control', 'no-store');
    response.json({ lines: [] });
  }
});

app.get('/map-data/boundary', async (request, response) => {
  const relationId = Number(request.query.relationId);
  if (!Number.isSafeInteger(relationId) || relationId <= 0) {
    response.status(400).json({ message: 'A valid OpenStreetMap relation ID is required.' });
    return;
  }
  const cached = boundaryGeometryCache.get(relationId);
  if (cached) {
    response.setHeader('Cache-Control', 'public, max-age=604800');
    response.json(cached);
    return;
  }
  try {
    const upstream = await fetch(
      `https://polygons.openstreetmap.fr/get_geojson.py?id=${relationId}&params=0`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!upstream.ok) throw new Error(`Boundary service returned HTTP ${upstream.status}.`);
    const geometry = await upstream.json();
    if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) {
      throw new Error('Boundary service returned invalid geometry.');
    }
    boundaryGeometryCache.set(relationId, geometry);
    response.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=2592000');
    response.json(geometry);
  } catch (error) {
    console.error('Boundary geometry proxy error:', error);
    response.status(502).json({ message: 'Boundary geometry is temporarily unavailable.' });
  }
});

async function loadSavedDistrictStreets() {
  if (!districtStreetDataLoaded) {
    districtStreetDataLoaded = (async () => {
      try {
        const saved = JSON.parse(await readFile(districtStreetDataFile, 'utf8'));
        for (const [relationId, result] of Object.entries(saved)) {
          if (Array.isArray(result?.streets) && result.streets.length) {
            districtStreetCache.set(Number(relationId), result);
          }
        }
      } catch (error) {
        if (error?.code !== 'ENOENT') console.error('Could not read saved street geometry:', error);
      }
    })();
  }
  await districtStreetDataLoaded;
}

function saveDistrictStreets() {
  districtStreetWriteQueue = districtStreetWriteQueue.then(async () => {
    await mkdir(approvalDataDirectory, { recursive: true });
    const temporaryFile = `${districtStreetDataFile}.${process.pid}.tmp`;
    await writeFile(
      temporaryFile,
      JSON.stringify(Object.fromEntries(districtStreetCache)),
      'utf8',
    );
    await rename(temporaryFile, districtStreetDataFile);
  }).catch((error) => console.error('Could not save street geometry:', error));
  return districtStreetWriteQueue;
}

async function downloadDistrictStreets(relationId) {
  const query = `[out:json][timeout:40];rel(${relationId});map_to_area->.districtArea;way(area.districtArea)["highway"]["name"];out tags geom;`;
  const providers = process.env.OVERPASS_API_URL
    ? [process.env.OVERPASS_API_URL.replace(/\/$/, '')]
    : [
        'https://overpass.kumi.systems/api/interpreter',
        'https://overpass.private.coffee/api/interpreter',
        'https://overpass-api.de/api/interpreter',
      ];
  let lastError;
  for (const provider of providers) {
    try {
      const upstream = await fetch(`${provider}?data=${encodeURIComponent(query)}`, {
        signal: AbortSignal.timeout(35000),
      });
      if (!upstream.ok) throw new Error(`${provider} returned HTTP ${upstream.status}.`);
      const payload = await upstream.json();
      const streets = (payload.elements || []).map((element) => ({
        names: [...new Set([
          element.tags?.name,
          element.tags?.['name:en'],
          element.tags?.['name:ka'],
        ].filter(Boolean))],
        line: (element.geometry || []).map((point) => [point.lon, point.lat]),
      })).filter((street) => street.names.length && street.line.length >= 2);
      if (!streets.length) throw new Error(`${provider} returned no district streets.`);
      return { streets };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Every street geometry provider failed.');
}

async function getDistrictStreets(relationId) {
  await loadSavedDistrictStreets();
  if (districtStreetCache.has(relationId)) return districtStreetCache.get(relationId);
  if (districtStreetRequests.has(relationId)) return districtStreetRequests.get(relationId);
  const pending = downloadDistrictStreets(relationId)
    .then(async (result) => {
      districtStreetCache.set(relationId, result);
      await saveDistrictStreets();
      return result;
    })
    .finally(() => districtStreetRequests.delete(relationId));
  districtStreetRequests.set(relationId, pending);
  return pending;
}

app.get('/map-data/district-streets', async (request, response) => {
  const relationId = Number(request.query.relationId);
  if (!Number.isSafeInteger(relationId) || relationId <= 0) {
    response.status(400).json({ message: 'A valid OpenStreetMap relation ID is required.' });
    return;
  }
  try {
    const result = await getDistrictStreets(relationId);
    response.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=2592000');
    response.json(result);
  } catch (error) {
    console.error('District street geometry proxy error:', error);
    response.status(502).json({ message: 'District streets are temporarily unavailable.' });
  }
});

app.get('/overpass-api', async (request, response) => {
  const query = typeof request.query.data === 'string' ? request.query.data.trim() : '';
  if (!query || query.length > 12000) {
    response.status(400).json({ message: 'A valid OpenStreetMap query is required.' });
    return;
  }
  try {
    let upstream;
    for (const baseUrl of [
      'https://overpass.kumi.systems',
      'https://overpass.private.coffee',
      'https://overpass-api.de',
    ]) {
      try {
        const candidate = await fetch(`${baseUrl}/api/interpreter?data=${encodeURIComponent(query)}`, {
          signal: AbortSignal.timeout(30000),
        });
        if (candidate.ok) {
          upstream = candidate;
          break;
        }
        upstream = candidate;
      } catch {
        // Try the next independent mirror.
      }
    }
    if (!upstream) throw new Error('Every OpenStreetMap mirror failed.');
    const body = await upstream.text();
    response.status(upstream.status);
    response.type(upstream.headers.get('content-type') || 'application/json');
    response.setHeader('Cache-Control', 'public, max-age=3600');
    response.send(body);
  } catch (error) {
    console.error('OpenStreetMap query proxy error:', error);
    response.status(502).json({ message: 'OpenStreetMap data is temporarily unavailable.' });
  }
});

async function readApprovalRequests() {
  try {
    const requests = JSON.parse(await readFile(approvalDataFile, 'utf8'));
    return Array.isArray(requests) ? requests : [];
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeApprovalRequests(requests) {
  await mkdir(approvalDataDirectory, { recursive: true });
  const temporaryFile = `${approvalDataFile}.${process.pid}.tmp`;
  await writeFile(temporaryFile, JSON.stringify(requests), 'utf8');
  await rename(temporaryFile, approvalDataFile);
}

function tokenRoles(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return [];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const parsed = JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
    const claims = [
      parsed.role,
      parsed.roles,
      parsed['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'],
    ];
    return claims.flatMap((claim) => Array.isArray(claim) ? claim : [claim])
      .filter(Boolean)
      .map((role) => String(role).toLowerCase());
  } catch {
    return [];
  }
}

async function authenticatedApprovalUser(request) {
  const authorization = request.get('authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const upstream = await fetch(`${apiOrigin}/api/Profile/me`, {
    headers: { authorization },
  });
  if (!upstream.ok) return null;

  const user = await upstream.json();
  return {
    ...user,
    roles: [...new Set([
      ...(Array.isArray(user.roles) ? user.roles : []),
      user.role,
      user.isAdmin ? 'admin' : '',
      ...tokenRoles(token),
    ].filter(Boolean).map((role) => String(role).toLowerCase()))],
  };
}

app.post(
  '/api/approval-requests',
  express.json({ limit: '30mb' }),
  async (request, response) => {
    try {
      const user = await authenticatedApprovalUser(request);
      if (!user) {
        response.status(401).json({ message: 'Sign in to submit an apartment.' });
        return;
      }
      if (!request.body?.apartment || typeof request.body.apartment.title !== 'string') {
        response.status(400).json({ message: 'A valid apartment submission is required.' });
        return;
      }

      const item = {
        id: randomUUID(),
        apartment: request.body.apartment,
        status: 'pending',
        submittedAt: new Date().toISOString(),
        submittedByUserId: user.id || undefined,
        submittedByName: user.fullName || user.userName || 'User',
        submittedByEmail: user.email || '',
      };
      const requests = await readApprovalRequests();
      await writeApprovalRequests([item, ...requests]);
      response.status(201).json(item);
    } catch (error) {
      console.error('Approval submission error:', error);
      response.status(500).json({ message: 'Could not save the apartment for approval.' });
    }
  },
);

app.get('/api/approval-requests', async (request, response) => {
  try {
    const user = await authenticatedApprovalUser(request);
    if (!user) {
      response.status(401).json({ message: 'Sign in to view apartment requests.' });
      return;
    }

    const requests = await readApprovalRequests();
    if (user.roles.includes('admin')) {
      response.json(requests);
      return;
    }

    const email = String(user.email || '').toLowerCase();
    response.json(requests.filter((item) =>
      (user.id && item.submittedByUserId === user.id) ||
      (email && String(item.submittedByEmail || '').toLowerCase() === email)
    ));
  } catch (error) {
    console.error('Approval list error:', error);
    response.status(500).json({ message: 'Could not load apartment requests.' });
  }
});

app.patch(
  '/api/approval-requests/:id',
  express.json({ limit: '32kb' }),
  async (request, response) => {
    try {
      const user = await authenticatedApprovalUser(request);
      if (!user?.roles.includes('admin')) {
        response.status(403).json({ message: 'Only admins can review apartment requests.' });
        return;
      }

      const status = request.body?.status;
      if (!['pending', 'approved', 'declined'].includes(status)) {
        response.status(400).json({ message: 'Invalid approval status.' });
        return;
      }

      const requests = await readApprovalRequests();
      const index = requests.findIndex((item) => item.id === request.params.id);
      if (index < 0) {
        response.status(404).json({ message: 'Apartment request not found.' });
        return;
      }

      requests[index] = {
        ...requests[index],
        status,
        reviewedAt: status === 'pending' ? undefined : new Date().toISOString(),
        reviewedBy: status === 'pending'
          ? undefined
          : (user.fullName || user.userName || 'Admin'),
        message: request.body.message || undefined,
        publishedApartmentId: status === 'approved'
          ? request.body.publishedApartmentId
          : undefined,
      };
      await writeApprovalRequests(requests);
      response.json(requests[index]);
    } catch (error) {
      console.error('Approval update error:', error);
      response.status(500).json({ message: 'Could not update the apartment request.' });
    }
  },
);

function validateApartmentImageUrl(value) {
  const imageUrl = new URL(value);
  if (
    imageUrl.protocol !== 'https:' ||
    imageUrl.hostname !== supabaseHost ||
    !imageUrl.pathname.startsWith('/storage/v1/object/sign/apartments/')
  ) {
    throw new Error('Unsupported apartment image URL.');
  }
  return imageUrl;
}

async function fetchApartmentImage(value) {
  const imageUrl = validateApartmentImageUrl(value);
  const cacheKey = imageUrl.pathname;
  const cached = apartmentImageCache.get(cacheKey);

  if (cached?.expiresAt > Date.now()) {
    return cached;
  }
  if (apartmentImageRequests.has(cacheKey)) {
    return apartmentImageRequests.get(cacheKey);
  }

  const requestPromise = (async () => {
    const upstreamResponse = await fetch(imageUrl);
    if (!upstreamResponse.ok) {
      throw new Error(`Supabase image returned HTTP ${upstreamResponse.status}.`);
    }

    const image = {
      body: Buffer.from(await upstreamResponse.arrayBuffer()),
      contentType: upstreamResponse.headers.get('content-type') || 'image/jpeg',
      etag: upstreamResponse.headers.get('etag'),
      expiresAt: Date.now() + 50 * 60_000,
    };

    apartmentImageCache.set(cacheKey, image);
    if (apartmentImageCache.size > 100) {
      apartmentImageCache.delete(apartmentImageCache.keys().next().value);
    }
    return image;
  })().finally(() => apartmentImageRequests.delete(cacheKey));

  apartmentImageRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

function warmApartmentImages(body) {
  try {
    const payload = JSON.parse(body.toString('utf8'));
    const apartments = Array.isArray(payload) ? payload : [payload];
    const imageUrls = apartments.flatMap((apartment) => {
      const gallery = Array.isArray(apartment?.images) ? [...apartment.images] : [];
      gallery.sort(
        (left, right) =>
          Number(right?.isCover) - Number(left?.isCover) ||
          (left?.sortOrder ?? 0) - (right?.sortOrder ?? 0),
      );
      const galleryUrls = gallery
        .slice(0, 5)
        .map((image) => image?.url || image?.storagePath)
        .filter(Boolean);

      return galleryUrls.length
        ? galleryUrls
        : [apartment?.imageUrls?.[0] || apartment?.imageUrl].filter(Boolean);
    });

    for (const imageUrl of new Set(imageUrls.filter(Boolean))) {
      void fetchApartmentImage(imageUrl).catch((error) =>
        console.error('Apartment image warm-up failed:', error),
      );
    }
  } catch (error) {
    console.error('Could not inspect apartment images for warm-up:', error);
  }
}

function warmApartmentDetails(body) {
  try {
    const apartments = JSON.parse(body.toString('utf8'));
    if (!Array.isArray(apartments)) {
      return;
    }

    const detailPaths = apartments
      .slice(0, 12)
      .map((apartment) => apartment?.id)
      .filter((id) => id !== undefined && id !== null)
      .map((id) => `/api/Apartments/${id}`);

    void Promise.allSettled(
      detailPaths.map((detailPath) => fetchPublicApi(detailPath, false)),
    );
  } catch (error) {
    console.error('Could not warm apartment details:', error);
  }
}

app.get('/media/apartment-image', async (request, response) => {
  try {
    const source = String(request.query.url || '');
    const image = await fetchApartmentImage(source);
    response.setHeader('Content-Type', image.contentType);
    response.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    if (image.etag) {
      response.setHeader('ETag', image.etag);
    }
    response.send(image.body);
  } catch (error) {
    console.error('Apartment image proxy error:', error);
    response.status(404).sendFile(path.join(browserDirectory, 'property-placeholder.svg'));
  }
});

function pointInsideRing(longitude, latitude, ring) {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const [currentLongitude, currentLatitude] = ring[current];
    const [previousLongitude, previousLatitude] = ring[previous];
    const crosses = (currentLatitude > latitude) !== (previousLatitude > latitude)
      && longitude < ((previousLongitude - currentLongitude) * (latitude - currentLatitude))
        / (previousLatitude - currentLatitude) + currentLongitude;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInsidePolygon(longitude, latitude, coordinates) {
  if (!pointInsideRing(longitude, latitude, coordinates[0])) return false;
  return coordinates.slice(1).every((hole) => !pointInsideRing(longitude, latitude, hole));
}

async function fetchAllApartmentsForAreaSearch() {
  const pageSize = 100;
  const apartments = [];

  for (let page = 1; page <= 100; page += 1) {
    const apiResponse = await fetchPublicApi(
      `/api/Apartments?page=${page}&pageSize=${pageSize}`,
      false,
    );
    if (apiResponse.status < 200 || apiResponse.status >= 300) {
      throw new Error(`Apartments API returned HTTP ${apiResponse.status} on page ${page}.`);
    }

    const items = JSON.parse(apiResponse.body.toString('utf8'));
    if (!Array.isArray(items)) {
      throw new Error('Apartments API returned an invalid response.');
    }

    apartments.push(...items);
    if (items.length < pageSize) break;
  }

  return apartments;
}

app.post(
  '/api/apartments/within-area',
  express.json({ limit: '128kb' }),
  async (request, response) => {
    try {
      const geometry = request.body?.type === 'Feature'
        ? request.body.geometry
        : request.body;
      const selectedArea = request.body?.type === 'Feature'
        ? String(request.body.properties?.areaName || '').trim()
        : '';
      const coordinates = geometry?.coordinates;
      const ring = coordinates?.[0];
      const validRing = geometry?.type === 'Polygon'
        && Array.isArray(ring)
        && ring.length >= 4
        && ring.length <= 1000
        && ring.every((position) =>
          Array.isArray(position)
          && position.length >= 2
          && Number.isFinite(Number(position[0]))
          && Number.isFinite(Number(position[1]))
          && Number(position[0]) >= -180
          && Number(position[0]) <= 180
          && Number(position[1]) >= -90
          && Number(position[1]) <= 90
        );

      if (!validRing) {
        response.status(400).json({ message: 'A valid GeoJSON Polygon is required.' });
        return;
      }

      const apartments = await fetchAllApartmentsForAreaSearch();
      const matches = apartments.filter((apartment) => {
        const latitude = Number(apartment.latitude ?? apartment.Latitude);
        const longitude = Number(apartment.longitude ?? apartment.Longitude);
        const hasCoordinates = Number.isFinite(latitude)
          && Number.isFinite(longitude)
          && latitude !== 0
          && longitude !== 0;

        if (hasCoordinates) {
          return pointInsidePolygon(longitude, latitude, coordinates);
        }

        return selectedArea
          && String(apartment.district || apartment.District || '')
            .trim()
            .toLowerCase() === selectedArea.toLowerCase();
      });

      response.setHeader('Cache-Control', 'no-store');
      response.json(matches);
    } catch (error) {
      console.error('Draw Area search error:', error);
      response.status(500).json({ message: 'Could not search within the selected area.' });
    }
  },
);

function compressedApiBody(request, response, apiResponse) {
  if (apiResponse.body.length < 1024) {
    return apiResponse.body;
  }

  const acceptedEncoding = request.get('accept-encoding') || '';
  response.vary('Accept-Encoding');

  if (acceptedEncoding.includes('br')) {
    apiResponse.brotliBody ||= brotliCompressSync(apiResponse.body, {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: 4,
      },
    });
    response.setHeader('Content-Encoding', 'br');
    return apiResponse.brotliBody;
  }

  if (acceptedEncoding.includes('gzip')) {
    apiResponse.gzipBody ||= gzipSync(apiResponse.body, { level: 6 });
    response.setHeader('Content-Encoding', 'gzip');
    return apiResponse.gzipBody;
  }

  return apiResponse.body;
}

function sendApiResponse(request, response, apiResponse, cacheStatus) {
  response.status(apiResponse.status);
  apiResponse.headers.forEach(([name, value]) => response.setHeader(name, value));
  response.setHeader('X-White-Tower-Cache', cacheStatus);
  response.send(compressedApiBody(request, response, apiResponse));
}

async function fetchPublicApi(cacheKey, shouldWarmImages = true) {
  if (publicApiRequests.has(cacheKey)) {
    return publicApiRequests.get(cacheKey);
  }

  const requestPromise = (async () => {
    const upstreamResponse = await fetch(new URL(cacheKey, apiOrigin));
    const body = Buffer.from(await upstreamResponse.arrayBuffer());
    const headers = [];

    upstreamResponse.headers.forEach((value, name) => {
      if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(name)) {
        headers.push([name, value]);
      }
    });

    const apiResponse = {
      status: upstreamResponse.status,
      headers,
      body,
      expiresAt: Date.now() + publicCacheLifetimeMs,
      staleUntil: Date.now() + publicCacheStaleLifetimeMs,
    };

    if (upstreamResponse.ok) {
      publicApiCache.set(cacheKey, apiResponse);
      if (new URL(cacheKey, apiOrigin).pathname === '/api/Apartments') {
        warmApartmentImages(apiResponse.body);
        warmApartmentDetails(apiResponse.body);
      } else if (shouldWarmImages && /^\/api\/Apartments\/\d+$/.test(cacheKey)) {
        warmApartmentImages(apiResponse.body);
      }
    }

    return apiResponse;
  })().finally(() => publicApiRequests.delete(cacheKey));

  publicApiRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

async function warmPublicApis() {
  await Promise.allSettled(
    publicApiWarmPaths.map((apiPath) =>
      fetchPublicApi(apiPath).catch((error) => {
        console.error(`API warm-up failed for ${apiPath}:`, error);
        throw error;
      }),
    ),
  );
  await Promise.allSettled([...apartmentImageRequests.values()]);
}

app.use('/api', async (request, response) => {
  try {
    const requestUrl = new URL(request.originalUrl, apiOrigin);
    const cacheKey = `${requestUrl.pathname}${requestUrl.search}`;
    const cacheable =
      request.method === 'GET' &&
      !request.get('authorization') &&
      (publicApiPaths.has(requestUrl.pathname) ||
        /^\/api\/Apartments\/\d+$/.test(requestUrl.pathname));

    if (cacheable) {
      const cached = publicApiCache.get(cacheKey);

      if (cached?.expiresAt > Date.now()) {
        if (/^\/api\/Apartments\/\d+$/.test(cacheKey)) {
          warmApartmentImages(cached.body);
        }
        sendApiResponse(request, response, cached, 'HIT');
        return;
      }

      if (cached?.staleUntil > Date.now()) {
        if (/^\/api\/Apartments\/\d+$/.test(cacheKey)) {
          warmApartmentImages(cached.body);
        }
        sendApiResponse(request, response, cached, 'STALE');
        void fetchPublicApi(cacheKey).catch((error) =>
          console.error(`API cache refresh failed for ${cacheKey}:`, error),
        );
        return;
      }

      const apiResponse = await fetchPublicApi(cacheKey);
      sendApiResponse(request, response, apiResponse, 'MISS');
      return;
    }

    const targetUrl = new URL(request.originalUrl, apiOrigin);
    const headers = new Headers();

    for (const [name, value] of Object.entries(request.headers)) {
      if (value && !['host', 'connection', 'content-length'].includes(name)) {
        headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
    }

    const hasBody = !['GET', 'HEAD'].includes(request.method);
    const upstreamResponse = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: hasBody ? Readable.toWeb(request) : undefined,
      duplex: hasBody ? 'half' : undefined,
      redirect: 'manual',
    });

    response.status(upstreamResponse.status);
    upstreamResponse.headers.forEach((value, name) => {
      if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(name)) {
        response.setHeader(name, value);
      }
    });

    if (upstreamResponse.body) {
      Readable.fromWeb(upstreamResponse.body).pipe(response);
    } else {
      response.end();
    }

    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && upstreamResponse.ok) {
      publicApiCache.clear();
    }
  } catch (error) {
    console.error('API proxy error:', error);
    response.status(502).json({ message: 'The API is currently unavailable.' });
  }
});

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function plainText(value, maximumLength = 165) {
  const text = String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s*Source:\s*https?:\/\/\S+[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maximumLength) return text;
  return `${text.slice(0, maximumLength - 1).trimEnd()}…`;
}

function replaceMeta(document, attribute, name, content) {
  const tag = `<meta ${attribute}="${name}" content="${escapeHtml(content)}" />`;
  const pattern = new RegExp(`<meta\\s+${attribute}=["']${name}["'][^>]*>`, 'i');
  return pattern.test(document)
    ? document.replace(pattern, tag)
    : document.replace('</head>', `    ${tag}\n  </head>`);
}

function injectSeo(document, seo) {
  const canonicalUrl = seo.canonicalUrl || `${canonicalOrigin}/main`;
  const openGraphUrl = seo.openGraphUrl || canonicalUrl;
  const title = seo.title || defaultSeo.title;
  const description = seo.description || defaultSeo.description;
  const image = seo.image || defaultSeo.image;
  const robots = seo.robots || 'index, follow, max-image-preview:large';
  const structuredData = JSON.stringify(seo.structuredData || {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    name: 'Velven',
    url: `${canonicalOrigin}/main`,
    logo: `${canonicalOrigin}/velven-logo.svg`,
    image: defaultSeo.image,
    telephone: '+995 568 444 220',
    priceRange: '$$',
    address: { '@type': 'PostalAddress', addressLocality: 'Tbilisi', addressCountry: 'GE' },
    areaServed: { '@type': 'City', name: 'Tbilisi' },
  }).replace(/</g, '\\u003c');

  document = document.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  document = replaceMeta(document, 'name', 'description', description);
  document = replaceMeta(document, 'name', 'robots', robots);
  document = replaceMeta(document, 'property', 'og:type', seo.type || 'website');
  document = replaceMeta(document, 'property', 'og:title', title);
  document = replaceMeta(document, 'property', 'og:description', description);
  document = replaceMeta(document, 'property', 'og:url', openGraphUrl);
  document = replaceMeta(document, 'property', 'og:image', image);
  document = replaceMeta(document, 'property', 'og:image:secure_url', image);
  document = replaceMeta(document, 'property', 'og:image:alt', seo.imageAlt || 'Velven');
  if (seo.imageWidth) document = replaceMeta(document, 'property', 'og:image:width', seo.imageWidth);
  if (seo.imageHeight) document = replaceMeta(document, 'property', 'og:image:height', seo.imageHeight);
  if (seo.imageType) document = replaceMeta(document, 'property', 'og:image:type', seo.imageType);
  document = replaceMeta(document, 'name', 'twitter:title', title);
  document = replaceMeta(document, 'name', 'twitter:description', description);
  document = replaceMeta(document, 'name', 'twitter:image', image);
  document = replaceMeta(document, 'name', 'twitter:image:alt', seo.imageAlt || 'Velven');
  document = document.replace(
    /<link\s+rel=["']canonical["'][^>]*>/i,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`,
  );
  return document.replace(
    /<script\s+type=["']application\/ld\+json["']>[\s\S]*?<\/script>/i,
    `<script type="application/ld+json">${structuredData}</script>`,
  );
}

async function apartmentSeo(pathname) {
  const match = /^\/apartments\/(\d+)$/.exec(pathname);
  if (!match) return undefined;
  const apiResponse = await fetchPublicApi(`/api/Apartments/${match[1]}`, false);
  if (apiResponse.status === 404) return null;
  if (apiResponse.status < 200 || apiResponse.status >= 300) return undefined;

  const apartment = JSON.parse(apiResponse.body.toString('utf8'));
  const location = [apartment.street, apartment.district, apartment.city]
    .filter(Boolean)
    .join(', ');
  const title = plainText(apartment.title, 70) || `Apartment in ${location || 'Tbilisi'}`;
  const description = plainText(apartment.description)
    || `${apartment.bedrooms || 0}-bedroom apartment in ${location || 'Tbilisi'} with verified property details from Velven.`;
  const canonicalUrl = `${canonicalOrigin}${pathname}`;
  const sourceImage = apartment.images?.find((item) => item.isCover)?.url
    || apartment.images?.[0]?.url
    || apartment.imageUrl;
  const image = sourceImage
    ? `${canonicalOrigin}/seo/apartment-image/${apartment.id}`
    : defaultSeo.image;

  return {
    title: `${title} | Velven`,
    description,
    canonicalUrl,
    image,
    type: 'product',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'Apartment',
      name: title,
      description,
      image: image === defaultSeo.image ? undefined : [image],
      url: canonicalUrl,
      floorSize: apartment.sizeSquareMeters
        ? { '@type': 'QuantitativeValue', value: apartment.sizeSquareMeters, unitCode: 'MTK' }
        : undefined,
      numberOfBedrooms: apartment.bedrooms || undefined,
      numberOfBathroomsTotal: apartment.bathrooms || undefined,
      address: {
        '@type': 'PostalAddress',
        streetAddress: apartment.address || apartment.street || undefined,
        addressLocality: apartment.city || 'Tbilisi',
        addressRegion: apartment.district || apartment.region || undefined,
        addressCountry: 'GE',
      },
      offers: {
        '@type': 'Offer',
        price: apartment.price,
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        url: canonicalUrl,
      },
    },
  };
}

async function agentSeo(pathname) {
  const match = /^\/agent-profile\/([^/]+)$/.exec(pathname);
  if (!match) return undefined;
  const agentId = encodeURIComponent(match[1]);
  const apiResponse = await fetchPublicApi(`/api/Agents/${agentId}`, false);
  if (apiResponse.status === 404) return null;
  if (apiResponse.status < 200 || apiResponse.status >= 300) return undefined;
  const agent = JSON.parse(apiResponse.body.toString('utf8'));
  const name = plainText(agent.fullName || agent.userName || agent.name, 70) || 'Velven Agent';
  const description = plainText(agent.bio)
    || `View ${name}'s profile, experience and verified property listings with Velven in Tbilisi.`;
  const canonicalUrl = `${canonicalOrigin}${pathname}`;
  return {
    title: `${name} — Real Estate Agent in Tbilisi | Velven`,
    description,
    canonicalUrl,
    image: defaultSeo.image,
    type: 'profile',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'RealEstateAgent',
      name,
      description,
      url: canonicalUrl,
      areaServed: { '@type': 'City', name: 'Tbilisi' },
    },
  };
}

app.get('/seo/apartment-image/:id', async (request, response) => {
  try {
    if (!/^\d+$/.test(request.params.id)) {
      response.sendStatus(404);
      return;
    }
    const apiResponse = await fetchPublicApi(`/api/Apartments/${request.params.id}`, false);
    if (apiResponse.status < 200 || apiResponse.status >= 300) {
      response.sendFile(path.join(browserDirectory, 'banner.jpg'));
      return;
    }
    const apartment = JSON.parse(apiResponse.body.toString('utf8'));
    const source = apartment.images?.find((item) => item.isCover)?.url
      || apartment.images?.[0]?.url
      || apartment.imageUrl;
    if (!source) {
      response.sendFile(path.join(browserDirectory, 'banner.jpg'));
      return;
    }
    const image = await fetchApartmentImage(source);
    response.setHeader('Content-Type', image.contentType);
    response.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=86400');
    if (image.etag) response.setHeader('ETag', image.etag);
    response.send(image.body);
  } catch (error) {
    console.error('SEO apartment image error:', error);
    response.sendFile(path.join(browserDirectory, 'banner.jpg'));
  }
});

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function dynamicSitemap() {
  if (sitemapCache?.expiresAt > Date.now()) return sitemapCache.body;
  const paths = [
    ['/main', 'daily', '1.0'],
    ['/ExploreProperty', 'daily', '0.9'],
    ['/agent-profile', 'weekly', '0.8'],
    ['/blog', 'weekly', '0.7'],
    ['/ai-home-match', 'monthly', '0.6'],
    ['/about', 'monthly', '0.7'],
    ['/services', 'monthly', '0.8'],
    ['/find-my-home', 'monthly', '0.7'],
  ];
  const apartments = [];
  for (let page = 1; page <= 100; page += 1) {
    const apiResponse = await fetchPublicApi(`/api/Apartments?page=${page}&pageSize=100`, false);
    if (apiResponse.status < 200 || apiResponse.status >= 300) break;
    const items = JSON.parse(apiResponse.body.toString('utf8'));
    if (!Array.isArray(items)) break;
    apartments.push(...items);
    if (items.length < 100) break;
  }
  for (const apartment of apartments) {
    if (Number.isInteger(apartment.id)) {
      paths.push([`/apartments/${apartment.id}`, 'daily', '0.8', apartment.createdAt]);
    }
  }
  const agentsResponse = await fetchPublicApi('/api/Agents', false);
  if (agentsResponse.status >= 200 && agentsResponse.status < 300) {
    const agents = JSON.parse(agentsResponse.body.toString('utf8'));
    if (Array.isArray(agents)) {
      for (const agent of agents) {
        if (agent.id) paths.push([`/agent-profile/${encodeURIComponent(agent.id)}`, 'weekly', '0.7']);
      }
    }
  }
  const entries = paths.map(([pathname, changefreq, priority, lastmod]) => {
    const date = lastmod && !Number.isNaN(Date.parse(lastmod))
      ? `\n    <lastmod>${new Date(lastmod).toISOString()}</lastmod>`
      : '';
    return `  <url>\n    <loc>${escapeXml(`${canonicalOrigin}${pathname}`)}</loc>${date}\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
  });
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
  sitemapCache = { body, expiresAt: Date.now() + 10 * 60_000 };
  return body;
}

app.get('/sitemap.xml', async (_request, response) => {
  try {
    response.type('application/xml');
    response.setHeader('Cache-Control', 'public, max-age=600, stale-while-revalidate=3600');
    response.send(await dynamicSitemap());
  } catch (error) {
    console.error('Sitemap generation failed:', error);
    response.sendFile(path.join(browserDirectory, 'sitemap.xml'));
  }
});

app.get('/', (_request, response) => {
  response.redirect(301, '/main');
});

app.use(express.static(browserDirectory, {
  setHeaders(response, filePath) {
    if (/\.[A-Z0-9]{8}\.(?:js|css)$/i.test(filePath)) {
      response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (/\.(?:png|jpe?g|webp|svg|ico|woff2?)$/i.test(filePath)) {
      response.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    }
  },
}));
app.use(async (request, response) => {
  // Do not return index.html for missing browser assets. During a rolling
  // deployment that turns a missing JavaScript bundle into an HTML response,
  // so the browser rejects it and leaves the static SEO fallback on screen.
  if (path.extname(request.path)) {
    response.sendStatus(404);
    return;
  }

  try {
    const pathname = request.path.replace(/\/+$/, '') || '/main';
    const apartmentMetadata = await apartmentSeo(pathname);
    const agentMetadata = apartmentMetadata === undefined ? await agentSeo(pathname) : undefined;
    const questionnaireMetadata = crmQuestionnaireSeo(pathname);
    const missingResource = apartmentMetadata === null || agentMetadata === null;
    const dynamicMetadata = apartmentMetadata || agentMetadata || questionnaireMetadata;
    const pageMetadata = dynamicMetadata || routeSeo.get(pathname) || defaultSeo;
    const robots = missingResource || privateRoutePattern.test(pathname)
      || ['/property', '/apartment-detail'].includes(pathname)
      ? 'noindex, nofollow'
      : undefined;
    const canonicalPath = missingResource ? pathname : (routeSeo.has(pathname) || dynamicMetadata
      ? pathname
      : '/main');
    const template = await readFile(path.join(browserDirectory, 'index.html'), 'utf8');
    const shareVersion = questionnaireMetadata && typeof request.query.v === 'string'
      ? request.query.v.replace(/[^a-z0-9_-]/gi, '').slice(0, 32)
      : '';
    const document = injectSeo(template, {
      ...pageMetadata,
      canonicalUrl: pageMetadata.canonicalUrl || `${canonicalOrigin}${canonicalPath}`,
      openGraphUrl: shareVersion
        ? `${canonicalOrigin}${pathname}?v=${encodeURIComponent(shareVersion)}`
        : undefined,
      robots,
      title: missingResource ? 'Page Not Found | Velven' : pageMetadata.title,
      description: missingResource
        ? 'This page is no longer available. Browse current verified properties and agents on Velven.'
        : pageMetadata.description,
    });
    response.status(missingResource ? 404 : 200);
    response.setHeader('Cache-Control', 'no-cache');
    response.type('html').send(document);
  } catch (error) {
    console.error('SEO document rendering failed:', error);
    response.status(500).send('The website is temporarily unavailable.');
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Website listening on port ${port}`);
  void warmPublicApis().catch((error) =>
    console.error('Initial API warm-up failed:', error),
  );
});

const apiWarmUpTimer = setInterval(() => void warmPublicApis(), 4 * 60_000);
apiWarmUpTimer.unref();
