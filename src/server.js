const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const db = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Helper: Convert "HH:MM" to minutes from midnight
function timeToMinutes(tStr) {
  const [h, m] = tStr.split(':').map(Number);
  return h * 60 + m;
}

// Helper: Convert minutes from midnight to "HH:MM"
function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// -------------------------------------------------------------
// 1. SERVICES ENDPOINTS
// -------------------------------------------------------------
app.get('/api/services', (req, res) => {
  try {
    const services = db.prepare('SELECT * FROM services ORDER BY id ASC').all();
    res.json({ success: true, data: services });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/services', (req, res) => {
  try {
    const { title, description, duration_minutes, price, category, color } = req.body;
    if (!title || !duration_minutes) {
      return res.status(400).json({ success: false, error: 'Title and duration are required.' });
    }
    const stmt = db.prepare(`
      INSERT INTO services (title, description, duration_minutes, price, category, color)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      title,
      description || '',
      parseInt(duration_minutes, 10),
      parseInt(price, 10) || 0,
      category || 'General',
      color || '#4f46e5'
    );
    res.json({ success: true, serviceId: info.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 2. REAL-TIME AVAILABLE SLOTS COMPUTATION (Collision Prevention)
// -------------------------------------------------------------
app.get('/api/slots', (req, res) => {
  try {
    const { service_id, date } = req.query; // date format: YYYY-MM-DD
    if (!service_id || !date) {
      return res.status(400).json({ success: false, error: 'service_id and date are required.' });
    }

    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(service_id);
    if (!service) {
      return res.status(404).json({ success: false, error: 'Service not found.' });
    }

    // Determine day of week: 0 = Sun, 1 = Mon ... 6 = Sat
    const parsedDate = new Date(`${date}T00:00:00`);
    const dayOfWeek = parsedDate.getDay();

    // Check provider availability rule for this weekday
    const avail = db.prepare('SELECT * FROM availability WHERE day_of_week = ? AND is_active = 1').get(dayOfWeek);
    if (!avail) {
      return res.json({ success: true, slots: [], message: 'Provider does not work on this day.' });
    }

    const dayStartMins = timeToMinutes(avail.start_time);
    const dayEndMins = timeToMinutes(avail.end_time);
    const duration = service.duration_minutes;

    // Fetch existing active bookings on that date
    const existingBookings = db.prepare(`
      SELECT start_time, end_time FROM appointments
      WHERE appointment_date = ? AND status != 'cancelled'
    `).all(date);

    const bookedIntervals = existingBookings.map(b => ({
      start: timeToMinutes(b.start_time),
      end: timeToMinutes(b.end_time)
    }));

    // Generate potential slots (step interval default 30 mins or duration)
    const step = 30;
    const availableSlots = [];

    for (let current = dayStartMins; current + duration <= dayEndMins; current += step) {
      const slotStart = current;
      const slotEnd = current + duration;

      // Check collision with any existing booked interval:
      // Overlap condition: (slotStart < booked.end) && (slotEnd > booked.start)
      const isConflict = bookedIntervals.some(b => slotStart < b.end && slotEnd > b.start);

      // Check if slot is in the past for today's date
      const now = new Date();
      const isToday = now.toISOString().split('T')[0] === date;
      const currentMinsNow = now.getHours() * 60 + now.getMinutes();

      if (!isConflict && (!isToday || slotStart > currentMinsNow)) {
        availableSlots.push({
          start_time: minutesToTime(slotStart),
          end_time: minutesToTime(slotEnd),
          display: `${minutesToTime(slotStart)} - ${minutesToTime(slotEnd)}`
        });
      }
    }

    res.json({ success: true, date, slots: availableSlots });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 3. BOOKING CREATION WITH ATOMIC TRANSACTION LOCKING
// -------------------------------------------------------------
app.post('/api/bookings', (req, res) => {
  try {
    const { service_id, client_name, client_email, client_phone, appointment_date, start_time, notes } = req.body;

    if (!service_id || !client_name || !client_email || !appointment_date || !start_time) {
      return res.status(400).json({ success: false, error: 'All primary booking fields are required.' });
    }

    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(service_id);
    if (!service) {
      return res.status(404).json({ success: false, error: 'Service not found.' });
    }

    const startMins = timeToMinutes(start_time);
    const endMins = startMins + service.duration_minutes;
    const end_time = minutesToTime(endMins);

    // Atomic transaction: verify slot is still free before booking
    const bookTransaction = db.transaction(() => {
      const conflict = db.prepare(`
        SELECT id FROM appointments
        WHERE appointment_date = ?
          AND status != 'cancelled'
          AND (time(?) < time(end_time) AND time(?) > time(start_time))
      `).get(appointment_date, start_time, end_time);

      if (conflict) {
        throw new Error('This time slot was just booked by someone else! Please choose another slot.');
      }

      const bookingRef = 'SF-' + crypto.randomBytes(3).toString('hex').toUpperCase();

      const insertStmt = db.prepare(`
        INSERT INTO appointments (
          booking_reference, service_id, client_name, client_email, client_phone,
          appointment_date, start_time, end_time, notes, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')
      `);

      const result = insertStmt.run(
        bookingRef,
        service_id,
        client_name.trim(),
        client_email.trim().toLowerCase(),
        client_phone || '',
        appointment_date,
        start_time,
        end_time,
        notes || ''
      );

      return {
        id: result.lastInsertRowid,
        booking_reference: bookingRef,
        service_name: service.title,
        duration: service.duration_minutes,
        price: service.price,
        client_name,
        client_email,
        appointment_date,
        start_time,
        end_time
      };
    });

    const bookedData = bookTransaction();
    res.json({ success: true, booking: bookedData });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 4. ADMIN DASHBOARD & APPOINTMENTS MANAGEMENT
// -------------------------------------------------------------
app.get('/api/admin/appointments', (req, res) => {
  try {
    const { status, date } = req.query;
    let query = `
      SELECT a.*, s.title as service_title, s.duration_minutes, s.price, s.color as service_color
      FROM appointments a
      JOIN services s ON a.service_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
      query += ' AND a.status = ?';
      params.push(status);
    }
    if (date) {
      query += ' AND a.appointment_date = ?';
      params.push(date);
    }

    query += ' ORDER BY a.appointment_date DESC, a.start_time ASC';

    const appointments = db.prepare(query).all(...params);
    res.json({ success: true, data: appointments });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update appointment status (confirm, complete, cancel)
app.patch('/api/admin/appointments/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['confirmed', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status.' });
    }

    const stmt = db.prepare('UPDATE appointments SET status = ? WHERE id = ?');
    const result = stmt.run(status, id);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Appointment not found.' });
    }

    res.json({ success: true, message: `Appointment status updated to ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Analytics Overview
app.get('/api/admin/metrics', (req, res) => {
  try {
    const totalAppointments = db.prepare('SELECT COUNT(*) as count FROM appointments').get().count;
    const confirmedCount = db.prepare("SELECT COUNT(*) as count FROM appointments WHERE status = 'confirmed'").get().count;
    const completedCount = db.prepare("SELECT COUNT(*) as count FROM appointments WHERE status = 'completed'").get().count;
    const cancelledCount = db.prepare("SELECT COUNT(*) as count FROM appointments WHERE status = 'cancelled'").get().count;

    // Projected Revenue
    const revenueRow = db.prepare(`
      SELECT SUM(s.price) as total_revenue
      FROM appointments a
      JOIN services s ON a.service_id = s.id
      WHERE a.status IN ('confirmed', 'completed')
    `).get();

    const revenue = revenueRow.total_revenue || 0;

    // Upcoming appointments count
    const today = new Date().toISOString().split('T')[0];
    const upcomingCount = db.prepare(`
      SELECT COUNT(*) as count FROM appointments
      WHERE appointment_date >= ? AND status = 'confirmed'
    `).get(today).count;

    res.json({
      success: true,
      metrics: {
        totalAppointments,
        confirmedCount,
        completedCount,
        cancelledCount,
        upcomingCount,
        projectedRevenue: revenue
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Provider Working Hours Settings
app.get('/api/admin/availability', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM availability ORDER BY day_of_week ASC').all();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/admin/availability', (req, res) => {
  try {
    const { schedule } = req.body; // array of { day_of_week, start_time, end_time, is_active }
    if (!Array.isArray(schedule)) {
      return res.status(400).json({ success: false, error: 'schedule array is required.' });
    }

    const updateStmt = db.prepare(`
      UPDATE availability
      SET start_time = ?, end_time = ?, is_active = ?
      WHERE day_of_week = ?
    `);

    const runBatch = db.transaction((items) => {
      for (const item of items) {
        updateStmt.run(item.start_time, item.end_time, item.is_active ? 1 : 0, item.day_of_week);
      }
    });

    runBatch(schedule);
    res.json({ success: true, message: 'Working hours updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fallback route to serve index.html for client-side routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 SlotFlow Server running on http://localhost:${PORT}`);
});
