// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = 3000;

app.use(express.static(path.join(__dirname)));

// Stockage des utilisateurs
let users = new Map(); // socket.id -> username

io.on("connection", (socket) => {
  console.log("🟢 Nouveau client :", socket.id);

  // Quand l’utilisateur s’identifie
  socket.on("register", (username) => {
    users.set(socket.id, username);
    console.log(`👤 ${username} connecté`);
    sendUserList();
  });

  // Quand un message est envoyé
  socket.on("sendMessage", (msg) => {
    const targetSocket = [...users.entries()].find(([id, name]) => name === msg.to);
    if (targetSocket) {
      io.to(targetSocket[0]).emit("receiveMessage", msg);
    }
    // Le sender reçoit aussi son message
    socket.emit("receiveMessage", msg);
  });

  // Quand un utilisateur quitte
  socket.on("disconnect", () => {
    const username = users.get(socket.id);
    users.delete(socket.id);
    console.log(`🔴 ${username} déconnecté`);
    sendUserList();
  });

  function sendUserList() {
    const list = Array.from(users.values());
    io.emit("contacts", list);
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`);
});
