// AcademIQ Backend — Node.js + Express + SQLite
// Run: npm install && npm start

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'academiq-secret-2024';

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

// ─── DATABASE ────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'academiq.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'student' CHECK(role IN ('admin','faculty','student')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    enrollment TEXT UNIQUE NOT NULL,
    roll TEXT,
    branch TEXT NOT NULL,
    semester INTEGER DEFAULT 1,
    email TEXT,
    phone TEXT,
    dob DATE,
    gender TEXT DEFAULT 'Male',
    address TEXT,
    status TEXT DEFAULT 'Active' CHECK(status IN ('Active','Inactive','Graduated')),
    adm_date DATE DEFAULT CURRENT_DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    date DATE NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('P','A','H')),
    marked_by INTEGER,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    UNIQUE(student_id, date)
  );

  CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    branch TEXT,
    semester INTEGER,
    credits INTEGER DEFAULT 4
  );

  CREATE TABLE IF NOT EXISTS marks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    exam_type TEXT DEFAULT 'Mid' CHECK(exam_type IN ('Mid','End','Internal')),
    score INTEGER DEFAULT 0,
    max_score INTEGER DEFAULT 100,
    academic_year TEXT DEFAULT '2024-25',
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id),
    UNIQUE(student_id, subject_id, exam_type, academic_year)
  );

  CREATE TABLE IF NOT EXISTS notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    type TEXT DEFAULT 'general' CHECK(type IN ('general','urgent','info')),
    audience TEXT DEFAULT 'All',
    author_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (author_id) REFERENCES users(id)
  );
