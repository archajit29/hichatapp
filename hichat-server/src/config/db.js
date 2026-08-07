/**
 * Database connection module for the HiChat server.
 *
 * This file sets up a robust MongoDB connection using Mongoose.
 * It includes:
 *   - Connection options tuned for production (new URL parser, unified topology, timeouts, etc.).
 *   - Event listeners that log connection lifecycle events (connected, error, disconnected, reconnected).
 *   - Graceful shutdown handling to close the connection when the process exits.
 *   - Exported `connectDB` function for initializing the connection.
 *   - Exported `mongooseConnection` for direct access to the underlying Mongoose connection if needed.
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Pull the MongoDB URI from environment variables.
// Fallback to a local development URI if not provided.
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hichat';

// Connection options that work well for a high‑throughput, WhatsApp‑like messaging service.
const connectionOptions = {
  // Use the new MongoDB driver URL parser.
  useNewUrlParser: true,
  // Use the unified topology engine for better server discovery and monitoring.
  useUnifiedTopology: true,
  // Keep the socket open longer to accommodate bursts of traffic.
  socketTimeoutMS: 30000,
  // Fail fast if no server is available.
  serverSelectionTimeoutMS: 5000,
  // Automatically retry writes on transient network errors.
  retryWrites: true,
  // Enable index creation (useful for development; can be disabled in production).
  autoIndex: true,
};

/**
 * Initialize the MongoDB connection.
 *
 * This function should be called once during server startup.
 */
const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI, connectionOptions);
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    // Exit the process if we cannot connect – the app cannot function without a DB.
    process.exit(1);
  }
};

/**
 * Register Mongoose connection event listeners.
 * These listeners provide helpful logs for debugging and monitoring.
 */
mongoose.connection.on('connected', () => {
  console.log('🔗 Mongoose connected to', MONGODB_URI);
});

mongoose.connection.on('error', (err) => {
  console.error('⚠️ Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('🔌 Mongoose disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('🔄 Mongoose reconnected');
});

/**
 * Graceful shutdown: close the Mongoose connection when the Node process ends.
 */
const gracefulShutdown = async () => {
  try {
    await mongoose.connection.close();
    console.log('🛑 Mongoose connection closed due to app termination');
    process.exit(0);
  } catch (err) {
    console.error('Error during Mongoose shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('SIGUSR2', gracefulShutdown); // For nodemon restarts

// Export both the initializer and the raw connection for flexibility.
module.exports = {
  connectDB,
  mongooseConnection: mongoose.connection,
};
