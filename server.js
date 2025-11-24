const express = require("express");
const fs = require("fs");
const app = express();
const PORT = 3000;

app.use(express.static("."));
app.use(express.json());

// Endpoint pour récupérer les utilisateurs
app.get("/users.json", (req, res) => {
    fs.readFile("users.json", "utf8", (err, data) => {
        if(err) return res.status(500).send("Erreur serveur");
        res.send(data);
    });
});

// Endpoint pour mettre à jour les utilisateurs
app.put("/users.json", (req, res) => {
    fs.writeFile("users.json", JSON.stringify(req.body, null, 2), err => {
        if(err) return res.status(500).send("Erreur serveur");
        res.send({status:"ok"});
    });
});

app.listen(PORT, () => console.log(`Serveur démarré sur http://localhost:${PORT}`));
