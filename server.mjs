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
const canonicalHost = 'website-production-ab09.up.railway.app';
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
const translationCache = new Map();
const streetGeometryCache = new Map();
const boundaryGeometryCache = new Map();
const districtStreetCache = new Map();
const approvalDataDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const approvalDataFile = path.join(approvalDataDirectory, 'apartment-approval-requests.json');
const publicCacheLifetimeMs = 60_000;
const publicCacheStaleLifetimeMs = 5 * 60_000;
const browserDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'dist',
  'site',
  'browser',
);

app.use((request, response, next) => {
  const forwardedHost = request.get('x-forwarded-host')?.split(',')[0].trim();
  const requestHost = (forwardedHost || request.get('host') || '').split(':')[0].toLowerCase();

  if (requestHost === `www.${canonicalHost}`) {
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
      .filter((token) => token.length >= 4 && !/^(street|avenue|road|lane)$/i.test(token))
      .sort((left, right) => right.length - left.length);
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

app.get('/map-data/district-streets', async (request, response) => {
  const relationId = Number(request.query.relationId);
  if (!Number.isSafeInteger(relationId) || relationId <= 0) {
    response.status(400).json({ message: 'A valid OpenStreetMap relation ID is required.' });
    return;
  }
  const cached = districtStreetCache.get(relationId);
  if (cached) {
    response.setHeader('Cache-Control', 'public, max-age=604800');
    response.json(cached);
    return;
  }
  try {
    const query = `[out:json][timeout:40];rel(${relationId})->.district;map_to_area.district->.districtArea;way(area.districtArea)["highway"]["name"];out tags geom;`;
    const upstream = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(30000),
    });
    if (!upstream.ok) throw new Error(`Overpass returned HTTP ${upstream.status}.`);
    const payload = await upstream.json();
    const result = {
      streets: (payload.elements || []).map((element) => ({
        names: [...new Set([
          element.tags?.name,
          element.tags?.['name:en'],
          element.tags?.['name:ka'],
        ].filter(Boolean))],
        line: (element.geometry || []).map((point) => [point.lon, point.lat]),
      })).filter((street) => street.names.length && street.line.length >= 2),
    };
    districtStreetCache.set(relationId, result);
    response.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=2592000');
    response.json(result);
  } catch (error) {
    console.error('District street geometry proxy error:', error);
    response.status(502).json({ message: 'District streets are temporarily unavailable.' });
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

app.post(
  '/translation',
  express.json({ limit: '32kb' }),
  async (request, response) => {
    try {
      const language = request.body?.language;
      const text = request.body?.text;
      if (!['ka', 'ru'].includes(language) || typeof text !== 'string' || !text.trim()) {
        response.status(400).json({ message: 'Invalid translation request.' });
        return;
      }
      if (text.length > 5000) {
        response.status(413).json({ message: 'Translation request is too large.' });
        return;
      }

      const cacheKey = `${language}:${text}`;
      const cached = translationCache.get(cacheKey);
      if (cached) {
        response.json({ translatedText: cached });
        return;
      }

      const params = new URLSearchParams({
        client: 'gtx',
        sl: 'en',
        tl: language,
        dt: 't',
        q: text,
      });
      const upstream = await fetch(
        `https://translate.googleapis.com/translate_a/single?${params}`,
      );
      if (!upstream.ok) {
        throw new Error(`Translation service returned HTTP ${upstream.status}.`);
      }

      const payload = await upstream.json();
      const translatedText = payload[0]
        .map((part) => part?.[0] || '')
        .join('');
      if (!translatedText) {
        throw new Error('Translation service returned an empty response.');
      }

      translationCache.set(cacheKey, translatedText);
      if (translationCache.size > 1000) {
        translationCache.delete(translationCache.keys().next().value);
      }
      response.setHeader('Cache-Control', 'private, max-age=86400');
      response.json({ translatedText });
    } catch (error) {
      console.error('Translation proxy error:', error);
      response.status(502).json({ message: 'Translation is temporarily unavailable.' });
    }
  },
);

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
app.use((request, response) => {
  // Do not return index.html for missing browser assets. During a rolling
  // deployment that turns a missing JavaScript bundle into an HTML response,
  // so the browser rejects it and leaves the static SEO fallback on screen.
  if (path.extname(request.path)) {
    response.sendStatus(404);
    return;
  }

  response.setHeader('Cache-Control', 'no-cache');
  response.sendFile(path.join(browserDirectory, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Website listening on port ${port}`);
  void warmPublicApis().catch((error) =>
    console.error('Initial API warm-up failed:', error),
  );
});

const apiWarmUpTimer = setInterval(() => void warmPublicApis(), 4 * 60_000);
apiWarmUpTimer.unref();
