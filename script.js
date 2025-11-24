const loginSection = document.getElementById("login-section");
const chatSection = document.getElementById("chat-section");
const loginBtn = document.getElementById("login-btn");
const registerBtn = document.getElementById("register-btn");
const logoutBtn = document.getElementById("logout-btn");
const sendBtn = document.getElementById("send-btn");
const messageInput = document.getElementById("message-input");
const chatWindow = document.getElementById("chat-window");
const loginError = document.getElementById("login-error");

let currentUser = null;

// Charger les utilisateurs depuis users.json
async function getUsers() {
    const res = await fetch("users.json");
    return await res.json();
}

// Se connecter
loginBtn.addEventListener("click", async () => {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const users = await getUsers();
    const user = users.find(u => u.email === email && u.password === password);
    if(user) {
        currentUser = user;
        loginSection.style.display = "none";
        chatSection.style.display = "block";
        loginError.textContent = "";
    } else {
        loginError.textContent = "Email ou mot de passe incorrect";
    }
});

// S'inscrire
registerBtn.addEventListener("click", async () => {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const users = await getUsers();
    if(users.find(u => u.email === email)) {
        loginError.textContent = "Utilisateur déjà existant";
        return;
    }
    users.push({email, password});
    await fetch("users.json", {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(users)
    });
    loginError.textContent = "Utilisateur créé, vous pouvez vous connecter";
});

// Envoyer un message
sendBtn.addEventListener("click", () => {
    if(messageInput.value.trim() === "") return;
    const msg = document.createElement("p");
    msg.textContent = `${currentUser.email}: ${messageInput.value}`;
    chatWindow.appendChild(msg);
    messageInput.value = "";
});

// Déconnexion
logoutBtn.addEventListener("click", () => {
    currentUser = null;
    chatSection.style.display = "none";
    loginSection.style.display = "block";
});
