import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
const publicApiCache = new Map();
const publicApiRequests = new Map();
const apartmentImageCache = new Map();
const apartmentImageRequests = new Map();
const translationCache = new Map();
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

function sendApiResponse(response, apiResponse, cacheStatus) {
  response.status(apiResponse.status);
  apiResponse.headers.forEach(([name, value]) => response.setHeader(name, value));
  response.setHeader('X-White-Tower-Cache', cacheStatus);
  response.send(apiResponse.body);
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
      if (cacheKey === '/api/Apartments') {
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
        if (/^\/api\/Apartments\/\d+$/.test(cacheKey)) {
          warmApartmentImages(cached.body);
        }
        sendApiResponse(response, cached, 'HIT');
        return;
      }

      if (cached?.staleUntil > Date.now()) {
        if (/^\/api\/Apartments\/\d+$/.test(cacheKey)) {
          warmApartmentImages(cached.body);
        }
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
    const requestBody = hasBody
      ? Buffer.concat(await Array.fromAsync(request))
      : undefined;
    const upstreamResponse = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: requestBody?.length ? requestBody : undefined,
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

await warmPublicApis();

app.listen(port, '0.0.0.0', () => {
  console.log(`Website listening on port ${port}`);
});

const apiWarmUpTimer = setInterval(() => void warmPublicApis(), 4 * 60_000);
apiWarmUpTimer.unref();
