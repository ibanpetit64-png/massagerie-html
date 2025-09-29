// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const app = express();
const server = http.createServer(app);

// 🚨 CHANGEMENT CRITIQUE 1 : Le serveur doit écouter le port fourni par Render (process.env.PORT)
const PORT = process.env.PORT || 3000; 

// 🚨 CHANGEMENT CRITIQUE 2 : La chaîne de connexion doit venir des variables d'environnement
// L'URI locale est conservée pour le développement local si la variable n'existe pas.
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/chatApp"; 

// Configuration Socket.IO
const io = new Server(server, { 
    cors: { 
        origin: "*", // Permet toute origine (simplifie le déploiement)
        methods: ["GET", "POST"]
    } 
});

// Permet de servir l'HTML et d'utiliser du JSON
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// --- Modèles MongoDB (inchangés) ---
// ... (UserSchema, MessageSchema, GroupSchema) ... 
// Nous conservons les schémas tels quels pour la cohérence.

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});
const User = mongoose.model("User", UserSchema);

const MessageSchema = new mongoose.Schema({
  from: { type: String, required: true },
  to: { type: String, required: true },
  text: { type: String, required: true },
  isGroup: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now },
});
const Message = mongoose.model("Message", MessageSchema);

const GroupSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  members: [{ type: String }],
  creator: { type: String, required: true },
});
const Group = mongoose.model("Group", GroupSchema);

// --- Connexion à la Base de Données ---
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("💾 Connecté à MongoDB"))
  .catch((err) => console.error("Erreur de connexion MongoDB:", err));

// --- Stockage en mémoire et fonctions (inchangés) ---
let onlineUsers = {};

function updateOnlineList() {
  const onlineList = Object.values(onlineUsers);
  io.emit("onlineUsers", [...new Set(onlineList)]);
}

// --- Routes d'Authentification (inchangées) ---
app.post("/signup", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Champs requis manquants" });
  try {
    if (await User.findOne({ username })) {
      return res.status(400).json({ error: "Nom d'utilisateur déjà pris" });
    }
    const hashedPassword = await bcrypt.hash(password, 10); 
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur lors de l'inscription" });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Champs requis manquants" });
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: "Identifiants invalides" });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Identifiants invalides" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur lors de la connexion" });
  }
});

// --- API de Groupes et Messages (inchangées) ---
app.post("/createGroup", async (req, res) => {
    const { groupName, creatorUsername } = req.body;
    if (!groupName || !creatorUsername) return res.status(400).json({ error: "Champs requis manquants" });
    try {
        if (await Group.findOne({ name: groupName })) {
            return res.status(400).json({ error: "Ce nom de groupe est déjà pris" });
        }
        const newGroup = new Group({ name: groupName, creator: creatorUsername, members: [creatorUsername] });
        await newGroup.save();
        res.json({ success: true, group: newGroup });
    } catch (err) {
        res.status(500).json({ error: "Erreur serveur lors de la création du groupe" });
    }
});

app.get("/groups/:username", async (req, res) => {
    try {
        const groups = await Group.find({ members: req.params.username });
        res.json(groups);
    } catch (err) {
        res.status(500).json({ error: "Erreur serveur" });
    }
});

app.get("/messages/:user1/:target", async (req, res) => {
    const { user1, target } = req.params;
    try {
        const isGroupChat = await Group.findOne({ name: target });
        let messages;

        if (isGroupChat) {
             messages = await Message.find({ to: target, isGroup: true }).sort({ timestamp: 1 });
        } else {
            messages = await Message.find({
                $or: [
                    { from: user1, to: target, isGroup: false },
                    { from: target, to: user1, isGroup: false },
                ],
            }).sort({ timestamp: 1 });
        }
        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: "Erreur de chargement des messages" });
    }
});

// --- Gestion des sockets (inchangée) ---
io.on("connection", (socket) => {
  socket.on("registerUser", async (username) => {
    onlineUsers[socket.id] = username;
    updateOnlineList();
    
    try {
        const groups = await Group.find({ members: username });
        groups.forEach(group => {
            socket.join(group.name); 
        });
    } catch (e) {
        console.error("Erreur de jointure des groupes:", e);
    }
  });

  socket.on("sendMessage", async (msg) => {
    const { from, to, text, isGroup } = msg;
    const newMessage = new Message(msg);
    await newMessage.save();

    if (isGroup) {
        io.to(to).emit("receiveMessage", msg);
    } else {
        const recipientSocketId = Object.keys(onlineUsers).find(
            (id) => onlineUsers[id] === to
        );

        if (recipientSocketId) {
            io.to(recipientSocketId).emit("receiveMessage", msg);
        }
        socket.emit("receiveMessage", msg);
    }
  });

  socket.on("disconnect", () => {
    const username = onlineUsers[socket.id];
    delete onlineUsers[socket.id];
    if (username) {
        updateOnlineList();
    }
  });
});

// Démarrage du serveur sur le PORT dynamique
server.listen(PORT, () => {
  console.log(`🚀 Serveur en cours d'exécution sur le port ${PORT}`);
});
