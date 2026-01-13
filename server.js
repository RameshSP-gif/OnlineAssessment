const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const os = require('os');
const path = require('path');
require('dotenv').config();
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const multer = require('multer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 4000;
const SECRET = process.env.JWT_SECRET || process.env.JWT || 'dev-secret-please-change';

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
// Serve built React client if present, otherwise fall back to public
if (fs.existsSync('./client/dist')) {
  app.use(express.static('client/dist'));
} else {
  app.use(express.static('public'));
}

// Simple file storage for uploaded videos - use env or OS tmpdir for serverless
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(os.tmpdir(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({ dest: UPLOAD_DIR });

// SQLite DB
// Use environment-controlled DB path. On serverless (Vercel) prefer /tmp
const dbFile = process.env.SQLITE_DB || path.join(os.tmpdir(), 'data.sqlite');
const dbExists = fs.existsSync(dbFile);
const db = new sqlite3.Database(dbFile);

function initDb() {
  db.serialize(() => {
    db.run(
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT
      )`
    );

    db.run(
      `CREATE TABLE IF NOT EXISTS questions (
        id TEXT PRIMARY KEY,
        text TEXT,
        options TEXT,
        correct INTEGER,
        tags TEXT,
        difficulty INTEGER
      )`
    );

    db.run(
      `CREATE TABLE IF NOT EXISTS exams (
        id TEXT PRIMARY KEY,
        userId TEXT,
        startedAt INTEGER,
        finishedAt INTEGER,
        result JSON
      )`
    );
  });
}

initDb();

// Helpers
function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Missing token' });
  const parts = auth.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'Invalid token' });
  const token = parts[1];
  try {
    const payload = jwt.verify(token, SECRET);
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Auth
app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 8);
  db.run(
    'INSERT INTO users (id,name,email,password) VALUES (?,?,?,?)',
    [id, name || '', email, hash],
    function (err) {
      if (err) return res.status(400).json({ error: err.message });
      const token = generateToken({ id, email });
      res.json({ token, user: { id, name, email } });
    }
  );
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
  db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(400).json({ error: 'No such user' });
    const ok = bcrypt.compareSync(password, row.password);
    if (!ok) return res.status(401).json({ error: 'Invalid password' });
    const token = generateToken({ id: row.id, email: row.email });
    res.json({ token, user: { id: row.id, name: row.name, email: row.email } });
  });
});

// Seed endpoint (useful while developing)
app.get('/api/seed', (req, res) => {
  try {
    const seed = require('./seed.js');
    seed.run(db, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true, message: 'Seeded' });
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Start exam: accepts skills array and optional cvText
app.post('/api/exam/start', authMiddleware, (req, res) => {
  const { skills = [], cvText = '' } = req.body;
  // Very simple CV analysis: look for keywords and add to skills
  const found = [];
  const lower = (cvText || '').toLowerCase();
  const keywords = ['javascript','node','react','python','java','c++','sql','nlp','ml','dl','ai','aws','docker'];
  keywords.forEach(k => { if (lower.includes(k)) found.push(k); });
  const finalSkills = Array.from(new Set([...skills, ...found]));

  // Select questions matching skills first
  const placeholders = finalSkills.map(() => '?').join(',') || "''";
  const query = `SELECT * FROM questions WHERE (${finalSkills.length? '  (' + finalSkills.map(() => "tags LIKE '%'||?||'%' ").join(' OR ') + ') OR ' : ''} 1=1) ORDER BY RANDOM()`;

  const params = finalSkills;
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    // ensure at least 30, fill with random if needed
    let pool = rows || [];
    db.all('SELECT * FROM questions ORDER BY RANDOM()', [], (err2, allQ) => {
      if (err2) return res.status(500).json({ error: err2.message });
      // add toughest question if present
      const toughest = allQ.filter(q => q.difficulty >= 5);
      const selected = [];
      if (toughest.length) selected.push(toughest[Math.floor(Math.random()*toughest.length)]);
      // fill with pool and then random
      const remaining = allQ.filter(q => !selected.find(s => s.id === q.id));
      // prefer matching pool
      const poolIds = pool.map(p=>p.id);
      const poolFiltered = remaining.filter(q=>poolIds.includes(q.id));
      while (selected.length < 30 && poolFiltered.length) {
        selected.push(poolFiltered.shift());
      }
      // fill rest from remaining random
      let idx = 0;
      while (selected.length < 30 && idx < remaining.length) {
        const cand = remaining[idx++];
        if (!selected.find(s=>s.id===cand.id)) selected.push(cand);
      }

      // hide correct answer when sending
      const questions = selected.map(q => ({ id: q.id, text: q.text, options: JSON.parse(q.options), difficulty: q.difficulty, tags: q.tags }));
      const examId = uuidv4();
      db.run('INSERT INTO exams (id,userId,startedAt) VALUES (?,?,?)', [examId, req.user.id, Date.now()]);
      res.json({ examId, questions, detectedSkills: finalSkills });
    });
  });
});

// Submit exam answers
app.post('/api/exam/submit', authMiddleware, (req, res) => {
  const { examId, answers } = req.body; // answers: { questionId: selectedIndex }
  if (!examId || !answers) return res.status(400).json({ error: 'Missing examId or answers' });
  const ids = Object.keys(answers);
  if (!ids.length) return res.status(400).json({ error: 'No answers' });
  const placeholders = ids.map(()=>'?').join(',');
  db.all(`SELECT * FROM questions WHERE id IN (${placeholders})`, ids, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    let correct = 0;
    const feedback = [];
    rows.forEach(r => {
      const selected = answers[r.id];
      if (parseInt(selected) === r.correct) correct++;
      feedback.push({ id: r.id, text: r.text, correct: r.correct, your: parseInt(selected), options: JSON.parse(r.options) });
    });
    const score = Math.round((correct / rows.length) * 100);
    db.run('UPDATE exams SET finishedAt = ?, result = ? WHERE id = ?', [Date.now(), JSON.stringify({ score, correct, total: rows.length }), examId]);
    res.json({ score, correct, total: rows.length, feedback });
  });
});

// Video upload & simple AI-eval stub
app.post('/api/video', authMiddleware, upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const localPath = req.file.path;
  const stats = fs.statSync(localPath);
  const sizeKb = Math.round(stats.size / 1024);

  // If S3 configured, upload file and remove local copy
  const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET;
  let s3Key = null;
  if (bucket) {
    try {
      const region = process.env.AWS_REGION || process.env.S3_REGION || 'us-east-1';
      const s3Config = { region };
      // support custom endpoint (Cloudflare R2)
      if (process.env.S3_ENDPOINT) s3Config.endpoint = process.env.S3_ENDPOINT;
      if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        s3Config.credentials = {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        };
      }
      const client = new S3Client(s3Config);
      s3Key = `videos/${Date.now()}-${req.file.originalname}`;
      const fileStream = fs.createReadStream(localPath);
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: s3Key, Body: fileStream }));
      // remove local file after upload
      fs.unlinkSync(localPath);
    } catch (e) {
      console.error('S3 upload failed', e);
    }
  }

  // Fake AI evaluation: score between 30 and 95 based on size
  const score = Math.max(30, Math.min(95, Math.round(50 + (sizeKb % 50) - 10)));
  const notes = [];
  if (sizeKb < 100) notes.push('Very short clip — low information');
  if (sizeKb > 5000) notes.push('Large file — likely long answer');
  if (s3Key) notes.push(`Uploaded to ${bucket}/${s3Key}`);
  notes.push('This is a placeholder AI evaluation. Replace with ML model integration.');
  res.json({ ok: true, score, notes, s3Key });
});

app.get('/api/profile', authMiddleware, (req, res) => {
  db.get('SELECT id,name,email FROM users WHERE id = ?', [req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ user: row });
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log('Server listening on', PORT);
  });
} else {
  // export for serverless adapter
  module.exports = app;
}
