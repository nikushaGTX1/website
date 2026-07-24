import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT) || 3000;
const apiOrigin = 'https://websiteapi-production-c970.up.railway.app';
const canonicalHost = 'website-production-ab09.up.railway.app';
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

app.use('/api', async (request, response) => {
  try {
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

app.listen(port, '0.0.0.0', () => {
  console.log(`Website listening on port ${port}`);
});
