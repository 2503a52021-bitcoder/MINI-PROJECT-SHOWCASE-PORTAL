/**
 * ==========================================================================
 * Mini Project Showcase Portal - Backend Server
 * Technology: Node.js, Express.js & Official MongoDB Driver
 * Database Name: mini_project_showcase
 * Problem Statement 4 - Hackathon 2026
 * ==========================================================================
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient } = require('mongodb');

const { router: authRoutes, verifyToken, requireFaculty } = require('./authRoutes');
const projectRoutes = require('./projectRoutes');
const facultyRoutes = require('./facultyRoutes');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.DB_NAME || 'mini_project_showcase';

let client = null;
let db = null;
let dbConnectionPromise = null;

// --------------------------------------------------------------------------
// MIDDLEWARE CONFIGURATION
// --------------------------------------------------------------------------

// Cross-Origin Resource Sharing
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving: Uploaded screenshots
const uploadsPath = process.env.VERCEL
  ? path.join('/tmp', 'uploads')
  : path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsPath));

// Static file serving: Frontend application from frontend folder
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

// Request logger
app.use((req, res, next) => {
  console.log(`[API] ${req.method} ${req.originalUrl}`);
  next();
});

// Middleware to inject the active MongoDB database instance into every request
app.use((req, res, next) => {
  if (!db) {
    return res.status(503).json({
      success: false,
      message: 'Database is not yet connected. Please try again shortly.'
    });
  }
  req.db = db;
  next();
});

// --------------------------------------------------------------------------
// ROUTE REGISTRATION (Problem Statement 4)
// --------------------------------------------------------------------------

// 1. Authentication Module
app.use('/api/auth', authRoutes);

// 2. Project Management Module
app.use('/api/projects', projectRoutes);

// 3. Approval Workflow Aliases (Problem Statement 4 mapping)
app.use('/api/projects/pending', (req, res, next) => {
  req.url = '/pending';
  facultyRoutes(req, res, next);
});

app.use('/api/projects/status', (req, res, next) => {
  facultyRoutes(req, res, next);
});

// 4. Faculty Review Panel Module
app.use('/api/faculty', facultyRoutes);

// 5. Category Management Module (Connected directly to MongoDB)
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await req.db.collection('categories').find({}).toArray();
    res.status(200).json({ success: true, count: categories.length, data: categories });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not fetch categories.' });
  }
});

app.post('/api/categories', verifyToken, requireFaculty, async (req, res) => {
  try {
    const { code, name, description, icon } = req.body;
    if (!code || !name) {
      return res.status(400).json({ success: false, message: 'Code and name are required.' });
    }

    const categoriesColl = req.db.collection('categories');
    const existing = await categoriesColl.findOne({
      $or: [
        { code: new RegExp(`^${code.trim()}$`, 'i') },
        { name: new RegExp(`^${name.trim()}$`, 'i') }
      ]
    });

    if (existing) {
      return res.status(409).json({ success: false, message: 'Category already exists.' });
    }

    const newCat = {
      code: code.trim(),
      name: name.trim(),
      description: description ? description.trim() : '',
      icon: icon || '📁',
      createdAt: new Date()
    };

    const result = await categoriesColl.insertOne(newCat);
    newCat._id = result.insertedId;

    res.status(201).json({ success: true, message: 'Category created.', data: newCat });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not create category.' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ONLINE',
    service: 'Mini Project Showcase Portal API',
    database: 'MongoDB Native Driver',
    databaseName: DB_NAME,
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Global 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, message: `API route "${req.originalUrl}" not found.` });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'An unexpected internal server error occurred.'
  });
});

// --------------------------------------------------------------------------
// DATABASE CONNECTION & SERVER STARTUP
// --------------------------------------------------------------------------

async function connectToDatabase() {
  if (db) return db;
  if (process.env.VERCEL && !process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI must be configured in Vercel environment variables.');
  }
  if (!dbConnectionPromise) {
    console.log('[MongoDB] Connecting to the configured database...');
    client = new MongoClient(MONGODB_URI, {
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 5000
    });

    dbConnectionPromise = client.connect().then(async () => {
      db = client.db(DB_NAME);
      app.locals.db = db;
      await db.command({ ping: 1 });
      console.log(`[MongoDB] Successfully connected to database: "${DB_NAME}"`);
      return db;
    }).catch((err) => {
      dbConnectionPromise = null;
      client = null;
      throw err;
    });
  }

  return dbConnectionPromise;
}

async function startServer() {
  try {
    await connectToDatabase();
    // Verify existing collections
    const collections = await db.listCollections().toArray();
    const colNames = collections.map(c => c.name);
    console.log(`[MongoDB] Accessible collections: ${colNames.join(', ')}`);

    app.listen(PORT, () => {
      console.log('====================================================');
      console.log(`⚡ Mini Project Showcase Portal Backend is running!`);
      console.log(`🍃 Database:   MongoDB ("${DB_NAME}") via Official Driver`);
      console.log(`🌐 Server URL: http://localhost:${PORT}`);
      console.log(`📡 API Base:   http://localhost:${PORT}/api`);
      console.log(`📁 Uploads:    http://localhost:${PORT}/uploads`);
      console.log('====================================================');
    });
  } catch (err) {
    console.error('[MongoDB Connection Failed]:', err.message);
    console.error('Check that MONGODB_URI is configured and the database is reachable.');
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, connectToDatabase };
