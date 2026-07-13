import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import OpenAI from 'openai';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(__dirname, 'data');
const uploadDir = path.join(dataDir, 'uploads');
const uploadDbPath = path.join(dataDir, 'uploads.json');
const knowledgeDbPath = path.join(dataDir, 'knowledge.json');
const port = Number(process.env.PORT || 8787);
const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
const model = process.env.OPENAI_MODEL || 'gpt-5.6';
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

await fs.mkdir(uploadDir, { recursive: true });
await ensureJson(uploadDbPath, []);
await ensureJson(knowledgeDbPath, []);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:8787,http://127.0.0.1:8787')
  .split(',').map(value => value.trim()).filter(Boolean);

const app = express();
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`Origin not allowed: ${origin}`));
  }
}));
app.use(express.json({ limit: '5mb' }));

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDir),
  filename: (_req, file, callback) => {
    const clean = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
    callback(null, `${Date.now()}-${crypto.randomUUID()}-${clean}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 * 1024 },
  fileFilter(_req, file, callback) {
    if (file.mimetype.startsWith('video/') || file.mimetype.startsWith('image/')) return callback(null, true);
    callback(new Error('Only image and video files are supported.'));
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, aiConfigured: Boolean(openai), model, ffmpegConfigured: true });
});

app.post('/api/uploads', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file received.' });
    const id = crypto.randomUUID();
    const entry = {
      id,
      name: req.file.originalname,
      storedName: req.file.filename,
      path: req.file.path,
      size: req.file.size,
      type: req.file.mimetype,
      category: 'training',
      profileId: req.body.profileId || '',
      gameTitle: req.body.gameTitle || 'General',
      projectId: req.body.projectId || '',
      createdAt: new Date().toISOString()
    };
    const db = await readJson(uploadDbPath, []);
    db.push(entry);
    await writeJson(uploadDbPath, db);
    const url = `${req.protocol}://${req.get('host')}/api/uploads/${id}/file`;
    res.json({ ...entry, path: undefined, storedName: undefined, url, analysisStatus: 'Not analyzed' });
  } catch (error) { next(error); }
});

