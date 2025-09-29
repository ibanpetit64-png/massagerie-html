// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Permet de servir ton HTML et fichiers statiques
app.use(express.static(path.join(__dirname)));
app.use(express.json());

const PORT = 3000;

// 🧾 Stockage en mémoire (remplace une vraie base de données)
let users = [];      // { username, password }
let onlineUsers = {}; // socket.id -> username

// 🧍 Authentification
app.post("/signup", (req, res) => {
  const { username, password } = req.body;
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: "Nom d'utilisateur déjà pris" });
  }
  users.push({ username, password });
  console.log("👤 Nouvel utilisateur :", username);
  res.json({ success: true });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: "Identifiants invalides" });
  res.json({ success: true });
});

// 💬 Gestion des sockets
io.on("connection", (socket) => {
  console.log("🟢 Nouveau client connecté :", socket.id);

  // Quand un utilisateur s’enregistre
  socket.on("registerUser", (username) => {
    onlineUsers[socket.id] = username;
    console.log(`✅ ${username} est en ligne`);
    updateOnlineList();
  });

  // Réception d’un message
  socket.on("sendMessage", (msg) => {
    console.log(`💬 ${msg.from} → ${msg.to}: ${msg.text}`);
    io.emit("receiveMessage", msg);
  });

  // Déconnexion
  socket.on("disconnect", () => {
    const username = onlineUsers[socket.id];
    console.log(`🔴 ${username || "?"} s'est déconnecté`);
    delete onlineUsers[socket.id];
    updateOnlineList();
  });

  // Met à jour la liste des utilisateurs connectés
  function updateOnlineList() {
    io.emit("onlineUsers", Object.values(onlineUsers));
  }
});

server.listen(PORT, () => console.log(`🚀 Serveur sur http://localhost:${PORT}`));