`);

// ─── SEED DATA ───────────────────────────────────────────
const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@academiq.edu');
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare("INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)").run('Admin User','admin@academiq.edu',hash,'admin');
  db.prepare("INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)").run('Dr. Sharma','faculty@academiq.edu',bcrypt.hashSync('faculty123',10),'faculty');
}

// ─── AUTH MIDDLEWARE ─────────────────────────────────────
function auth(roles = []) {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const user = jwt.verify(token, JWT_SECRET);
      if (roles.length && !roles.includes(user.role)) return res.status(403).json({ error: 'Forbidden' });
      req.user = user;
      next();
    } catch { res.status(401).json({ error: 'Invalid token' }); }
  };
}

// ─── AUTH ROUTES ─────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post('/api/auth/logout', auth(), (req, res) => res.json({ message: 'Logged out' }));

app.get('/api/auth/me', auth(), (req, res) => {
  const user = db.prepare('SELECT id,name,email,role FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// ─── DASHBOARD ───────────────────────────────────────────
app.get('/api/dashboard/stats', auth(), (req, res) => {
  const totalStudents = db.prepare('SELECT COUNT(*) as c FROM students').get().c;
  const activeStudents = db.prepare("SELECT COUNT(*) as c FROM students WHERE status='Active'").get().c;
  const branchCounts = db.prepare('SELECT branch, COUNT(*) as count FROM students GROUP BY branch ORDER BY count DESC').all();
  const semCounts = db.prepare('SELECT semester, COUNT(*) as count FROM students GROUP BY semester ORDER BY semester').all();
  const recentAdmissions = db.prepare('SELECT * FROM students ORDER BY created_at DESC LIMIT 5').all();

  const attStats = db.prepare(`
    SELECT COUNT(*) as total,
    SUM(CASE WHEN status='P' THEN 1 ELSE 0 END) as present
    FROM attendance`).get();
  const avgAttendance = attStats.total > 0 ? Math.round(attStats.present / attStats.total * 100) : 0;

  res.json({ totalStudents, activeStudents, branchCounts, semCounts, recentAdmissions, avgAttendance });
});

// ─── STUDENTS CRUD ───────────────────────────────────────
app.get('/api/students', auth(), (req, res) => {
  const { branch, semester, status, search, page = 1, limit = 50 } = req.query;
  let query = 'SELECT * FROM students WHERE 1=1';
  const params = [];
  if (branch) { query += ' AND branch = ?'; params.push(branch); }
  if (semester) { query += ' AND semester = ?'; params.push(parseInt(semester)); }
  if (status) { query += ' AND status = ?'; params.push(status); }
  if (search) { query += ' AND (name LIKE ? OR enrollment LIKE ? OR roll LIKE ?)'; params.push(`%${search}%`,`%${search}%`,`%${search}%`); }
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

  const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as c').split('LIMIT')[0];
  const total = db.prepare(countQuery).get(...params.slice(0, -2))?.c || 0;
  const students = db.prepare(query).all(...params);
  res.json({ students, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
});

app.get('/api/students/:id', auth(), (req, res) => {
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  res.json(student);
});

app.post('/api/students', auth(['admin','faculty']), (req, res) => {
  const { name, enrollment, roll, branch, semester, email, phone, dob, gender, address, status } = req.body;
  if (!name || !enrollment || !branch) return res.status(400).json({ error: 'Name, enrollment and branch are required' });
  try {
    const result = db.prepare(`
      INSERT INTO students (name,enrollment,roll,branch,semester,email,phone,dob,gender,address,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(name, enrollment, roll, branch, semester||1, email, phone, dob, gender||'Male', address, status||'Active');
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(student);
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Enrollment number already exists' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/students/:id', auth(['admin','faculty']), (req, res) => {
  const { name, enrollment, roll, branch, semester, email, phone, dob, gender, address, status } = req.body;
  const exists = db.prepare('SELECT id FROM students WHERE id = ?').get(req.params.id);
  if (!exists) return res.status(404).json({ error: 'Student not found' });
  db.prepare(`UPDATE students SET name=?,enrollment=?,roll=?,branch=?,semester=?,email=?,phone=?,dob=?,gender=?,address=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(name, enrollment, roll, branch, semester, email, phone, dob, gender, address, status, req.params.id);
  res.json(db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id));
});

app.delete('/api/students/:id', auth(['admin']), (req, res) => {
  const exists = db.prepare('SELECT id FROM students WHERE id = ?').get(req.params.id);
  if (!exists) return res.status(404).json({ error: 'Student not found' });
  db.prepare('DELETE FROM students WHERE id = ?').run(req.params.id);
  res.json({ message: 'Student deleted' });
});

// ─── ATTENDANCE ──────────────────────────────────────────
app.get('/api/attendance', auth(), (req, res) => {
  const { student_id, month, year, branch, semester } = req.query;
  let query = `SELECT a.*, s.name, s.enrollment, s.branch, s.semester FROM attendance a JOIN students s ON a.student_id=s.id WHERE 1=1`;
  const params = [];
  if (student_id) { query += ' AND a.student_id = ?'; params.push(student_id); }
  if (month && year) { query += ' AND strftime("%m-%Y", a.date) = ?'; params.push(`${month.padStart(2,'0')}-${year}`); }
  if (branch) { query += ' AND s.branch = ?'; params.push(branch); }
  if (semester) { query += ' AND s.semester = ?'; params.push(semester); }
  res.json(db.prepare(query + ' ORDER BY a.date DESC').all(...params));
});

app.post('/api/attendance/bulk', auth(['admin','faculty']), (req, res) => {
  const { records, date } = req.body; // records: [{student_id, status}]
  if (!records || !date) return res.status(400).json({ error: 'records and date required' });
  const stmt = db.prepare('INSERT OR REPLACE INTO attendance (student_id,date,status,marked_by) VALUES (?,?,?,?)');
  const insertMany = db.transaction((recs) => { recs.forEach(r => stmt.run(r.student_id, date, r.status, req.user.id)); });
  insertMany(records);
  res.json({ message: `Attendance marked for ${records.length} students` });
});

app.get('/api/attendance/summary', auth(), (req, res) => {
  const { branch, semester } = req.query;
  let query = `SELECT s.id, s.name, s.enrollment, s.branch, s.semester,
    COUNT(a.id) as total_days,
    SUM(CASE WHEN a.status='P' THEN 1 ELSE 0 END) as present_days,
    ROUND(SUM(CASE WHEN a.status='P' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(a.id),0), 1) as percentage
    FROM students s LEFT JOIN attendance a ON s.id = a.student_id WHERE 1=1`;
  const params = [];
  if (branch) { query += ' AND s.branch = ?'; params.push(branch); }
  if (semester) { query += ' AND s.semester = ?'; params.push(semester); }
  query += ' GROUP BY s.id ORDER BY percentage ASC';
  res.json(db.prepare(query).all(...params));
});

// ─── MARKS ───────────────────────────────────────────────
app.get('/api/marks', auth(), (req, res) => {
  const { student_id, branch, semester, exam_type } = req.query;
  let query = `SELECT m.*, s.name, s.enrollment, sub.name as subject_name FROM marks m
    JOIN students s ON m.student_id = s.id
    JOIN subjects sub ON m.subject_id = sub.id WHERE 1=1`;
  const params = [];
  if (student_id) { query += ' AND m.student_id = ?'; params.push(student_id); }
  if (branch) { query += ' AND s.branch = ?'; params.push(branch); }
  if (semester) { query += ' AND s.semester = ?'; params.push(semester); }
  if (exam_type) { query += ' AND m.exam_type = ?'; params.push(exam_type); }
  res.json(db.prepare(query).all(...params));
});

app.post('/api/marks', auth(['admin','faculty']), (req, res) => {
  const { student_id, subject_id, score, max_score, exam_type, academic_year } = req.body;
  db.prepare('INSERT OR REPLACE INTO marks (student_id,subject_id,score,max_score,exam_type,academic_year) VALUES (?,?,?,?,?,?)')
    .run(student_id, subject_id, score, max_score||100, exam_type||'End', academic_year||'2024-25');
  res.json({ message: 'Marks saved' });
});

// ─── NOTICES ─────────────────────────────────────────────
app.get('/api/notices', auth(), (req, res) => {
  const notices = db.prepare(`SELECT n.*, u.name as author_name FROM notices n LEFT JOIN users u ON n.author_id=u.id ORDER BY n.created_at DESC`).all();
  res.json(notices);
});

app.post('/api/notices', auth(['admin','faculty']), (req, res) => {
  const { title, body, type, audience } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Title and body required' });
  const result = db.prepare('INSERT INTO notices (title,body,type,audience,author_id) VALUES (?,?,?,?,?)')
    .run(title, body, type||'general', audience||'All', req.user.id);
  res.status(201).json(db.prepare('SELECT * FROM notices WHERE id=?').get(result.lastInsertRowid));
});

app.delete('/api/notices/:id', auth(['admin']), (req, res) => {
  db.prepare('DELETE FROM notices WHERE id = ?').run(req.params.id);
  res.json({ message: 'Notice deleted' });
});

// ─── REPORTS ─────────────────────────────────────────────
app.get('/api/reports/branch-performance', auth(), (req, res) => {
  const data = db.prepare(`
    SELECT s.branch,
      COUNT(DISTINCT s.id) as student_count,
      ROUND(AVG(m.score), 1) as avg_marks,
      ROUND(AVG(CASE WHEN a.status='P' THEN 100.0 ELSE 0 END), 1) as avg_attendance
    FROM students s
    LEFT JOIN marks m ON s.id = m.student_id
    LEFT JOIN attendance a ON s.id = a.student_id
    GROUP BY s.branch ORDER BY avg_marks DESC`).all();
  res.json(data);
});

app.listen(PORT, () => console.log(`🎓 AcademIQ API running on http://localhost:${PORT}`));
module.exports = app;
