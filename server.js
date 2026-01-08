const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Variables d'environnement pour Render
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI; // On la configurera dans Render

app.use(express.json());
app.use(express.static(__dirname));

// Connexion MongoDB
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Connecté à MongoDB Cloud"))
    .catch(err => console.error("❌ Erreur MongoDB:", err));

// Modèles
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true }
}));

const Message = mongoose.model('Message', new mongoose.Schema({
    from: String, to: String, text: String, isGroup: Boolean, timestamp: { type: Date, default: Date.now }
}));

const Group = mongoose.model('Group', new mongoose.Schema({
    name: { type: String, unique: true }, members: [String]
}));

// Routes API
app.post('/signup', async (req, res) => {
    try {
        const hashed = await bcrypt.hash(req.body.password, 10);
        const user = new User({ username: req.body.username, password: hashed });
        await user.save();
        res.json({ success: true });
    } catch (e) { res.status(400).json({ success: false, error: "Pseudo déjà pris" }); }
});

app.post('/login', async (req, res) => {
    const user = await User.findOne({ username: req.body.username });
    if (user && await bcrypt.compare(req.body.password, user.password)) {
        return res.json({ success: true });
    }
    res.status(401).json({ success: false, error: "Mauvais identifiants" });
});

app.get('/messages/:u1/:target', async (req, res) => {
    const { u1, target } = req.params;
    const isGrp = await Group.findOne({ name: target });
    const query = isGrp ? { to: target } : { $or: [{ from: u1, to: target }, { from: target, to: u1 }] };
    const msgs = await Message.find(query).sort({ timestamp: 1 }).limit(50);
    res.json(msgs);
});

app.post('/createGroup', async (req, res) => {
    try {
        const group = new Group({ name: req.body.groupName, members: [req.body.creator] });
        await group.save();
        res.json({ success: true });
    } catch (e) { res.status(400).json({ success: false }); }
});

app.get('/groups', async (req, res) => {
    const groups = await Group.find();
    res.json(groups);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Temps réel
const onlineUsers = {};
io.on('connection', (socket) => {
    socket.on('registerUser', (username) => {
        onlineUsers[username] = socket.id;
        io.emit('onlineUsers', Object.keys(onlineUsers));
    });

    socket.on('sendMessage', async (data) => {
        const msg = new Message(data);
        await msg.save();
        io.emit('receiveMessage', msg);
    });

    socket.on('disconnect', () => {
        const user = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if(user) { delete onlineUsers[user]; io.emit('onlineUsers', Object.keys(onlineUsers)); }
    });
});

server.listen(PORT, () => console.log(`🚀 Live sur port ${PORT}`));
