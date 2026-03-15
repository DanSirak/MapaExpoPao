import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

const db = new Database(join(__dirname, 'markers.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS markers (
    id TEXT PRIMARY KEY,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

const SUBMIT_TOKEN = process.env.SUBMIT_TOKEN;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;

const app = express();
app.use(cors(ALLOWED_ORIGIN ? { origin: ALLOWED_ORIGIN } : {}));
app.use(express.json());

const submitLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10,                   // 10 envíos por IP por hora
  message: { error: 'Demasiados envíos. Inténtalo más tarde.' },
});

// GET /api/markers — público, cualquiera puede ver los puntos
app.get('/api/markers', (req, res) => {
  const markers = db.prepare('SELECT * FROM markers ORDER BY created_at ASC').all();
  res.json(markers);
});

// POST /api/markers — requiere token y pasa por rate limit
app.post('/api/markers', submitLimit, (req, res) => {
  const { lat, lng, message, token } = req.body;

  if (SUBMIT_TOKEN && token !== SUBMIT_TOKEN) {
    return res.status(403).json({ error: 'Token inválido. Usa el QR de la exposición.' });
  }

  if (typeof lat !== 'number' || typeof lng !== 'number' || !message?.trim()) {
    return res.status(400).json({ error: 'Faltan datos obligatorios.' });
  }

  if (message.trim().length > 500) {
    return res.status(400).json({ error: 'El mensaje no puede superar los 500 caracteres.' });
  }

  const marker = {
    id: randomUUID(),
    lat,
    lng,
    message: message.trim(),
    created_at: new Date().toISOString(),
  };

  db.prepare(`
    INSERT INTO markers (id, lat, lng, message, created_at)
    VALUES (@id, @lat, @lng, @message, @created_at)
  `).run(marker);

  res.status(201).json(marker);
});

// DELETE /api/markers/:id — requiere token
app.delete('/api/markers/:id', (req, res) => {
  const { token } = req.body ?? {};
  if (SUBMIT_TOKEN && token !== SUBMIT_TOKEN) {
    return res.status(403).json({ error: 'Token inválido.' });
  }
  db.prepare('DELETE FROM markers WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor en http://localhost:${PORT}`);
  if (!SUBMIT_TOKEN) {
    console.warn('⚠ SUBMIT_TOKEN no definido — cualquiera puede enviar puntos');
  }
});
