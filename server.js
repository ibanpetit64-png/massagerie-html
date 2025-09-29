// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const mongoose = require("mongoose"); // 🔒 Nouveau : Pour MongoDB
const bcrypt = require("bcrypt");   // 🔒 Nouveau : Pour le hachage des mots de passe

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- Configuration ---
const PORT = 3000;
// ⚠️ REMPLACEZ CELA PAR VOTRE PROPRE URL DE CONNEXION MONGODB
const MONGO_URI = "mongodb://localhost:27017/chatApp"; 

// Permet de servir ton HTML et fichiers statiques
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// --- Modèles MongoDB ---

// Schéma Utilisateur (pour l'authentification)
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
  timestamp: { type: Date, default: Date.now },
});
const Message = mongoose.model("Message", MessageSchema);

// --- Connexion à la Base de Données ---
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("💾 Connecté à MongoDB"))
  .catch((err) => console.error("Erreur de connexion MongoDB:", err));


// --- Stockage en mémoire (uniquement pour les utilisateurs connectés) ---
// Note: 'users' n'est plus utilisé. 'onlineUsers' est conservé.
let onlineUsers = {}; // socket.id -> username

function updateOnlineList() {
  const onlineList = Object.values(onlineUsers);
  // Envoie la liste aux clients, sans doublons
  io.emit("onlineUsers", [...new Set(onlineList)]);
}

// --- Authentification ---

app.post("/signup", async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) return res.status(400).json({ error: "Champs requis manquants" });

  try {
    // 1. Vérifier si l'utilisateur existe déjà
    if (await User.findOne({ username })) {
      return res.status(400).json({ error: "Nom d'utilisateur déjà pris" });
    }

    // 2. Hacher le mot de passe (Sécurité!)
    const hashedPassword = await bcrypt.hash(password, 10); 
    
    // 3. Créer et sauvegarder l'utilisateur dans MongoDB
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
    // 1. Trouver l'utilisateur
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: "Identifiants invalides" });

    // 2. Comparer le mot de passe haché (Sécurité!)
    const match = await bcrypt.compare(password, user.password);

    if (!match) return res.status(401).json({ error: "Identifiants invalides" });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur lors de la connexion" });
  }
});

// --- API de Messages (Historique) ---

// Nouvelle route pour récupérer l'historique des messages entre deux personnes
app.get("/messages/:user1/:user2", async (req, res) => {
    const { user1, user2 } = req.params;
    try {
        // Cherche les messages où user1 -> user2 OU user2 -> user1
        const messages = await Message.find({
            $or: [
                { from: user1, to: user2 },
                { from: user2, to: user1 },
            ],
        }).sort({ timestamp: 1 }); // Trie par ordre chronologique
        
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
  socket.on("registerUser", (username) => {
    // Assigne l'ID de socket à l'utilisateur
    onlineUsers[socket.id] = username;
    console.log(`✅ ${username} est en ligne`);
    updateOnlineList();
  });

  // Réception d’un message
  socket.on("sendMessage", async (msg) => {
    console.log(`💬 ${msg.from} → ${msg.to}: ${msg.text}`);
    
    // 1. Sauvegarde du message dans MongoDB (Historique)
    const newMessage = new Message(msg);
    await newMessage.save();

    // 2. Optimisation de la Messagerie Privée (envoi direct)
    
    // Trouver l'ID du socket du destinataire. 
    // On itère sur onlineUsers pour trouver la clé (socket.id) dont la valeur est le destinataire.
    const recipientSocketId = Object.keys(onlineUsers).find(
        (id) => onlineUsers[id] === msg.to
    );

    // Envoi au destinataire (si en ligne)
    if (recipientSocketId) {
        // Envoi au destinataire
        io.to(recipientSocketId).emit("receiveMessage", msg);
    }
    
    // Envoi à l'émetteur pour confirmation/affichage immédiat
    socket.emit("receiveMessage", msg);
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
