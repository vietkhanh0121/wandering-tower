import http from "node:http";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "socket.io";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = resolve(__dirname, "dist");
const INDEX_HTML = resolve(DIST_DIR, "index.html");
const PORT = Number(process.env.PORT || process.env.SOCKET_PORT || 3001);
const HOST = process.env.HOST || "0.0.0.0";
const PLAYER_LEAVE_GRACE_MS = 10_000;
const rooms = new Map();

const app = express();
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

if (existsSync(INDEX_HTML)) {
  app.use(express.static(DIST_DIR));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/socket.io")) {
      next();
      return;
    }
    res.sendFile(INDEX_HTML);
  });
} else {
  app.get("/", (_req, res) => {
    res
      .status(200)
      .send("Wandering Tower Socket.IO server is running. Run `npm run build` to serve the game from this process.");
  });
}

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: true,
    credentials: true
  }
});

function makeRoomCode() {
  let code = "";
  do {
    code = Array.from({ length: 4 }, () => String(Math.floor(Math.random() * 10))).join("");
  } while (rooms.has(code));
  return code;
}

function publicRoom(room) {
  return {
    code: room.code,
    players: room.players.map(({ leaveTimer, ...player }) => player),
    game: room.game,
    playerCount: room.playerCount,
    hostId: room.hostId,
    lastActorId: room.lastActorId ?? null,
    lastEvent: room.lastEvent ?? null
  };
}

function emitRoom(room) {
  io.to(room.code).emit("room-state", publicRoom(room));
}

function clearLeaveTimer(player) {
  if (!player?.leaveTimer) return;
  clearTimeout(player.leaveTimer);
  player.leaveTimer = null;
}

function markPlayerTimedOut(room, playerId) {
  const latest = rooms.get(room.code);
  if (!latest) return;
  const player = latest.players.find((item) => item.id === playerId);
  if (!player || player.connected || player.bot) return;
  player.timedOut = true;
  player.leaveTimer = null;
  emitRoom(latest);
}

function connectedPlayers(room) {
  return room.players.filter((item) => item.connected && !item.bot);
}

function releaseSocketFromRoom(socket) {
  const room = rooms.get(socket.data.roomCode);
  if (!room) return;
  const wasHost = room.hostId === socket.id;
  const player = room.players.find((item) => item.socketId === socket.id);
  if (player) {
    player.connected = false;
    player.disconnectedAt = Date.now();
    player.timedOut = false;
    clearLeaveTimer(player);
    player.leaveTimer = setTimeout(() => markPlayerTimedOut(room, player.id), PLAYER_LEAVE_GRACE_MS);
  }
  socket.leave(room.code);
  socket.data.roomCode = null;
  socket.data.playerId = null;

  const nextHost = connectedPlayers(room)[0];
  if (!nextHost) {
    room.players.forEach(clearLeaveTimer);
    rooms.delete(room.code);
    return;
  }
  if (wasHost) room.hostId = nextHost.socketId;
  emitRoom(room);
}

