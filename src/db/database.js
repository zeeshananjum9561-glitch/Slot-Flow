const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'slotflow.db');
const db = new Database(dbPath);

// Enable foreign keys and WAL mode for performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDb() {
  // Services table (e.g. 30min Consultation, Tech Interview Prep, Full Portfolio Review)
  db.exec(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      duration_minutes INTEGER NOT NULL DEFAULT 30,
      price INTEGER NOT NULL DEFAULT 0,
      category TEXT DEFAULT 'Consultation',
      color TEXT DEFAULT '#4f46e5'
    );
  `);

  // Provider Working Hours / Availability Settings
  db.exec(`
    CREATE TABLE IF NOT EXISTS availability (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_of_week INTEGER NOT NULL, -- 0 = Sunday, 1 = Monday ... 6 = Saturday
      start_time TEXT NOT NULL,      -- "09:00"
      end_time TEXT NOT NULL,        -- "17:00"
      is_active INTEGER NOT NULL DEFAULT 1
    );
  `);

  // Bookings / Appointments Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_reference TEXT UNIQUE NOT NULL,
      service_id INTEGER NOT NULL,
      client_name TEXT NOT NULL,
      client_email TEXT NOT NULL,
      client_phone TEXT,
      appointment_date TEXT NOT NULL, -- YYYY-MM-DD
      start_time TEXT NOT NULL,       -- HH:MM (24-hour format)
      end_time TEXT NOT NULL,         -- HH:MM (24-hour format)
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'confirmed', -- confirmed, completed, cancelled
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (service_id) REFERENCES services(id)
    );
  `);

  // Seed default services if empty
  const serviceCount = db.prepare('SELECT COUNT(*) AS count FROM services').get().count;
  if (serviceCount === 0) {
    const insertService = db.prepare(`
      INSERT INTO services (title, description, duration_minutes, price, category, color)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertService.run(
      'Strategy & Technical Consultation',
      'One-on-one deep-dive into your system architecture, technical roadblocks, or career trajectory.',
      45,
      75,
      'Consulting',
      '#6366f1'
    );
    insertService.run(
      'Mock Coding & System Design Interview',
      'Rigorous 60-minute technical interview simulation with actionable feedback and rubrics.',
      60,
      120,
      'Coaching',
      '#06b6d4'
    );
    insertService.run(
      'Portfolio & Resume Audit',
      'Line-by-line review of your projects, live deployments, and GitHub to maximize interview callbacks.',
      30,
      50,
      'Review',
      '#10b981'
    );
    insertService.run(
      'Quick Discovery Call',
      'Brief 15-minute introductory chat to evaluate fit and explore project scope.',
      15,
      0,
      'Intro',
      '#f59e0b'
    );
  }

  // Seed default availability (Monday to Friday, 09:00 to 18:00)
  const availCount = db.prepare('SELECT COUNT(*) AS count FROM availability').get().count;
  if (availCount === 0) {
    const insertAvail = db.prepare(`
      INSERT INTO availability (day_of_week, start_time, end_time, is_active)
      VALUES (?, ?, ?, ?)
    `);
    // 1 to 5 (Mon to Fri) active
    for (let day = 1; day <= 5; day++) {
      insertAvail.run(day, '09:00', '18:00', 1);
    }
    // 0 and 6 (Sun and Sat) inactive
    insertAvail.run(0, '10:00', '14:00', 0);
    insertAvail.run(6, '10:00', '15:00', 0);
  }

  // Seed a sample booking if none exist
  const apptCount = db.prepare('SELECT COUNT(*) AS count FROM appointments').get().count;
  if (apptCount === 0) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];

    db.prepare(`
      INSERT INTO appointments (booking_reference, service_id, client_name, client_email, client_phone, appointment_date, start_time, end_time, notes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'SF-DEMO-01',
      1,
      'Sarah Jenkins',
      'sarah.j@example.com',
      '+1 (555) 234-5678',
      dateStr,
      '10:00',
      '10:45',
      'Looking to review our upcoming microservices architecture.',
      'confirmed'
    );
  }
}

initDb();

module.exports = db;
