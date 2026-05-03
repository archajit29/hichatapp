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

// Basic health check route at the root path
app.get("/", (req, res) => {
  res.json({
    message: "HiChat Socket.IO Server is running",
    status: "online",
  });
});

// Start server on port 3001
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`HiChat Socket.IO Server running on http://localhost:${PORT}`);
});