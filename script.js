const socket = io();
const body = document.body;

// Auth
const authSection = document.getElementById("authSection");
const chatSection = document.getElementById("chatSection");

document.getElementById("goRegister").onclick = () => {
  document.getElementById("login").style.display = "none";
  document.getElementById("register").style.display = "block";
};

document.getElementById("goLogin").onclick = () => {
  document.getElementById("register").style.display = "none";
  document.getElementById("login").style.display = "block";
};

document.getElementById("registerBtn").onclick = async () => {
  const username = document.getElementById("regUsername").value;
  const password = document.getElementById("regPassword").value;
  const res = await fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  alert(data.message);
  if (res.ok) {
    document.getElementById("register").style.display = "none";
    document.getElementById("login").style.display = "block";
  }
};

document.getElementById("loginBtn").onclick = async () => {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) return alert(data.message);

  window.username = username;
  authSection.style.display = "none";
  chatSection.style.display = "grid";
};

// Chat
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const messagesDiv = document.getElementById("messages");

sendBtn.onclick = () => {
  const text = msgInput.value.trim();
  if (!text) return;
  socket.emit("sendMessage", { user: window.username, text });
  msgInput.value = "";
};

socket.on("receiveMessage", ({ user, text }) => {
  const div = document.createElement("div");
  div.className = "message " + (user === window.username ? "self" : "other");
  div.textContent = `${user}: ${text}`;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

// Ajouter contact
document.getElementById("addContactBtn").onclick = () => {
  const name = document.getElementById("newContact").value.trim();
  if (!name) return;
  const li = document.createElement("li");
  li.textContent = name;
  document.getElementById("contactList").appendChild(li);
  document.getElementById("newContact").value = "";
};

// Mode clair/sombre
document.getElementById("toggleTheme").onclick = () => {
  body.classList.toggle("light");
};
