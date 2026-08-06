const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
const app = express();
const db = new Database(path.join(__dirname, 'data.db'));
db.exec('CREATE TABLE IF NOT EXISTS tools (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, description TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
app.use(cors());
app.use(express.json());
app.get('/api/tools', (req, res) => {
  const tools = db.prepare('SELECT * FROM tools ORDER BY created_at DESC').all();
  res.json(tools);
});
app.post('/api/tools', (req, res) => {
  const { name, description } = req.body;
  const stmt = db.prepare('INSERT INTO tools (name, description) VALUES (?, ?)');
  const result = stmt.run(name, description);
  res.json({ id: result.lastInsertRowid, name, description });
});
app.listen(3000, '127.0.0.1', () => console.log('Server running on http://127.0.0.1:3000'));
