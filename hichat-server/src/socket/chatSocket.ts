import { Server, Socket } from "socket.io";
import { db } from "../db/db";

interface ActiveUser {
  userId?: string;
  username: string;
  publicKey: string;
  socketId: string;
  currentRoom: string;
  status: "online" | "away" | "dnd" | "offline";
  customStatus?: string;
}

const activeSockets = new Map<string, ActiveUser>();

export function setupSocket(io: Server) {
  io.on("connection", (socket: Socket) => {
    console.log(`🔌 Enterprise socket connected: ${socket.id}`);

    // User Session Initialization
    socket.on("join", (data: { userId?: string; username: string; publicKey: string; room?: string; status?: string }) => {
      const room = data.room || "general";
      const status = (data.status as any) || "online";

      activeSockets.set(socket.id, {
        userId: data.userId,
        username: data.username,
        publicKey: data.publicKey,
        socketId: socket.id,
        currentRoom: room,
        status: status,
      });

      socket.join(room);

      console.log(`👤 ${data.username} connected (${socket.id}) -> room [${room}]`);

      // Notify others in room
      socket.to(room).emit("user_joined", {
        userId: data.userId,
        username: data.username,
        publicKey: data.publicKey,
        socketId: socket.id,
        status: status,
        room: room,
      });

      // Send active users list
      const activeList = Array.from(activeSockets.values());
      socket.emit("existing_users", activeList);
      io.emit("presence_update", activeList);
    });

    // Room Switch Handler
    socket.on("switch_room", (newRoom: string) => {
      const user = activeSockets.get(socket.id);
      if (user) {
        socket.leave(user.currentRoom);
        user.currentRoom = newRoom;
        socket.join(newRoom);

        const roomUsers = Array.from(activeSockets.values()).filter(u => u.currentRoom === newRoom);
        socket.emit("existing_users", roomUsers);

        socket.to(newRoom).emit("user_joined", {
          userId: user.userId,
          username: user.username,
          publicKey: user.publicKey,
          socketId: socket.id,
          status: user.status,
          room: newRoom,
        });
      }
    });

    // Presence Status Update (Online, Away, DND)
    socket.on("update_status", (status: "online" | "away" | "dnd" | "offline") => {
      const user = activeSockets.get(socket.id);
      if (user) {
        user.status = status;
        io.emit("presence_update", Array.from(activeSockets.values()));
      }
    });

    // Send Encrypted Message Payload
    socket.on("send_message", (data: {
      roomId: string;
      senderId?: string;
      author: string;
      payloads: Record<string, string>;
      mediaUrl?: string;
      fileName?: string;
      fileSize?: number;
      time?: string;
    }) => {
      const msgId = "msg_" + Math.random().toString(36).substring(2, 12);
      const roomId = data.roomId || "general";
      const timeStr = data.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Persist to SQLite
      try {
        const stmt = db.prepare(`
          INSERT INTO messages (id, room_id, sender_id, sender_username, payloads, media_url, file_name, file_size)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
          msgId,
          roomId,
          data.senderId || "anon",
          data.author,
          JSON.stringify(data.payloads),
          data.mediaUrl || null,
          data.fileName || null,
          data.fileSize || null
        );
      } catch (err) {
        console.error("SQLite message insertion error:", err);
      }

      const messageBroadcast = {
        id: msgId,
        roomId: roomId,
        senderId: data.senderId,
        author: data.author,
        payloads: data.payloads,
        mediaUrl: data.mediaUrl,
        fileName: data.fileName,
        fileSize: data.fileSize,
        time: timeStr,
        isDeleted: false,
      };

      io.to(roomId).emit("receive_message", messageBroadcast);
    });

    // Message Deletion
    socket.on("delete_message", (data: { messageId: string; roomId: string }) => {
      try {
        const stmt = db.prepare("UPDATE messages SET is_deleted = 1 WHERE id = ?");
        stmt.run(data.messageId);
        io.to(data.roomId).emit("message_deleted", { messageId: data.messageId });
      } catch (err) {
        console.error("Failed deleting message:", err);
      }
    });

    // Typing Indicators
    socket.on("typing_start", (data: { username: string; roomId: string }) => {
      socket.to(data.roomId).emit("user_typing", { username: data.username, roomId: data.roomId, isTyping: true });
    });

    socket.on("typing_stop", (data: { username: string; roomId: string }) => {
      socket.to(data.roomId).emit("user_typing", { username: data.username, roomId: data.roomId, isTyping: false });
    });

    // Reactions
    socket.on("add_reaction", (data: { messageId: string; emoji: string; username: string; roomId: string }) => {
      io.to(data.roomId).emit("message_reaction", data);
    });

    // Disconnect
    socket.on("disconnect", () => {
      const user = activeSockets.get(socket.id);
      if (user) {
        activeSockets.delete(socket.id);
        io.to(user.currentRoom).emit("user_left", {
          username: user.username,
          socketId: socket.id,
          userId: user.userId,
        });
        io.emit("presence_update", Array.from(activeSockets.values()));
      }
    });
  });
}
