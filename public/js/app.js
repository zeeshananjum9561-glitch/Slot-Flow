// State Management
let selectedService = null;
let selectedDate = null;
let selectedSlot = null;
let servicesList = [];

const daysOfWeekNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// -------------------------------------------------------------
// NAVIGATION & VIEW SWITCHING
// -------------------------------------------------------------
function switchView(viewName) {
  const bookingView = document.getElementById('bookingView');
  const adminView = document.getElementById('adminView');
  const tabBooking = document.getElementById('tabBooking');
  const tabAdmin = document.getElementById('tabAdmin');

  if (viewName === 'booking') {
    bookingView.classList.add('active');
    adminView.classList.remove('active');
    tabBooking.classList.add('active');
    tabAdmin.classList.remove('active');
  } else {
    bookingView.classList.remove('active');
    adminView.classList.add('active');
    tabBooking.classList.remove('active');
    tabAdmin.classList.add('active');
    loadAdminData();
  }
}

function goToStep(step) {
  const stepServices = document.getElementById('stepServices');
  const stepDateTime = document.getElementById('stepDateTime');
  const stepDetails = document.getElementById('stepDetails');
  const stepSuccess = document.getElementById('stepSuccess');

  const ind1 = document.getElementById('stepIndicator1');
  const ind2 = document.getElementById('stepIndicator2');
  const ind3 = document.getElementById('stepIndicator3');

  stepServices.style.display = 'none';
  stepDateTime.style.display = 'none';
  stepDetails.style.display = 'none';
  stepSuccess.style.display = 'none';

  ind1.className = 'step-item';
  ind2.className = 'step-item';
  ind3.className = 'step-item';

  if (step === 1) {
    stepServices.style.display = 'block';
    ind1.className = 'step-item active';
  } else if (step === 2) {
    stepDateTime.style.display = 'block';
    ind1.className = 'step-item done';
    ind2.className = 'step-item active';
    // Set default date to tomorrow if empty
    const dateInput = document.getElementById('bookingDate');
    if (!dateInput.value) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const yyyy = tomorrow.getFullYear();
      const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const dd = String(tomorrow.getDate()).padStart(2, '0');
      dateInput.value = `${yyyy}-${mm}-${dd}`;
      dateInput.min = `${yyyy}-${mm}-${dd}`;
    }
    fetchAvailableSlots();
  } else if (step === 3) {
    stepDetails.style.display = 'block';
    ind1.className = 'step-item done';
    ind2.className = 'step-item done';
    ind3.className = 'step-item active';

    // Populate review summary card
    const summaryBox = document.getElementById('bookingSummaryReview');
    summaryBox.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: gap;">
        <div>
          <span style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: #818cf8; font-weight: 700;">Selected Session</span>
          <h3 style="font-size: 1.15rem; margin: 0.2rem 0;">${selectedService.title}</h3>
          <p style="font-size: 0.9rem; color: var(--text-muted);">
            📅 ${selectedDate} &nbsp;|&nbsp; ⏰ ${selectedSlot.start_time} - ${selectedSlot.end_time} (${selectedService.duration_minutes} mins)
          </p>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 1.5rem; font-weight: 800; color: #fff;">$${selectedService.price}</div>
          <span style="font-size: 0.75rem; color: var(--emerald); font-weight: 600;">Slot Held</span>
        </div>
      </div>
    `;
  }
}

// -------------------------------------------------------------
// STEP 1: LOAD SERVICES
// -------------------------------------------------------------
async function loadServices() {
  const container = document.getElementById('servicesContainer');
  try {
    const res = await fetch('/api/services');
    const result = await res.json();
    if (!result.success) throw new Error(result.error);

    servicesList = result.data;
    container.innerHTML = servicesList.map(s => `
      <div class="service-card" id="service-card-${s.id}" onclick="selectService(${s.id})">
        <div>
          <span class="service-tag" style="color: ${s.color}; border: 1px solid ${s.color};">${s.category}</span>
          <h3 class="service-title">${s.title}</h3>
          <p class="service-desc">${s.description}</p>
        </div>
        <div class="service-meta">
          <div class="service-price">$${s.price}</div>
          <div class="service-duration">⏱️ ${s.duration_minutes} mins</div>
        </div>
      </div>
    `).join('');

    // Auto-select first service by default
    if (servicesList.length > 0) {
      selectService(servicesList[0].id);
    }
  } catch (err) {
    container.innerHTML = `<div style="color: var(--rose); padding: 1rem;">Failed to load services: ${err.message}</div>`;
  }
}

function selectService(id) {
  selectedService = servicesList.find(s => s.id === id);
  document.querySelectorAll('.service-card').forEach(el => el.classList.remove('selected'));
  const card = document.getElementById(`service-card-${id}`);
  if (card) card.classList.add('selected');
  document.getElementById('btnToStep2').disabled = false;
}

// -------------------------------------------------------------
// STEP 2: REAL-TIME COLLISION-FREE SLOTS
// -------------------------------------------------------------
async function fetchAvailableSlots() {
  if (!selectedService) return;
  const dateVal = document.getElementById('bookingDate').value;
  if (!dateVal) return;

  selectedDate = dateVal;
  selectedSlot = null;
  document.getElementById('btnToStep3').disabled = true;

  const container = document.getElementById('slotsContainer');
  const countText = document.getElementById('slotCountText');
  container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.9rem; padding: 1rem 0;">Checking provider availability...</div>`;

  try {
    const res = await fetch(`/api/slots?service_id=${selectedService.id}&date=${dateVal}`);
    const data = await res.json();

    if (!data.success) throw new Error(data.error);

    const slots = data.slots;
    countText.innerText = slots.length;

    if (slots.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; color: var(--amber); background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.2); padding: 1rem; border-radius: var(--radius-sm); font-size: 0.9rem;">
          No available slots on this day (${data.message || 'Fully booked or non-working day'}). Please try choosing another weekday.
        </div>
      `;
      return;
    }

    container.innerHTML = slots.map((slot, idx) => `
      <button type="button" class="slot-btn" id="slot-btn-${idx}" onclick='selectSlot(${idx}, ${JSON.stringify(slot)})'>
        ${slot.start_time}
      </button>
    `).join('');

  } catch (err) {
    container.innerHTML = `<div style="color: var(--rose); font-size: 0.9rem;">Error fetching slots: ${err.message}</div>`;
  }
}

function selectSlot(idx, slot) {
  selectedSlot = slot;
  document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
  const activeBtn = document.getElementById(`slot-btn-${idx}`);
  if (activeBtn) activeBtn.classList.add('selected');
  document.getElementById('btnToStep3').disabled = false;
}

// -------------------------------------------------------------
// STEP 3: SUBMIT BOOKING (ATOMIC LOCKING)
// -------------------------------------------------------------
async function submitBooking(e) {
  e.preventDefault();
  const btn = document.getElementById('btnConfirmBooking');
  btn.disabled = true;
  btn.innerText = 'Locking your slot...';

  const payload = {
    service_id: selectedService.id,
    client_name: document.getElementById('clientName').value,
    client_email: document.getElementById('clientEmail').value,
    client_phone: document.getElementById('clientPhone').value,
    appointment_date: selectedDate,
    start_time: selectedSlot.start_time,
    notes: document.getElementById('clientNotes').value
  };

  try {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!result.success) {
      alert(`Booking conflict: ${result.error}`);
      btn.disabled = false;
      btn.innerText = 'Confirm & Book Session 🚀';
      goToStep(2); // Go back to slots to re-pick
      return;
    }

    // Success Screen
    showBookingSuccess(result.booking);
  } catch (err) {
    alert(`Submission error: ${err.message}`);
    btn.disabled = false;
    btn.innerText = 'Confirm & Book Session 🚀';
  }
}

function showBookingSuccess(booking) {
  document.getElementById('stepServices').style.display = 'none';
  document.getElementById('stepDateTime').style.display = 'none';
  document.getElementById('stepDetails').style.display = 'none';
  document.getElementById('stepSuccess').style.display = 'block';

  document.getElementById('stepIndicator1').className = 'step-item done';
  document.getElementById('stepIndicator2').className = 'step-item done';
  document.getElementById('stepIndicator3').className = 'step-item done';

  document.getElementById('successBookingRef').innerText = booking.booking_reference;

  document.getElementById('successDetailsBox').innerHTML = `
    <div style="font-size: 0.95rem; line-height: 1.8;">
      <div><strong>Service:</strong> ${booking.service_name}</div>
      <div><strong>Date:</strong> ${booking.appointment_date}</div>
      <div><strong>Time Slot:</strong> ${booking.start_time} - ${booking.end_time} (${booking.duration} mins)</div>
      <div><strong>Client:</strong> ${booking.client_name} (${booking.client_email})</div>
      <div><strong>Price:</strong> $${booking.price}</div>
      <div style="margin-top: 0.5rem; color: var(--emerald); font-size: 0.85rem;">
        ✓ Calendar invite & confirmation logged in system database.
      </div>
    </div>
  `;
}

function resetBookingFlow() {
  document.getElementById('bookingForm').reset();
  selectedSlot = null;
  goToStep(1);
}

// -------------------------------------------------------------
// ADMIN DASHBOARD LOGIC
// -------------------------------------------------------------
async function loadAdminData() {
  loadAdminMetrics();
  loadAdminAppointments();
  loadAdminAvailability();
}

async function loadAdminMetrics() {
  try {
    const res = await fetch('/api/admin/metrics');
    const result = await res.json();
    if (!result.success) return;

    const m = result.metrics;
    document.getElementById('metricTotal').innerText = m.totalAppointments;
    document.getElementById('metricUpcoming').innerText = m.upcomingCount;
    document.getElementById('metricCompleted').innerText = m.completedCount;
    document.getElementById('metricRevenue').innerText = `$${m.projectedRevenue}`;
  } catch (err) {
    console.error('Error fetching admin metrics:', err);
  }
}

async function loadAdminAppointments() {
  const status = document.getElementById('filterStatus').value;
  const tbody = document.getElementById('adminAppointmentsTbody');
  try {
    const res = await fetch(`/api/admin/appointments?status=${status}`);
    const result = await res.json();
    if (!result.success) throw new Error(result.error);

    const appointments = result.data;
    if (appointments.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 2rem;">No appointments found matching this criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = appointments.map(a => `
      <tr>
        <td><strong style="color: #818cf8; font-family: monospace;">${a.booking_reference}</strong></td>
        <td>
          <div style="font-weight: 600;">${a.client_name}</div>
          <div style="font-size: 0.8rem; color: var(--text-dim);">${a.client_email}</div>
        </td>
        <td>
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${a.service_color || '#6366f1'}; margin-right: 6px;"></span>
          ${a.service_title}
        </td>
        <td>
          <div>${a.appointment_date}</div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">${a.start_time} - ${a.end_time}</div>
        </td>
        <td style="font-weight: 700;">$${a.price}</td>
        <td>
          <span class="status-badge status-${a.status}">${a.status}</span>
        </td>
        <td>
          <select class="action-select" onchange="updateAppointmentStatus(${a.id}, this.value)">
            <option value="confirmed" ${a.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
            <option value="completed" ${a.status === 'completed' ? 'selected' : ''}>Completed</option>
            <option value="cancelled" ${a.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="color: var(--rose); text-align: center;">Failed to load appointments: ${err.message}</td></tr>`;
  }
}

async function updateAppointmentStatus(id, newStatus) {
  try {
    const res = await fetch(`/api/admin/appointments/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.error);
    loadAdminMetrics();
    loadAdminAppointments();
  } catch (err) {
    alert(`Error updating status: ${err.message}`);
  }
}

async function loadAdminAvailability() {
  const grid = document.getElementById('availabilitySettingsGrid');
  try {
    const res = await fetch('/api/admin/availability');
    const result = await res.json();
    if (!result.success) throw new Error(result.error);

    const schedule = result.data;
    grid.innerHTML = schedule.map(day => `
      <div style="background: var(--bg-card); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color);" data-day="${day.day_of_week}">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
          <strong>${daysOfWeekNames[day.day_of_week]}</strong>
          <label style="font-size: 0.85rem; display: flex; align-items: center; gap: 0.4rem; cursor: pointer;">
            <input type="checkbox" id="avail-check-${day.day_of_week}" ${day.is_active ? 'checked' : ''}>
            <span>${day.is_active ? 'Available' : 'Day Off'}</span>
          </label>
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <input type="time" class="form-input" style="padding: 0.4rem;" id="avail-start-${day.day_of_week}" value="${day.start_time}">
          <span style="color: var(--text-dim); font-size: 0.85rem;">to</span>
          <input type="time" class="form-input" style="padding: 0.4rem;" id="avail-end-${day.day_of_week}" value="${day.end_time}">
        </div>
      </div>
    `).join('');
  } catch (err) {
    grid.innerHTML = `<div style="color: var(--rose);">Failed to load availability: ${err.message}</div>`;
  }
}

async function saveAvailabilitySettings() {
  const schedule = [];
  for (let i = 0; i <= 6; i++) {
    const check = document.getElementById(`avail-check-${i}`);
    const start = document.getElementById(`avail-start-${i}`);
    const end = document.getElementById(`avail-end-${i}`);
    if (check && start && end) {
      schedule.push({
        day_of_week: i,
        is_active: check.checked ? 1 : 0,
        start_time: start.value,
        end_time: end.value
      });
    }
  }

  try {
    const res = await fetch('/api/admin/availability', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule })
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.error);
    alert('Working hours updated successfully!');
  } catch (err) {
    alert(`Failed to save working hours: ${err.message}`);
  }
}

// Initial Boot
document.addEventListener('DOMContentLoaded', () => {
  loadServices();
});
