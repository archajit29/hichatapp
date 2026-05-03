const mongoose = require('mongoose');

// Use the connection string we got from MongoDB Atlas
const dbURI = 'mongodb+srv://dasarchajit_db_user:2thxlLAlO2h43EC@cluster0.bvl1n6l.mongodb.net/hichat?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(dbURI)
  .then(() => console.log("✅ Successfully connected to MongoDB Atlas (Cloud)"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// Define what a "User" looks like (The Schema)
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true }, // This will be hashed!
  publicKey: String,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const server = http.createServer(app);

// Socket.IO
const io = new Server(server, {
  cors: { origin: "*" },
});

const users = {}; // { socketId: { username, publicKey } }

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join", (data) => {
    users[socket.id] = { username: data.username, publicKey: data.publicKey };
    console.log(`${data.username} joined with public key`);
    // Broadcast to others that a new user joined
    socket.broadcast.emit("user_joined", { 
      username: data.username, 
      publicKey: data.publicKey,
      socketId: socket.id 
    });
    // Send existing users to the new user
    socket.emit("existing_users", Object.keys(users)
      .filter(id => id !== socket.id)
      .map(id => ({ ...users[id], socketId: id }))
    );
  });

  socket.on("send_message", (data) => {
    console.log("Encrypted message relaying...");
    io.emit("receive_message", data);
  });

  socket.on("disconnect", () => {
    const user = users[socket.id];
    if (user) {
      console.log(`${user.username} disconnected`);
      delete users[socket.id];
      io.emit("user_left", { username: user.username, socketId: socket.id });
    }
  });
});

// Health check
app.get("/healthz", (req, res) => {
  res.status(200).send("OK");
});
// This tells Express where the socket.io client file is
const path = require('path');
app.get('/socket.io/socket.io.js', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'node_modules/socket.io/client-dist/socket.io.js'));
});

// Root route
app.get("/", (req, res) => {
  res.json({
    message: "HiChat Server is running",
    status: "online",
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`HiChat Server running on http://localhost:${PORT}`);
});