import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import fs from "fs";
import bodyParser from "body-parser";
import path from "path";

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(bodyParser.json());
app.use(express.static("."));

const usersPath = "./users.json";

if (!fs.existsSync(usersPath)) fs.writeFileSync(usersPath, "[]");

// INSCRIPTION
app.post("/api/register", (req, res) => {
  let users = JSON.parse(fs.readFileSync(usersPath));
  let { username, password } = req.body;

  if (users.find(u => u.username === username)) {
    return res.status(400).json({ message: "Utilisateur déjà existant" });
  }

  users.push({ username, password });
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));

  res.json({ message: "Compte créé !" });
});

// CONNEXION
app.post("/api/login", (req, res) => {
  let users = JSON.parse(fs.readFileSync(usersPath));
  let { username, password } = req.body;

  let user = users.find(u => u.username === username && u.password === password);

  if (!user) return res.status(401).json({ message: "Identifiants incorrects" });

  res.json({ message: "Connexion réussie" });
});

// SOCKET.IO
io.on("connection", socket => {
  socket.on("sendMessage", msg => {
    io.emit("receiveMessage", msg);
  });
});

server.listen(3000, () => console.log("Serveur lancé sur http://localhost:3000"));

