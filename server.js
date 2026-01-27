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

mongoose.connect(MONGO_URI).then(() => console.log("✅ Connecté à MongoDB Cloud"));

// Modèle Utilisateur avec demandes d'amis
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    friends: [String],
    requests: [String] 
}));

const Message = mongoose.model('Message', new mongoose.Schema({
    from: String, to: String, text: String, timestamp: { type: Date, default: Date.now }
}));

// API AUTH
app.post('/signup', async (req, res) => {
    try {
        const hashed = await bcrypt.hash(req.body.password, 10);
        await new User({ username: req.body.username, password: hashed, friends: [], requests: [] }).save();
        res.json({ success: true });
    } catch (e) { res.status(400).json({ success: false, error: "Pseudo déjà pris" }); }
});

app.post('/login', async (req, res) => {
    const user = await User.findOne({ username: req.body.username });
    if (user && await bcrypt.compare(req.body.password, user.password)) return res.json({ success: true });
    res.status(401).json({ success: false, error: "Mauvais identifiants" });
});

// API SYSTEME AMIS
app.post('/send-request', async (req, res) => {
    const { from, to } = req.body;
    const target = await User.findOne({ username: to });
    if (!target) return res.status(404).json({ error: "Utilisateur introuvable" });
    if (target.friends.includes(from) || target.requests.includes(from)) return res.status(400).json({ error: "Déjà ami ou en attente" });
    await User.updateOne({ username: to }, { $addToSet: { requests: from } });
    res.json({ success: true });
});

app.post('/accept-request', async (req, res) => {
    const { me, friend } = req.body;
    await User.updateOne({ username: me }, { $pull: { requests: friend }, $addToSet: { friends: friend } });
    await User.updateOne({ username: friend }, { $addToSet: { friends: me } });
    res.json({ success: true });
});

app.post('/decline-request', async (req, res) => {
    const { me, friend } = req.body;
    await User.updateOne({ username: me }, { $pull: { requests: friend } });
    res.json({ success: true });
});

app.get('/user-data/:username', async (req, res) => {
    const user = await User.findOne({ username: req.params.username });
    res.json({ friends: user.friends, requests: user.requests });
});

app.get('/messages/:u1/:target', async (req, res) => {
    const msgs = await Message.find({ $or: [{ from: req.params.u1, to: req.params.target }, { from: req.params.target, to: req.params.u1 }] }).sort({ timestamp: 1 });
    res.json(msgs);
});

// SOCKET.IO
const onlineUsers = {};
io.on('connection', (socket) => {
    socket.on('registerUser', (user) => {
        onlineUsers[user] = socket.id;
        io.emit('onlineUpdate', Object.keys(onlineUsers));
    });
    socket.on('sendMessage', async (data) => {
        await new Message(data).save();
        if (onlineUsers[data.to]) io.to(onlineUsers[data.to]).emit('receiveMessage', data);
        socket.emit('receiveMessage', data);
    });
    socket.on('disconnect', () => {
        const user = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        delete onlineUsers[user];
        io.emit('onlineUpdate', Object.keys(onlineUsers));
    });
});

server.listen(PORT, () => console.log(`🚀 Serveur Snap+ sur port ${PORT}`));
