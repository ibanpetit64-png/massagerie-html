const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI; 

app.use(express.json());
app.use(express.static(__dirname));

// Connexion à la base de données
mongoose.connect(MONGO_URI).then(() => console.log("✅ MongoDB Connecté")).catch(err => console.log("❌ Erreur connect:", err));

// Modèles de données
const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    friends: [String] 
});
const User = mongoose.model('User', UserSchema);

const Message = mongoose.model('Message', new mongoose.Schema({
    from: String, to: String, text: String, timestamp: { type: Date, default: Date.now }
}));

// API Authentification
app.post('/signup', async (req, res) => {
    try {
        const hashed = await bcrypt.hash(req.body.password, 10);
        await new User({ username: req.body.username, password: hashed, friends: [] }).save();
        res.json({ success: true });
    } catch (e) { res.status(400).json({ success: false, error: "Pseudo déjà pris" }); }
});

app.post('/login', async (req, res) => {
    const user = await User.findOne({ username: req.body.username });
    if (user && await bcrypt.compare(req.body.password, user.password)) return res.json({ success: true });
    res.status(401).json({ success: false, error: "Erreur d'identifiants" });
});

// API Amis
app.post('/add-friend', async (req, res) => {
    const { me, friendName } = req.body;
    const friend = await User.findOne({ username: friendName });
    if (!friend) return res.status(404).json({ success: false, error: "Utilisateur introuvable" });
    if (me === friendName) return res.status(400).json({ success: false, error: "Vous ne pouvez pas vous ajouter vous-même" });
    
    await User.updateOne({ username: me }, { $addToSet: { friends: friendName } });
    res.json({ success: true });
});

app.get('/friends/:username', async (req, res) => {
    const user = await User.findOne({ username: req.params.username });
    res.json(user ? user.friends : []);
});

app.get('/messages/:u1/:target', async (req, res) => {
    const msgs = await Message.find({ $or: [{ from: req.params.u1, to: req.params.target }, { from: req.params.target, to: req.params.u1 }] }).sort({ timestamp: 1 });
    res.json(msgs);
});

// Temps réel (Socket.io)
const onlineUsers = {};
io.on('connection', (socket) => {
    socket.on('registerUser', (user) => {
        onlineUsers[user] = socket.id;
        io.emit('onlineStatusUpdate', Object.keys(onlineUsers));
    });
    socket.on('sendMessage', async (data) => {
        await new Message(data).save();
        if (onlineUsers[data.to]) io.to(onlineUsers[data.to]).emit('receiveMessage', data);
        socket.emit('receiveMessage', data);
    });
    socket.on('disconnect', () => {
        const user = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        delete onlineUsers[user];
        io.emit('onlineStatusUpdate', Object.keys(onlineUsers));
    });
});

server.listen(PORT, () => console.log(`🚀 Serveur actif sur port ${PORT}`));
