import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT) || 3000;
const apiOrigin = 'https://websiteapi-production-c970.up.railway.app';
const canonicalHost = 'website-production-ab09.up.railway.app';
const supabaseHost = 'zhijxljnddhvlxzhrckz.supabase.co';
const publicApiPaths = new Set(['/api/Apartments', '/api/Agents', '/api/Blog']);
const publicApiCache = new Map();
const publicApiRequests = new Map();
const apartmentImageCache = new Map();
const apartmentImageRequests = new Map();
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
    const imageUrls = apartments.map((apartment) => {
      const gallery = Array.isArray(apartment?.images) ? [...apartment.images] : [];
      gallery.sort(
        (left, right) =>
          Number(right?.isCover) - Number(left?.isCover) ||
          (left?.sortOrder ?? 0) - (right?.sortOrder ?? 0),
      );
      return (
        gallery[0]?.url ||
        gallery[0]?.storagePath ||
        apartment?.imageUrls?.[0] ||
        apartment?.imageUrl
      );
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

function sendApiResponse(response, apiResponse, cacheStatus) {
  response.status(apiResponse.status);
  apiResponse.headers.forEach(([name, value]) => response.setHeader(name, value));
  response.setHeader('X-White-Tower-Cache', cacheStatus);
  response.send(apiResponse.body);
}

async function fetchPublicApi(cacheKey) {
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
      if (cacheKey === '/api/Apartments') {
        warmApartmentImages(apiResponse.body);
      } else if (/^\/api\/Apartments\/\d+$/.test(cacheKey)) {
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
    [...publicApiPaths].map((apiPath) =>
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
        sendApiResponse(response, cached, 'HIT');
        return;
      }

      if (cached?.staleUntil > Date.now()) {
        sendApiResponse(response, cached, 'STALE');
        void fetchPublicApi(cacheKey).catch((error) =>
          console.error(`API cache refresh failed for ${cacheKey}:`, error),
        );
        return;
      }

      const apiResponse = await fetchPublicApi(cacheKey);
      sendApiResponse(response, apiResponse, 'MISS');
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
      body: hasBody ? request : undefined,
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
      const body = Buffer.from(await upstreamResponse.arrayBuffer());
      response.send(body);
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

app.use(express.static(browserDirectory));
app.use((_request, response) => {
  response.sendFile(path.join(browserDirectory, 'index.html'));
});

await warmPublicApis();

app.listen(port, '0.0.0.0', () => {
  console.log(`Website listening on port ${port}`);
});

const apiWarmUpTimer = setInterval(() => void warmPublicApis(), 4 * 60_000);
apiWarmUpTimer.unref();