app.get('/api/uploads/:id/file', async (req, res) => {
  const db = await readJson(uploadDbPath, []);
  const entry = db.find(item => item.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Upload not found.' });
  res.sendFile(path.resolve(entry.path));
});

app.post('/api/chat', async (req, res, next) => {
  try {
    if (!openai) return res.status(503).json({ error: 'OPENAI_API_KEY is not configured in server/.env.' });
    const { message, gameTitle = 'General gaming', profileName = 'Player', context = {}, history = [] } = req.body || {};
    if (!message?.trim()) return res.status(400).json({ error: 'Message is required.' });
    const serverKnowledge = (await readJson(knowledgeDbPath, []))
      .filter(item => item.gameTitle.toLowerCase() === gameTitle.toLowerCase())
      .slice(-20);
    const compactContext = {
      notes: (context.notes || []).slice(-20),
      goals: (context.goals || []).slice(-20),
      browserKnowledge: (context.knowledge || []).slice(-20),
      analyzedGameplay: serverKnowledge.map(item => ({ createdAt: item.createdAt, text: item.text }))
    };
    const input = [
      {
        role: 'developer',
        content: `You are Nexus Coach, a precise gaming strategy assistant for ${profileName}. The active game is ${gameTitle}. Use the supplied private notes and analyzed gameplay when relevant. Clearly distinguish observed facts, user-provided notes, and uncertain advice. Do not invent mechanics, patches, item stats, or release facts. Give actionable step-by-step coaching without excessive filler.`
      },
      ...history.slice(-10).filter(item => ['user', 'assistant'].includes(item.role)).map(item => ({ role: item.role, content: String(item.text).slice(0, 6000) })),
      { role: 'user', content: `Private dashboard context:\n${JSON.stringify(compactContext).slice(0, 30000)}\n\nQuestion:\n${message}` }
    ];
    const response = await openai.responses.create({ model, reasoning: { effort: 'low' }, input });
    res.json({ text: response.output_text || 'No text response was returned.' });
  } catch (error) { next(error); }
});

app.post('/api/analyze/:id', async (req, res, next) => {
  let tempDir;
  try {
    if (!openai) return res.status(503).json({ error: 'OPENAI_API_KEY is not configured in server/.env.' });
    const uploads = await readJson(uploadDbPath, []);
    const entry = uploads.find(item => item.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'Recording not found.' });
    if (!entry.type.startsWith('video/')) return res.status(400).json({ error: 'Gameplay analysis currently requires a video recording.' });

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-frames-'));
    const pattern = path.join(tempDir, 'frame-%03d.jpg');
    await runProcess(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-i', entry.path, '-vf', 'fps=1/20,scale=960:-2', '-frames:v', '12', '-q:v', '3', pattern]);
    let frameNames = (await fs.readdir(tempDir)).filter(name => name.endsWith('.jpg')).sort();
    if (!frameNames.length) {
      await runProcess(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-i', entry.path, '-frames:v', '1', '-q:v', '3', pattern]);
      frameNames = (await fs.readdir(tempDir)).filter(name => name.endsWith('.jpg')).sort();
    }
    if (!frameNames.length) throw new Error('No frames could be extracted from this recording.');

    const imageContent = [];
    for (const name of frameNames.slice(0, 12)) {
      const bytes = await fs.readFile(path.join(tempDir, name));
      imageContent.push({ type: 'input_image', image_url: `data:image/jpeg;base64,${bytes.toString('base64')}`, detail: 'high' });
    }
    const gameTitle = req.body.gameTitle || entry.gameTitle || 'Unknown game';
    const response = await openai.responses.create({
      model,
      reasoning: { effort: 'medium' },
      input: [
        {
          role: 'developer',
          content: 'You analyze sampled frames from gameplay recordings. Extract durable, useful game knowledge. Do not pretend the frames show actions they do not show. Separate direct observations from hypotheses. Focus on player decisions, UI state, routes, combat patterns, mistakes, opportunities, and repeatable strategy. Return a concise structured analysis with headings: Observed Situation, Strong Decisions, Possible Mistakes, Repeatable Strategy, Questions/Unknowns.'
        },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: `Game: ${gameTitle}\nRecording: ${entry.name}\nThese frames are chronological samples from one recording. Build knowledge that can improve future coaching for this game.` },
            ...imageContent
          ]
        }
      ]
    });
    const text = response.output_text || 'No analysis text was returned.';
    const knowledge = await readJson(knowledgeDbPath, []);
    knowledge.push({
      id: crypto.randomUUID(), mediaId: entry.id, projectId: req.body.projectId || entry.projectId,
      profileId: req.body.profileId || entry.profileId, gameTitle, text, frameCount: frameNames.length,
      createdAt: new Date().toISOString()
    });
    await writeJson(knowledgeDbPath, knowledge);
    res.json({ text, frameCount: frameNames.length });
  } catch (error) { next(error); }
  finally { if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {}); }
});

app.use(express.static(rootDir, { extensions: ['html'] }));
app.get('/*splat', (_req, res) => res.sendFile(path.join(rootDir, 'index.html')));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || 'Unexpected server error.' });
});

app.listen(port, '127.0.0.1', () => {
  console.log(`\nNexus Gaming Hub is running at http://localhost:${port}`);
  console.log(`AI configured: ${openai ? 'yes' : 'no'} | Model: ${model}`);
  console.log('Keep this window open while using AI chat or analyzing gameplay.\n');
});

async function ensureJson(file, fallback) {
  try { await fs.access(file); } catch { await writeJson(file, fallback); }
}
async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}
async function writeJson(file, value) {
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(temp, file);
}
function runProcess(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg failed (${code}): ${stderr.slice(-2000)}`)));
  });
}