io.on("connection", (socket) => {
  socket.on("create-room", ({ playerCount = 2 } = {}, reply) => {
    const count = Math.max(2, Math.min(3, Number(playerCount) || 2));
    const room = {
      code: makeRoomCode(),
      playerCount: count,
      hostId: socket.id,
      players: [{ id: "p1", socketId: socket.id, connected: true, bot: false, timedOut: false }],
      game: null
    };
    rooms.set(room.code, room);
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.playerId = "p1";
    reply?.({ ok: true, playerId: "p1", room: publicRoom(room) });
    emitRoom(room);
  });

  socket.on("join-room", ({ roomCode } = {}, reply) => {
    const code = String(roomCode || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      reply?.({ ok: false, message: "Không tìm thấy phòng." });
      return;
    }
    let player = room.players.find((item) => item.socketId === socket.id);
    if (!player) {
      player = room.players.find((item) => !item.connected);
      if (player) {
        clearLeaveTimer(player);
        player.socketId = socket.id;
        player.connected = true;
        player.bot = false;
        player.timedOut = false;
        player.disconnectedAt = null;
      } else if (room.players.length < room.playerCount) {
        player = { id: `p${room.players.length + 1}`, socketId: socket.id, connected: true, bot: false, timedOut: false };
        room.players.push(player);
      }
    }
    if (!player) {
      reply?.({ ok: false, message: "Phòng đã đầy." });
      return;
    }
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.playerId = player.id;
    reply?.({ ok: true, playerId: player.id, room: publicRoom(room) });
    emitRoom(room);
  });

  socket.on("start-game", ({ roomCode, game, playerCount } = {}, reply) => {
    const room = rooms.get(String(roomCode || "").trim().toUpperCase());
    if (!room || room.hostId !== socket.id) {
      reply?.({ ok: false });
      return;
    }
    room.playerCount = Math.max(2, Math.min(3, Number(playerCount) || room.playerCount || 2));
    room.game = game;
    room.lastActorId = socket.data.playerId;
    room.lastEvent = "start-game";
    reply?.({ ok: true });
    emitRoom(room);
  });

  socket.on("update-game", ({ roomCode, playerId, game } = {}, reply) => {
    const room = rooms.get(String(roomCode || "").trim().toUpperCase());
    const isBotUpdateByHost = room?.hostId === socket.id && room.players.some((item) => item.id === playerId && item.bot);
    if (!room || (socket.data.playerId !== playerId && !isBotUpdateByHost)) {
      reply?.({ ok: false, message: "Không thể đồng bộ lượt: người chơi không hợp lệ." });
      return;
    }
    const activeId = room.game?.turnOrder?.[room.game.currentPlayerIndex];
    if (activeId && activeId !== playerId) {
      reply?.({ ok: false, message: "Không thể đồng bộ lượt: lượt trên server đã thay đổi.", activeId });
      return;
    }
    room.game = game;
    room.lastActorId = playerId;
    room.lastEvent = "update-game";
    reply?.({ ok: true });
    emitRoom(room);
  });

  socket.on("dice-roll", ({ roomCode, playerId, roll } = {}) => {
    const room = rooms.get(String(roomCode || "").trim().toUpperCase());
    if (!room || socket.data.playerId !== playerId) return;
    socket.to(room.code).emit("dice-roll", { playerId, roll });
  });

  socket.on("remote-action", ({ roomCode, playerId, action } = {}) => {
    const room = rooms.get(String(roomCode || "").trim().toUpperCase());
    if (!room || socket.data.playerId !== playerId || !action) return;
    socket.to(room.code).emit("remote-action", { playerId, action });
  });

  socket.on("reset-game", ({ roomCode, game } = {}, reply) => {
    const room = rooms.get(String(roomCode || "").trim().toUpperCase());
    if (!room || room.hostId !== socket.id) {
      reply?.({ ok: false });
      return;
    }
    room.game = game;
    room.lastActorId = socket.data.playerId;
    room.lastEvent = "reset-game";
    reply?.({ ok: true });
    emitRoom(room);
  });

  socket.on("continue-with-bots", ({ roomCode } = {}, reply) => {
    const room = rooms.get(String(roomCode || "").trim().toUpperCase());
    if (!room || room.hostId !== socket.id) {
      reply?.({ ok: false });
      return;
    }
    room.players.forEach((player) => {
      if (player.connected) return;
      clearLeaveTimer(player);
      player.bot = true;
      player.timedOut = false;
      player.disconnectedAt = null;
    });
    reply?.({ ok: true });
    emitRoom(room);
  });

  socket.on("leave-room", (_payload, reply) => {
    releaseSocketFromRoom(socket);
    reply?.({ ok: true });
  });

  socket.on("disconnect", () => releaseSocketFromRoom(socket));
});

httpServer.listen(PORT, HOST, () => {
  console.log(`Wandering Tower server listening on http://${HOST}:${PORT}`);
});
