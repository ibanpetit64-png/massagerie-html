// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- Configuration ---
const PORT = 3000;
// ⚠️ IMPORTANT: MODIFIEZ CETTE CHAÎNE AVEC VOTRE VRAIE URL MONGODB
const MONGO_URI = "mongodb://localhost:27017/chatApp"; 

// Permet de servir l'HTML et d'utiliser du JSON
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// --- Modèles MongoDB ---

// Schéma Utilisateur (pour l'authentification sécurisée)
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});
const User = mongoose.model("User", UserSchema);

// Schéma Message (pour l'historique)
const MessageSchema = new mongoose.Schema({
  from: { type: String, required: true },
  to: { type: String, required: true },
  text: { type: String, required: true },
  isGroup: { type: Boolean, default: false }, // Nouveau champ pour les groupes
  timestamp: { type: Date, default: Date.now },
});
const Message = mongoose.model("Message", MessageSchema);

// Schéma Groupe
const GroupSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  members: [{ type: String }], // Liste des noms d'utilisateur
  creator: { type: String, required: true },
});
const Group = mongoose.model("Group", GroupSchema);

// --- Connexion à la Base de Données ---
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("💾 Connecté à MongoDB"))
  .catch((err) => console.error("Erreur de connexion MongoDB:", err));


// --- Stockage en mémoire (utilisateurs connectés uniquement) ---
let onlineUsers = {}; // socket.id -> username

function updateOnlineList() {
  const onlineList = Object.values(onlineUsers);
  // Envoie la liste aux clients, sans doublons
  io.emit("onlineUsers", [...new Set(onlineList)]);
}

// --- Authentification (bcrypt & MongoDB) ---

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

    console.log("👤 Nouvel utilisateur enregistré :", username);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
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
    console.error(err);
    res.status(500).json({ error: "Erreur serveur lors de la connexion" });
  }
});

// --- API de Groupes ---

app.post("/createGroup", async (req, res) => {
    const { groupName, creatorUsername } = req.body;
    
    if (!groupName || !creatorUsername) return res.status(400).json({ error: "Nom du groupe et créateur requis" });

    try {
        if (await Group.findOne({ name: groupName })) {
            return res.status(400).json({ error: "Ce nom de groupe est déjà pris" });
        }
        
        const newGroup = new Group({ 
            name: groupName, 
            creator: creatorUsername,
            members: [creatorUsername]
        });
        await newGroup.save();

        res.json({ success: true, group: newGroup });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur serveur lors de la création du groupe" });
    }
});

app.get("/groups/:username", async (req, res) => {
    try {
        // Récupère uniquement les groupes dont l'utilisateur est membre
        const groups = await Group.find({ members: req.params.username });
        res.json(groups);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur serveur lors de la récupération des groupes" });
    }
});

// --- API de Messages (Historique) ---

app.get("/messages/:user1/:target", async (req, res) => {
    const { user1, target } = req.params;
    
    try {
        const isGroupChat = await Group.findOne({ name: target });
        let messages;

        if (isGroupChat) {
            // Historique de groupe : tous les messages où 'to' est le nom du groupe
             messages = await Message.find({
                to: target,
                isGroup: true
            }).sort({ timestamp: 1 });
        } else {
            // Historique privé : messages entre user1 et target
            messages = await Message.find({
                $or: [
                    { from: user1, to: target, isGroup: false },
                    { from: target, to: user1, isGroup: false },
                ],
            }).sort({ timestamp: 1 });
        }
        
        res.json(messages);
    } catch (err) {
        console.error("Erreur de chargement des messages:", err);
        res.status(500).json({ error: "Erreur serveur" });
    }
});


// --- Gestion des sockets ---

io.on("connection", (socket) => {
  console.log("🟢 Nouveau client connecté :", socket.id);

  // Quand un utilisateur s’enregistre (connexion réussie)
  socket.on("registerUser", async (username) => {
    onlineUsers[socket.id] = username;
    console.log(`✅ ${username} est en ligne`);
    updateOnlineList();
    
    // Jointure des rooms de groupe
    try {
        const groups = await Group.find({ members: username });
        groups.forEach(group => {
            socket.join(group.name); 
            console.log(`[Room] ${username} a rejoint : ${group.name}`);
        });
    } catch (e) {
        console.error("Erreur de jointure des groupes:", e);
    }
  });

  // Réception d’un message
  socket.on("sendMessage", async (msg) => {
    const { from, to, text, isGroup } = msg;

    console.log(`💬 ${from} → ${isGroup ? 'Groupe' : 'Privé'} ${to}: ${text}`);
    
    // 1. Sauvegarde du message dans MongoDB (Historique)
    const newMessage = new Message(msg);
    await newMessage.save();

    // 2. Envoi au(x) destinataire(s)

    if (isGroup) {
        // Envoi à tous les membres du salon (room) SAUF l'émetteur
        // Note: io.to(to) envoie à tout le monde dans la room, y compris l'émetteur.
        // C'est acceptable car le client gère l'affichage.
        io.to(to).emit("receiveMessage", msg);
    } else {
        // Messagerie Privée Optimisée
        const recipientSocketId = Object.keys(onlineUsers).find(
            (id) => onlineUsers[id] === to
        );

        // Envoi au destinataire (si en ligne)
        if (recipientSocketId) {
            io.to(recipientSocketId).emit("receiveMessage", msg);
        }
        
        // Envoi à l'émetteur pour confirmation/affichage immédiat
        socket.emit("receiveMessage", msg);
    }
  });

  // Déconnexion
  socket.on("disconnect", () => {
    const username = onlineUsers[socket.id];
    delete onlineUsers[socket.id];
    if (username) {
        console.log(`❌ ${username} s'est déconnecté`);
        updateOnlineList();
    }
  });
});

// Démarrage du serveur
server.listen(PORT, () => {
  console.log(`🚀 Serveur en cours d'exécution sur http://localhost:${PORT}`);
});
