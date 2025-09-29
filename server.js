// server.js
import express from "express";
import { Server } from "socket.io";
import { createServer } from "http";
import fs from "fs";
import path from "path";
import bodyParser from "body-parser";
import cors from "cors";

const app = express();
const server = createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("."));

// Charger les utilisateurs
const usersFile = path.join(process.cwd(), "users.json");
if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, JSON.stringify([]));

// 🔐 Route inscription
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

// 🔐 Route connexion
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const users = JSON.parse(fs.readFileSync(usersFile));

  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ message: "Identifiants incorrects" });

  res.json({ message: "Connexion réussie" });
});

// 🔄 Gestion des messages Socket.IO
io.on("connection", (socket) => {
  console.log("Un utilisateur connecté");

  socket.on("sendMessage", (data) => {
    io.emit("receiveMessage", data);
  });

  socket.on("disconnect", () => console.log("Utilisateur déconnecté"));
});

// 🚀 Lancement du serveur
server.listen(PORT, () => console.log(`Serveur en ligne sur le port ${PORT}`));
