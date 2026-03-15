import express from 'express';
import cors from 'cors';
import pg from 'pg';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';
import 'dotenv/config';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
});

await pool.query(`
  CREATE TABLE IF NOT EXISTS markers (
    id TEXT PRIMARY KEY,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
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
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados envíos. Inténtalo más tarde.' },
});

app.get('/api/markers', async (_req, res) => {
  const result = await pool.query('SELECT * FROM markers ORDER BY created_at ASC');
  res.json(result.rows);
});

app.post('/api/markers', submitLimit, async (req, res) => {
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

  await pool.query(
    'INSERT INTO markers (id, lat, lng, message, created_at) VALUES ($1, $2, $3, $4, $5)',
    [marker.id, marker.lat, marker.lng, marker.message, marker.created_at]
  );

  res.status(201).json(marker);
});

app.delete('/api/markers/:id', async (req, res) => {
  const { token } = req.body ?? {};
  if (SUBMIT_TOKEN && token !== SUBMIT_TOKEN) {
    return res.status(403).json({ error: 'Token inválido.' });
  }
  await pool.query('DELETE FROM markers WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor en http://localhost:${PORT}`);
  if (!SUBMIT_TOKEN) {
    console.warn('⚠ SUBMIT_TOKEN no definido — cualquiera puede enviar puntos');
  }
});
