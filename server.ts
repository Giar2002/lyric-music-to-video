import express from 'express';
import ytdl from '@distube/ytdl-core';
import 'dotenv/config';

const app = express();
const PORT = 3001;

app.use(express.json());

// CORS for local dev — allow Vite frontend
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

// GET /api/audio/info?url=...
// Returns title, thumbnail, duration info
app.get('/api/audio/info', async (req, res) => {
  const { url } = req.query as { url: string };
  if (!url) { res.status(400).json({ error: 'URL diperlukan' }); return; }

  try {
    if (!ytdl.validateURL(url)) {
      res.status(400).json({ error: 'URL tidak valid. Pastikan URL dari YouTube.' });
      return;
    }
    const info = await ytdl.getInfo(url);
    const details = info.videoDetails;
    res.json({
      title: details.title,
      author: details.author.name,
      duration: parseInt(details.lengthSeconds),
      thumbnail: details.thumbnails.at(-1)?.url ?? null,
    });
  } catch (err: any) {
    console.error('[audio/info] error:', err.message);
    res.status(500).json({ error: 'Gagal mengambil info video. Pastikan URL valid dan video bisa diakses.' });
  }
});

// GET /api/audio/stream?url=...
// Streams the audio as audio/webm or audio/mp4
app.get('/api/audio/stream', async (req, res) => {
  const { url } = req.query as { url: string };
  if (!url) { res.status(400).json({ error: 'URL diperlukan' }); return; }

  try {
    if (!ytdl.validateURL(url)) {
      res.status(400).json({ error: 'URL tidak valid.' });
      return;
    }

    const info = await ytdl.getInfo(url);
    const format = ytdl.chooseFormat(info.formats, {
      quality: 'highestaudio',
      filter: 'audioonly',
    });

    const contentType = format.mimeType?.split(';')[0] ?? 'audio/webm';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="audio.${format.container}"`);
    if (format.contentLength) {
      res.setHeader('Content-Length', format.contentLength);
    }

    const stream = ytdl.downloadFromInfo(info, { format });
    stream.on('error', (err) => {
      console.error('[stream] error:', err.message);
      if (!res.headersSent) res.status(500).end();
    });
    stream.pipe(res);
  } catch (err: any) {
    console.error('[audio/stream] error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Gagal stream audio.' });
  }
});

app.listen(PORT, () => {
  console.log(`\x1b[32m✓\x1b[0m Server berjalan di http://localhost:${PORT}`);
});
