import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

const DB_FILE = path.resolve('mr_latency.sqlite');
let SQL, db;

async function initDb() {
  SQL = await initSqlJs({ locateFile: file => `node_modules/sql.js/dist/${file}` });
  if (fs.existsSync(DB_FILE)) {
    const fileBuffer = fs.readFileSync(DB_FILE);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  // schema
  db.run(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    UNIQUE(project_id, name),
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS system_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    test_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    UNIQUE(project_id, test_id, name),
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    test_id INTEGER NOT NULL,
    system_config_id INTEGER NOT NULL,
    swid TEXT NOT NULL,
    original_filename TEXT,
    uploaded_on TEXT,
    parsed_data TEXT,
    UNIQUE(project_id, test_id, system_config_id, swid),
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE,
    FOREIGN KEY(system_config_id) REFERENCES system_configs(id) ON DELETE CASCADE
  );
  `);
  persist();
}

function persist() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_FILE, buffer);
}

function getAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}
function getOne(sql, params = []) {
  const rows = getAll(sql, params);
  return rows[0] || null;
}
function run(sql, params = []) {
  db.run(sql, params);
  persist();
}

// Ensure hierarchy helpers
function ensureProject(name) {
  run('INSERT OR IGNORE INTO projects(name) VALUES(?)', [name]);
  return getOne('SELECT * FROM projects WHERE name=?', [name]);
}
function ensureTest(projectId, name) {
  run('INSERT OR IGNORE INTO tests(project_id, name) VALUES(?, ?)', [projectId, name]);
  return getOne('SELECT * FROM tests WHERE project_id=? AND name=?', [projectId, name]);
}
function ensureSystemConfig(projectId, testId, name) {
  run('INSERT OR IGNORE INTO system_configs(project_id, test_id, name) VALUES(?, ?, ?)', [projectId, testId, name]);
  return getOne('SELECT * FROM system_configs WHERE project_id=? AND test_id=? AND name=?', [projectId, testId, name]);
}

// Routes
app.get('/projects', (req, res) => {
  res.json(getAll('SELECT * FROM projects ORDER BY name'));
});
app.post('/projects', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    run('INSERT INTO projects(name) VALUES(?)', [name]);
    res.status(201).json({ name });
  } catch {
    res.status(409).json({ error: 'Project exists' });
  }
});

app.get('/projects/:project/tests', (req, res) => {
  const p = getOne('SELECT * FROM projects WHERE name=?', [req.params.project]);
  if (!p) return res.json([]);
  const rows = getAll('SELECT * FROM tests WHERE project_id=? ORDER BY name', [p.id]);
  res.json(rows.map(r => ({ name: r.name })));
});
app.post('/projects/:project/tests', (req, res) => {
  const { name } = req.body; const project = req.params.project;
  if (!name) return res.status(400).json({ error: 'name required' });
  const p = ensureProject(project);
  try {
    run('INSERT INTO tests(project_id, name) VALUES(?, ?)', [p.id, name]);
    res.status(201).json({ project, name });
  } catch { res.status(409).json({ error: 'Test exists' }); }
});

app.get('/projects/:project/tests/:test/configs', (req, res) => {
  const { project, test } = req.params;
  const p = getOne('SELECT * FROM projects WHERE name=?', [project]);
  if (!p) return res.json([]);
  const t = getOne('SELECT * FROM tests WHERE project_id=? AND name=?', [p.id, test]);
  if (!t) return res.json([]);
  const rows = getAll('SELECT * FROM system_configs WHERE project_id=? AND test_id=? ORDER BY name', [p.id, t.id]);
  res.json(rows.map(r => ({ name: r.name })));
});
app.post('/projects/:project/tests/:test/configs', (req, res) => {
  const { project, test } = req.params; const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const p = ensureProject(project); const t = ensureTest(p.id, test);
  try { run('INSERT INTO system_configs(project_id, test_id, name) VALUES(?, ?, ?)', [p.id, t.id, name]); res.status(201).json({ project, test, name }); }
  catch { res.status(409).json({ error: 'SystemConfig exists' }); }
});

app.get('/results', (req, res) => {
  const sql = `SELECT r.*, p.name AS project, t.name AS test, s.name AS systemConfig
               FROM results r
               JOIN projects p ON r.project_id=p.id
               JOIN tests t ON r.test_id=t.id
               JOIN system_configs s ON r.system_config_id=s.id`;
  res.json(getAll(sql));
});
app.get('/results/full', (req, res) => {
  const { project, test, systemConfig, swid } = req.query;
  if (!project || !test || !systemConfig || !swid) return res.status(400).json({ error: 'missing query' });
  const p = ensureProject(project); const t = ensureTest(p.id, test); const s = ensureSystemConfig(p.id, t.id, systemConfig);
  const row = getOne('SELECT * FROM results WHERE project_id=? AND test_id=? AND system_config_id=? AND swid=?', [p.id, t.id, s.id, swid]);
  res.json(row || null);
});
app.post('/results', (req, res) => {
  const { project, test, systemConfig, swid, original_filename, uploaded_on, parsed_data } = req.body;
  if (!project || !test || !systemConfig || !swid) return res.status(400).json({ error: 'missing fields' });
  const p = ensureProject(project); const t = ensureTest(p.id, test); const s = ensureSystemConfig(p.id, t.id, systemConfig);
  try {
    run('INSERT INTO results(project_id, test_id, system_config_id, swid, original_filename, uploaded_on, parsed_data) VALUES(?, ?, ?, ?, ?, ?, ?)', [p.id, t.id, s.id, swid, original_filename || null, uploaded_on || null, parsed_data ? JSON.stringify(parsed_data) : null]);
    res.status(201).json({ ok: true });
  } catch {
    res.status(409).json({ error: 'Duplicate entry' });
  }
});

// Delete a project and all its children (CASCADE)
app.delete('/projects/:project', (req, res) => {
  const { project } = req.params;
  const p = getOne('SELECT * FROM projects WHERE name=?', [project]);
  if (!p) return res.status(404).json({ error: 'project not found' });
  db.run('DELETE FROM projects WHERE id=?', [p.id]);
  persist();
  res.json({ ok: true });
});

// Delete a single result by full key
app.delete('/results', (req, res) => {
  const { project, test, systemConfig, swid } = req.query;
  if (!project || !test || !systemConfig || !swid) return res.status(400).json({ error: 'missing query' });
  const p = getOne('SELECT * FROM projects WHERE name=?', [project]);
  if (!p) return res.status(404).json({ error: 'project not found' });
  const t = getOne('SELECT * FROM tests WHERE project_id=? AND name=?', [p.id, test]);
  if (!t) return res.status(404).json({ error: 'test not found' });
  const s = getOne('SELECT * FROM system_configs WHERE project_id=? AND test_id=? AND name=?', [p.id, t.id, systemConfig]);
  if (!s) return res.status(404).json({ error: 'systemConfig not found' });
  const existing = getOne('SELECT * FROM results WHERE project_id=? AND test_id=? AND system_config_id=? AND swid=?', [p.id, t.id, s.id, swid]);
  if (!existing) return res.status(404).json({ error: 'result not found' });
  db.run('DELETE FROM results WHERE id=?', [existing.id]);
  persist();
  res.json({ ok: true });
});

const PORT = process.env.PORT || 5179;
const HOST = '0.0.0.0';
initDb().then(() => {
  app.listen(PORT, HOST, () => {
    console.log(`SQLite (sql.js) backend running on:`);
    console.log(`  - Local:   http://localhost:${PORT}`);
    console.log(`  - Network: http://144.54.163.94:${PORT}`);
  });
});
