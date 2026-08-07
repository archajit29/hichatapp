/**
 * Database connection module for the HiChat server.
 *
 * This file sets up a robust MongoDB connection using Mongoose and defines the core
 * data models (User, Message, Room) that power a premium, WhatsApp‑like messaging
 * experience. It also provides a few handy utility functions for common DB
 * operations.
 *
 * Features:
 *   - Production‑ready connection options (new URL parser, unified topology, timeouts, etc.).
 *   - Event listeners that log connection lifecycle events (connected, error, disconnected, reconnected).
 *   - Graceful shutdown handling to close the connection when the process exits.
 *   - Mongoose schemas & models for users, messages, and chat rooms.
 *   - Simple helper functions (find/create user, save message, fetch chat history).
 *   - Exported `connectDB` function for initializing the connection.
 *   - Exported `mongooseConnection` for direct access to the underlying Mongoose connection if needed.
 */

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./hichat.db');

// Connection options that work well for a high‑throughput, WhatsApp‑like messaging service.
// No need for connection options with SQLite

/**
 * Initialize the MongoDB connection.
 *
 * This function should be called once during server startup.
 */
const connectDB = async () => {
  try {
    db.serialize(function() {
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          public_key TEXT,
          avatar_url TEXT,
          status TEXT DEFAULT 'online'
        );
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          room_id TEXT NOT NULL,
          author TEXT NOT NULL,
          content TEXT,
          payloads TEXT NOT NULL,
          is_deleted INTEGER DEFAULT 0
        );
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS rooms (
          id TEXT PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          participants TEXT
        );
      `);
    });
    console.log('✅ SQLite database connected and initialized');
  } catch (err) {
    console.error('❌ SQLite connection error:', err);
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

/* -------------------------------------------------------------------------- */
/*                               MONGOOSE MODELS                              */
/* -------------------------------------------------------------------------- */

const { Schema, model, Types } = mongoose;

/**
 * User schema – mirrors the `UserRecord` interface used in the auth service.
 */
const UserSchema = new Schema(
  {
    // Using a string ID (UUID) is common in the existing code, but we also keep the default ObjectId.
    _id: { type: String, default: () => new Types.ObjectId().toString() },
    username: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, index: true },
    password_hash: { type: String, required: true },
    public_key: { type: String, default: null },
    avatar_url: { type: String, default: null },
    status: {
      type: String,
      enum: ['online', 'away', 'dnd', 'offline'],
      default: 'online',
    },
    created_at: { type: Date, default: Date.now },
  },
  { collection: 'users', timestamps: { createdAt: 'created_at', updatedAt: false } }
);

/**
 * Message schema – stores encrypted payloads per recipient.
 * `payloads` is a mixed object where each key is a recipient identifier (userId or socketId)
 * and the value is the encrypted ciphertext + IV.
 */
const MessageSchema = new Schema(
  {
    roomId: { type: String, required: true, index: true },
    author: { type: String, ref: 'User', required: true },
    // Plaintext is never stored; `content` is optional for server‑side debugging only.
    content: { type: String, default: '' },
    payloads: { type: Schema.Types.Mixed, required: true }, // { recipientId: { ciphertext, iv } }
    isDeleted: { type: Boolean, default: false },
  },
  { collection: 'messages', timestamps: true }
);

/**
 * Room schema – represents a chat room (e.g., "general", private groups).
 */
const RoomSchema = new Schema(
  {
    _id: { type: String, default: () => new Types.ObjectId().toString() },
    name: { type: String, required: true, unique: true },
    participants: [{ type: String, ref: 'User' }], // array of user IDs
    // Optional metadata (e.g., room avatar, description) can be added later.
  },
  { collection: 'rooms', timestamps: true }
);

// Compile models
const User = model('User', UserSchema);
const Message = model('Message', MessageSchema);
const Room = model('Room', RoomSchema);

/* -------------------------------------------------------------------------- */
/*                         DATABASE HELPER FUNCTIONS                           */
/* -------------------------------------------------------------------------- */

/**
 * Find a user by username.
 * @param {string} username
 * @returns {Promise<User|null>}
 */
async function findUserByUsername(username) {
  return User.findOne({ username }).exec();
}

/**
 * Find a user by ID.
 * @param {string} id
 * @returns {Promise<User|null>}
 */
async function findUserById(id) {
  return User.findById(id).exec();
}

/**
 * Create a new user record.
 * @param {Object} userData - Must contain username, email, password_hash.
 * @returns {Promise<User>}
 */
async function createUser(userData) {
  const user = new User(userData);
  return user.save();
}

/**
 * Save a new encrypted message.
 * @param {Object} msgData - Must contain roomId, author, payloads.
 * @returns {Promise<Message>}
 */
async function saveMessage(msgData) {
  const message = new Message(msgData);
  return message.save();
}

/**
 * Retrieve paginated chat history for a room.
 * @param {string} roomId
 * @param {number} limit - Number of messages to return (default 50).
 * @param {string} [beforeMessageId] - If provided, fetch messages older than this ID.
 * @returns {Promise<Message[]>}
 */
async function getMessagesByRoom(roomId, limit = 50, beforeMessageId) {
  const query = { roomId };
  if (beforeMessageId) {
    const beforeMsg = await Message.findById(beforeMessageId).select('createdAt').exec();
    if (beforeMsg) {
      query.createdAt = { $lt: beforeMsg.createdAt };
    }
  }
  return Message.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()
    .exec();
}

/**
 * Soft‑delete a message (sets `isDeleted` flag). Returns the updated document.
 * @param {string} messageId
 * @returns {Promise<Message|null>}
 */
async function softDeleteMessage(messageId) {
  return Message.findByIdAndUpdate(
    messageId,
    { isDeleted: true },
    { new: true }
  ).exec();
}

/* -------------------------------------------------------------------------- */
/*                               EXPORTS                                      */
/* -------------------------------------------------------------------------- */

module.exports = {
  // Connection utilities
  connectDB,
  mongooseConnection: mongoose.connection,

  // Models
  User,
  Message,
  Room,

  // Helper functions
  findUserByUsername,
  findUserById,
  createUser,
  saveMessage,
  getMessagesByRoom,
  softDeleteMessage,
};
