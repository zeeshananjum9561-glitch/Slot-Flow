# ⚡ SlotFlow – Full-Stack Booking & Appointment SaaS Platform

SlotFlow is a high-performance, collision-free appointment scheduling and calendar management platform designed to showcase full-stack engineering proficiency.

---

## 🌟 Key Features

1. **Intelligent Dynamic Slot Generator**
   - Automatically computes available intervals based on provider working hours and service duration.
   - Prevents double-booking and slot collisions via SQLite atomic transactions.
   - Filters out past time slots for current-day bookings.

2. **Public Multi-Step Client Booking Portal**
   - Step 1: Select consultation type (Strategy, System Design Mock, Portfolio Audit, Discovery Call).
   - Step 2: Date picker + real-time available slot buttons.
   - Step 3: Client contact details form with instant booking confirmation and reference token (`SF-XXXXXX`).

3. **Provider Admin Hub & Metrics**
   - Live revenue pipeline and appointment status tracking.
   - Filter bookings by status: `Confirmed`, `Completed`, `Cancelled`.
   - Update appointment status dynamically via inline controls.
   - Custom working hours configuration (Mon-Sun) with live slot recalculation.

4. **Tech Architecture**
   - **Backend:** Node.js, Express.js, REST API architecture.
   - **Database:** SQLite (`better-sqlite3`) with WAL (Write-Ahead Logging) mode and foreign key constraints.
   - **Frontend:** Responsive Vanilla HTML5/CSS3/Modern ES6+ JavaScript with dark modern SaaS aesthetics.

---

## 🚀 How to Run Locally

### 1. Start the Server:
Open terminal in the `slotflow` folder and run:
```bash
node src/server.js
```

### 2. Access in Browser:
- **Client Booking Portal:** [http://localhost:3000](http://localhost:3000)
- **Provider Admin Dashboard:** Click on **"📊 Provider Dashboard"** at the top right of the navigation bar.

---

## 📁 Project Directory Structure
```
Practice/
└── slotflow/
    ├── package.json
    ├── README.md
    ├── src/
    │   ├── server.js              # Express REST APIs & slot conflict engine
    │   └── db/
    │       ├── database.js        # SQLite schema, tables & seed data
    │       └── slotflow.db        # SQLite database file
    └── public/
        ├── index.html             # Multi-step booking portal & Admin dashboard
        ├── css/
        │   └── style.css          # Dark SaaS UI styles & animations
        └── js/
            └── app.js             # Client state management & API integration
```
