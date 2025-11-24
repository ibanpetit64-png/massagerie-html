// ----------------------------------------------------
// server.js - Backend Node.js / Express / Socket.io / MongoDB
// ----------------------------------------------------

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt'); // Pour le hachage sécurisé des mots de passe

const app = express();
const server = http.createServer(app);
// Configuration de Socket.io pour permettre les connexions depuis le frontend
const io = new Server(server, {
    cors: {
        origin: "*", // Permet à toutes les origines (pour le développement/Render)
        methods: ["GET", "POST"]
    }
});

// --- Configuration ---
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/messagerie-app';
const SALT_ROUNDS = 10; // Niveau de sécurité pour le hachage

// Middleware pour analyser le corps des requêtes JSON
app.use(express.json());

// ----------------------------------------------------
// 2. Connexion à MongoDB
// ----------------------------------------------------

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB connecté avec succès.'))
    .catch(err => console.error('Erreur de connexion MongoDB :', err));

// ----------------------------------------------------
// 3. Schémas et Modèles Mongoose
// ----------------------------------------------------

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});

// Hachage du mot de passe avant l'enregistrement
UserSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
    }
    next();
});

const User = mongoose.model('User', UserSchema);

const MessageSchema = new mongoose.Schema({
    from: String,
    to: String, // Peut être le nom d'un autre utilisateur ou le nom d'un groupe
    text: String,
    timestamp: { type: Date, default: Date.now },
    isGroup: { type: Boolean, default: false }
});

const Message = mongoose.model('Message', MessageSchema);

const GroupSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    members: [String], // Liste des usernames membres
    creator: String,
    createdAt: { type: Date, default: Date.now }
});

const Group = mongoose.model('Group', GroupSchema);


// ----------------------------------------------------
// 4. Routes d'Authentification et de Groupe (REST API)
// ----------------------------------------------------

// Route pour l'inscription (Signup)
app.post('/signup', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, error: "Nom d'utilisateur et mot de passe requis." });
    }
    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(409).json({ success: false, error: "Ce nom d'utilisateur existe déjà." });
        }
        const newUser = new User({ username, password });
        await newUser.save();
        res.json({ success: true, message: "Inscription réussie." });
    } catch (e) {
        res.status(500).json({ success: false, error: "Erreur serveur lors de l'inscription." });
    }
});

// Route pour la connexion (Login)
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ success: false, error: "Nom d'utilisateur ou mot de passe incorrect." });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, error: "Nom d'utilisateur ou mot de passe incorrect." });
        }
        res.json({ success: true, message: "Connexion réussie." });
    } catch (e) {
        res.status(500).json({ success: false, error: "Erreur serveur lors de la connexion." });
    }
});

// Route de création de groupe
app.post('/createGroup', async (req, res) => {
    const { groupName, creatorUsername } = req.body;
    try {
        const existingGroup = await Group.findOne({ name: groupName });
        if (existingGroup) {
            return res.status(409).json({ success: false, error: "Ce nom de groupe existe déjà." });
        }
        const newGroup = new Group({
            name: groupName,
            creator: creatorUsername,
            members: [creatorUsername] // Ajoute le créateur automatiquement
        });
        await newGroup.save();
        res.json({ success: true, group: newGroup });
    } catch (e) {
        res.status(500).json({ success: false, error: "Erreur serveur lors de la création du groupe." });
    }
});

// Route pour obtenir les groupes d'un utilisateur
app.get('/groups/:username', async (req, res) => {
    const { username } = req.params;
    try {
        // Retourne les groupes où l'utilisateur est membre
        const groups = await Group.find({ members: username }).select('name');
        res.json(groups);
    } catch (e) {
        res.status(500).json({ success: false, error: "Erreur lors de la récupération des groupes." });
    }
});

// Route pour l'historique des messages
app.get('/messages/:user1/:target', async (req, res) => {
    const { user1, target } = req.params;
    try {
        // 1. Vérifie si 'target' est un groupe
        const group = await Group.findOne({ name: target });
        
        let messages;
        if (group) {
            // C'est un groupe : on cherche tous les messages destinés au nom du groupe
            messages = await Message.find({ to: target })
                                    .sort({ timestamp: 1 })
                                    .limit(100); // Limite pour la performance
        } else {
            // C'est un chat privé : on cherche les messages entre user1 et target (dans les deux sens)
            messages = await Message.find({
                $or: [
                    { from: user1, to: target },
                    { from: target, to: user1 }
                ]
            }).sort({ timestamp: 1 })
              .limit(100);
        }
        
        res.json(messages);
    } catch (e) {
        console.error("Erreur historique:", e);
        res.status(500).json({ error: "Erreur serveur lors du chargement de l'historique." });
    }
});

// ----------------------------------------------------
// 5. Gestion des Fichiers Statiques (Frontend)
// ----------------------------------------------------

// Sert le fichier index.html (le client)
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});


// ----------------------------------------------------
// 6. Gestion des Sockets (Temps Réel)
// ----------------------------------------------------

// Map pour associer le username à l'ID de la socket
const onlineUsers = {}; // { username: socketId }

io.on('connection', (socket) => {
    console.log(`Un utilisateur est connecté: ${socket.id}`);
    
    // Événement d'enregistrement de l'utilisateur
    socket.on('registerUser', (username) => {
        if (!username) return;
        onlineUsers[username] = socket.id;
        
        // Joint les salons de groupe auxquels l'utilisateur appartient
        Group.find({ members: username }).select('name')
            .then(groups => {
                groups.forEach(group => {
                    socket.join(group.name);
                });
            })
            .catch(err => console.error("Erreur pour joindre les groupes:", err));

        // Envoie la liste mise à jour à tous
        const userList = Object.keys(onlineUsers);
        io.emit('onlineUsers', userList);
        console.log(`User registered: ${username}. Online list sent.`);
    });

    // Événement de réception d'un message
    socket.on('sendMessage', async (msg) => {
        const { from, to, text, isGroup } = msg;

        // 1. Sauvegarde le message dans la BDD
        const newMessage = new Message({ from, to, text, isGroup });
        await newMessage.save();

        if (isGroup) {
            // 2a. Message de groupe: envoi à tous les membres du salon (sauf l'expéditeur)
            socket.to(to).emit('receiveMessage', newMessage);
            // 2b. Envoi à l'expéditeur lui-même pour l'afficher
            socket.emit('receiveMessage', newMessage);
        } else {
            // 3a. Chat privé: trouve la socket du destinataire
            const recipientSocketId = onlineUsers[to];
            
            // 3b. Envoi au destinataire s'il est en ligne
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('receiveMessage', newMessage);
            }
            // 3c. Envoi à l'expéditeur lui-même pour l'afficher
            socket.emit('receiveMessage', newMessage);
        }
    });

    // Gestion de la déconnexion
    socket.on('disconnect', () => {
        // Retire l'utilisateur de la liste en ligne
        const disconnectedUsername = Object.keys(onlineUsers).find(
            key => onlineUsers[key] === socket.id
        );
        
        if (disconnectedUsername) {
            delete onlineUsers[disconnectedUsername];
            console.log(`User disconnected: ${disconnectedUsername}`);
            
            // Envoie la liste mise à jour à tous
            const userList = Object.keys(onlineUsers);
            io.emit('onlineUsers', userList);
        }
        console.log(`Un utilisateur est déconnecté: ${socket.id}`);
    });
});


// ----------------------------------------------------
// 7. Démarrage du Serveur
// ----------------------------------------------------

server.listen(PORT, () => {
    console.log(`Serveur d'application en cours d'exécution sur le port ${PORT}`);
});
