const { app, connectToDatabase } = require('../backend/server');

module.exports = async function handler(req, res) {
  try {
    await connectToDatabase();
    return app(req, res);
  } catch (error) {
    console.error('[Vercel API] Database connection failed:', error);
    return res.status(503).json({
      success: false,
      message: 'Database is unavailable. Check the Vercel MONGODB_URI setting.'
    });
  }
};
