// HVAC AI Secretary - Main Server
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3001;

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('✓ Database connected:', res.rows[0].now);
  }
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Routes
const chatRoutes = require('./routes/chat');
const smsRoutes = require('./routes/sms');
const appointmentRoutes = require('./routes/appointments');
const customerRoutes = require('./routes/customers');

app.use('/api/chat', chatRoutes);
app.use('/api/sms', smsRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/customers', customerRoutes);

// Google Calendar availability endpoint
app.get('/api/availability', async (req, res) => {
  try {
    const { startDate, endDate, timezone = 'America/New_York' } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }
    
    // Business hours configuration
    const BUSINESS_HOURS = {
      0: null, // Sunday - closed
      1: { start: 8, end: 17 }, // Monday
      2: { start: 8, end: 17 }, // Tuesday
      3: { start: 8, end: 17 }, // Wednesday
      4: { start: 8, end: 17 }, // Thursday
      5: { start: 8, end: 17 }, // Friday
      6: null  // Saturday - closed
    };
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    const availableSlots = [];
    
    // Generate available time slots
    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const dayOfWeek = date.getDay();
      const hours = BUSINESS_HOURS[dayOfWeek];
      
      if (!hours) continue; // Skip closed days
      
      for (let hour = hours.start; hour < hours.end; hour++) {
        const slotTime = new Date(date);
        slotTime.setHours(hour, 0, 0, 0);
        
        // Check if slot is already booked
        const isBooked = await pool.query(
          `SELECT id FROM appointments 
           WHERE scheduled_date = $1 
           AND status NOT IN ('cancelled', 'completed')`,
          [slotTime]
        );
        
        if (isBooked.rows.length === 0) {
          availableSlots.push({
            date: slotTime.toISOString().split('T')[0],
            time: slotTime.toTimeString().split(' ')[0].substring(0, 5),
            datetime: slotTime.toISOString()
          });
        }
      }
    }
    
    res.json({
      success: true,
      timezone: timezone,
      slots: availableSlots
    });
    
  } catch (error) {
    console.error('Availability error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Export pool for use in routes
module.exports = { pool };

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📅 Environment: ${process.env.NODE_ENV || 'development'}`);
});