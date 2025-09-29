// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// Fichier de base utilisateurs
const USERS_FILE = path.join(__dirname, "users.json");

// Charger les utilisateurs
let users = [];
if (fs.existsSync(USERS_FILE)) {
  users = JSON.parse(fs.readFileSync(USERS_FILE));
}

// 🔐 Route d'inscription
app.post("/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ message: "Champs manquants" });

  const exists = users.find((u) => u.username === username);
  if (exists) return res.status(400).json({ message: "Utilisateur existant" });

  users.push({ username, password });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  res.json({ message: "Inscription réussie" });
});

// 🔑 Route de connexion
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const user = users.find(
    (u) => u.username === username && u.password === password
  );
  if (!user) return res.status(401).json({ message: "Identifiants invalides" });

  res.json({ message: "Connexion réussie" });
});

// 📡 Messagerie Socket.IO
io.on("connection", (socket) => {
  console.log("✅ Utilisateur connecté");

  socket.on("join", (username) => {
    socket.username = username;
    socket.broadcast.emit("system", `${username} a rejoint la discussion`);
  });

  socket.on("message", (data) => {
    io.emit("message", { from: socket.username, text: data.text });
  });

  socket.on("disconnect", () => {
    if (socket.username)
      socket.broadcast.emit("system", `${socket.username} s'est déconnecté`);
  });
});

server.listen(PORT, () => console.log(`🚀 Serveur lancé sur le port ${PORT}`));
