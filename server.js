const express = require("express");
const fs = require("fs-extra");
const bcrypt = require("bcrypt");
const session = require("express-session");
const bodyParser = require("body-parser");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Middlewares
app.use(express.static(__dirname));
app.use(bodyParser.json());
app.use(
  session({
    secret: "super_secret_key",
    resave: false,
    saveUninitialized: true,
  })
);

// Charger la base utilisateur
const USERS_FILE = "./users.json";
if (!fs.existsSync(USERS_FILE)) fs.writeJsonSync(USERS_FILE, []);

// --- ROUTES AUTH ---
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ message: "Champs manquants" });

  const users = await fs.readJson(USERS_FILE);
  if (users.find((u) => u.username === username))
    return res.status(400).json({ message: "Utilisateur déjà existant" });

  const hashed = await bcrypt.hash(password, 10);
  users.push({ username, password: hashed });
  await fs.writeJson(USERS_FILE, users);
  res.json({ message: "Compte créé avec succès" });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const users = await fs.readJson(USERS_FILE);
  const user = users.find((u) => u.username === username);
  if (!user) return res.status(400).json({ message: "Utilisateur inconnu" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).json({ message: "Mot de passe incorrect" });

  req.session.user = username;
  res.json({ message: "Connexion réussie", username });
});

io.on("connection", (socket) => {
  console.log("🟢 Un utilisateur est connecté");

  socket.on("sendMessage", (data) => {
    io.emit("receiveMessage", data);
  });

  socket.on("disconnect", () => {
    console.log("🔴 Utilisateur déconnecté");
  });
});

server.listen(PORT, () =>
  console.log(`✅ Serveur en ligne sur http://localhost:${PORT}`)
);
