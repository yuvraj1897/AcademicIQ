# 🎓 AcademIQ — Student Management System

A modern, premium college management platform with admin dashboard, student records, attendance tracking, marks/results, and reporting.

---

## 🚀 Quick Start (Frontend Only)

Simply open `index.html` in any modern browser. No server required for the frontend demo — it uses localStorage for persistence.

**Login credentials:**
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@academiq.edu | admin123 |
| Faculty | faculty@academiq.edu | faculty123 |
| Student | student@academiq.edu | student123 |

---

## 📁 Project Structure

```
student-mgmt/
├── index.html              ← Complete frontend (open this!)
├── README.md
└── backend/
    ├── server.js           ← Express REST API
    ├── package.json
    └── academiq.db         ← Auto-created SQLite database
```

---

## 🔧 Backend Setup (Full Stack)

### Prerequisites
- Node.js 18+
- npm

### Install & Run

```bash
cd backend
npm install
npm start
# API runs at http://localhost:3001
```

### Development (hot reload)
```bash
npm run dev
```

---

## 📡 REST API Reference

### Authentication
```
POST   /api/auth/login        { email, password } → { token, user }
POST   /api/auth/logout
GET    /api/auth/me           → current user
```

### Students
```
GET    /api/students          ?branch=&semester=&status=&search=&page=&limit=
GET    /api/students/:id
POST   /api/students          { name, enrollment, branch, ... }
PUT    /api/students/:id
DELETE /api/students/:id      [Admin only]
```

### Attendance
```
GET    /api/attendance        ?student_id=&month=&year=&branch=
POST   /api/attendance/bulk   { records:[{student_id,status}], date }
GET    /api/attendance/summary ?branch=&semester=
```

### Marks
```
GET    /api/marks             ?student_id=&branch=&semester=&exam_type=
POST   /api/marks             { student_id, subject_id, score, exam_type }
```

### Notices
```
GET    /api/notices
POST   /api/notices           { title, body, type, audience }
DELETE /api/notices/:id       [Admin only]
```

### Reports
```
GET    /api/reports/branch-performance
```

All protected routes require: `Authorization: Bearer <token>`

---

## 🗄️ Database Schema

### users
```sql
id, name, email, password (bcrypt), role (admin|faculty|student), created_at
```

### students
```sql
id, name, enrollment (unique), roll, branch, semester, email, phone,
dob, gender, address, status (Active|Inactive|Graduated), adm_date, created_at, updated_at
```

### attendance
```sql
id, student_id (FK), date, status (P|A|H), marked_by (FK users), UNIQUE(student_id, date)
```

### subjects
```sql
id, name, branch, semester, credits
```

### marks
```sql
id, student_id (FK), subject_id (FK), exam_type (Mid|End|Internal),
score, max_score, academic_year, UNIQUE(student_id, subject_id, exam_type, academic_year)
```

### notices
```sql
id, title, body, type (general|urgent|info), audience, author_id (FK), created_at
```

---

## ✨ Features

| Feature | Status |
|---------|--------|
| Admin Login + JWT Auth | ✅ |
| Role-based access (Admin/Faculty/Student) | ✅ |
| Dashboard with live stats | ✅ |
| Branch & Semester charts | ✅ |
| Student CRUD (Add/Edit/Delete/View) | ✅ |
| Student Profile with full details | ✅ |
| Search & Multi-filter | ✅ |
| Attendance marking (daily) | ✅ |
| Attendance calendar view | ✅ |
| Marks/Results entry | ✅ |
| Grade calculation (O/A/B/C/F) | ✅ |
| Notices & Announcements | ✅ |
| Export PDF (Students + Attendance) | ✅ |
| Export Excel (Students + Marks) | ✅ |
| Dark / Light mode | ✅ |
| Accent color picker | ✅ |
| Notification system | ✅ |
| Responsive / Mobile friendly | ✅ |
| localStorage persistence (demo) | ✅ |

---

## 🛠️ Production Deployment

### Frontend
- Deploy `index.html` to any static host (Netlify, Vercel, Nginx)
- Update API base URL in the JS section

### Backend
- Deploy to Railway, Render, or VPS
- Set environment variable: `JWT_SECRET=your-secure-secret`
- For production, migrate from SQLite → PostgreSQL using `pg` package

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY backend/ .
RUN npm install --production
EXPOSE 3001
CMD ["node", "server.js"]
```

---

## 🔐 Security Notes

- Passwords hashed with bcrypt (10 rounds)
- JWT tokens expire in 8 hours
- Role-based middleware on all routes
- SQL injection prevented via parameterized queries
- CORS configured for frontend origin only

---

Built with ❤️ using HTML/CSS/JS + Node.js + Express + SQLite
