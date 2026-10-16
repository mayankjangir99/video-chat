const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.ALLOWED_ORIGIN || false }
});

const PORT = process.env.PORT || 3000;
const MAX_ROOM_SIZE = Number(process.env.MAX_ROOM_SIZE || 6);
const MAX_MESSAGE_LENGTH = 500;

app.disable("x-powered-by");
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders(res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(self)");
  }
}));

app.get("/health", (_req, res) => res.json({ ok: true }));

function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.replace(/[<>]/g, "").trim().slice(0, maxLength);
}

function getRoomSize(roomId) {
  return io.sockets.adapter.rooms.get(roomId)?.size || 0;
}

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, name } = {}, callback = () => {}) => {
    roomId = cleanText(roomId, 80);
    name = cleanText(name, 32) || "Guest";

    if (!/^[a-zA-Z0-9_-]{4,80}$/.test(roomId)) {
      return callback({ ok: false, error: "Invalid room link." });
    }

    const existing = getRoomSize(roomId);
    if (existing >= MAX_ROOM_SIZE) {
      return callback({ ok: false, error: `This room is full (maximum ${MAX_ROOM_SIZE} people).` });
    }

    socket.data.roomId = roomId;
    socket.data.name = name;
    socket.join(roomId);

    const peers = [...(io.sockets.adapter.rooms.get(roomId) || [])]
      .filter((id) => id !== socket.id)
      .map((id) => ({ id, name: io.sockets.sockets.get(id)?.data?.name || "Guest" }));

    callback({ ok: true, selfId: socket.id, peers, maxRoomSize: MAX_ROOM_SIZE });
    socket.to(roomId).emit("peer-joined", { id: socket.id, name });
    io.to(roomId).emit("room-count", getRoomSize(roomId));
  });

  socket.on("webrtc-offer", ({ to, offer } = {}) => {
    if (socket.data.roomId && typeof to === "string" && offer) {
      const target = io.sockets.sockets.get(to);
      if (target?.data?.roomId === socket.data.roomId) {
        io.to(to).emit("webrtc-offer", { from: socket.id, offer });
      }
    }
  });

  socket.on("webrtc-answer", ({ to, answer } = {}) => {
    if (socket.data.roomId && typeof to === "string" && answer) {
      const target = io.sockets.sockets.get(to);
      if (target?.data?.roomId === socket.data.roomId) {
        io.to(to).emit("webrtc-answer", { from: socket.id, answer });
      }
    }
  });

  socket.on("webrtc-ice-candidate", ({ to, candidate } = {}) => {
    if (socket.data.roomId && typeof to === "string" && candidate) {
      const target = io.sockets.sockets.get(to);
      if (target?.data?.roomId === socket.data.roomId) {
        io.to(to).emit("webrtc-ice-candidate", { from: socket.id, candidate });
      }
    }
  });

  socket.on("chat-message", ({ text } = {}) => {
    const message = cleanText(text, MAX_MESSAGE_LENGTH);
    const roomId = socket.data.roomId;
    if (!roomId || !message) return;
    io.to(roomId).emit("chat-message", {
      id: socket.id,
      name: socket.data.name || "Guest",
      text: message,
      time: new Date().toISOString()
    });
  });

  socket.on("leave-room", () => leaveRoom(socket));

  socket.on("disconnect", () => leaveRoom(socket));
});

function leaveRoom(socket) {
  const roomId = socket.data.roomId;
  if (!roomId) return;
  socket.to(roomId).emit("peer-left", { id: socket.id });
  socket.leave(roomId);
  socket.data.roomId = null;
  io.to(roomId).emit("room-count", getRoomSize(roomId));
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Friends Video Chat running on http://localhost:${PORT}`);
});
