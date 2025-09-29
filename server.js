// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");
const bodyParser = require("body-parser");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// Fichier pour stocker les utilisateurs
const usersFile = path.join(__dirname, "users.json");
if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, JSON.stringify([]));

// ✅ Routes Auth
app.post("/api/register", (req, res) => {
  const { username, password } = req.body;
  const users = JSON.parse(fs.readFileSync(usersFile));
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ message: "Ce nom d'utilisateur existe déjà" });
  }
  users.push({ username, password });
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  res.json({ message: "Inscription réussie" });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const users = JSON.parse(fs.readFileSync(usersFile));
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ message: "Identifiants incorrects" });
  res.json({ message: "Connexion réussie" });
});

// 🔗 Socket.IO pour la messagerie
let onlineUsers = new Map(); // socket.id -> username

io.on("connection", socket => {
  console.log("Nouvel utilisateur connecté", socket.id);

  socket.on("registerSocket", username => {
    onlineUsers.set(socket.id, username);
    updateContactList();
  });

  socket.on("sendMessage", msg => {
    // Envoyer au destinataire seulement
    const targetSocket = [...onlineUsers.entries()].find(([id, name]) => name === msg.to);
    if (targetSocket) io.to(targetSocket[0]).emit("receiveMessage", msg);
    // Envoyer aussi à l'envoyeur
    socket.emit("receiveMessage", msg);
  });

  socket.on("disconnect", () => {
    onlineUsers.delete(socket.id);
    updateContactList();
  });

  function updateContactList() {
    const list = Array.from(onlineUsers.values());
    io.emit("contacts", list);
  }
});

server.listen(PORT, () => console.log(`Serve
