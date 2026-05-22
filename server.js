const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

function send(res, code, body, contentType = 'application/json') {
  res.writeHead(code, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function pickTemp(periods = []) {
  const now = periods.find((p) => p.isDaytime) || periods[0];
  return now?.temperature ?? null;
}

async function fetchWeather(lat, lon) {
  const points = await fetch(`https://api.weather.gov/points/${lat},${lon}`, {
    headers: { 'User-Agent': 'MorningMuse/1.0 (private prototype)' },
  });
  if (!points.ok) throw new Error('Unable to resolve weather location');
  const pointsJson = await points.json();
  const forecastUrl = pointsJson?.properties?.forecast;
  if (!forecastUrl) throw new Error('Forecast URL unavailable');

  const forecastRes = await fetch(forecastUrl, {
    headers: { 'User-Agent': 'MorningMuse/1.0 (private prototype)' },
  });
  if (!forecastRes.ok) throw new Error('Unable to load weather forecast');
  const forecast = await forecastRes.json();
  const periods = forecast?.properties?.periods || [];
  const current = periods[0] || {};

  const condition = /rain|shower|storm/i.test(current.shortForecast || '')
    ? 'rain'
    : (pickTemp(periods) ?? 52) <= 55
      ? 'cool'
      : 'mild';

  const recommendation =
    condition === 'rain'
      ? 'Rain layer recommended'
      : condition === 'cool'
        ? 'Light layer recommended'
        : 'Breathable layers recommended';

  return {
    temperature: pickTemp(periods) ?? 52,
    summary: current.shortForecast || 'Forecast unavailable',
    recommendation,
    condition,
    source: 'NWS',
    updatedAt: new Date().toISOString(),
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/weather') {
    try {
      const lat = Number(url.searchParams.get('lat') || '40.7128');
      const lon = Number(url.searchParams.get('lon') || '-74.0060');
      const weather = await fetchWeather(lat, lon);
      return send(res, 200, JSON.stringify(weather));
    } catch (error) {
      return send(
        res,
        200,
        JSON.stringify({
          temperature: 52,
          summary: 'Cool morning, warmer afternoon',
          recommendation: 'Light layer recommended',
          condition: 'cool',
          source: 'fallback',
          error: String(error.message || error),
        })
      );
    }
  }

  const filePath =
    url.pathname === '/'
      ? path.join(ROOT, 'index.html')
      : path.join(ROOT, url.pathname.replace(/^\//, ''));

  if (!filePath.startsWith(ROOT)) return send(res, 403, 'Forbidden', 'text/plain');

  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    const ext = path.extname(filePath);
    const contentType =
      ext === '.css'
        ? 'text/css'
        : ext === '.js'
          ? 'application/javascript'
          : 'text/html';
    send(res, 200, data, contentType);
  });
});

server.listen(PORT, () => {
  console.log(`Morning Muse running at http://localhost:${PORT}`);
});
