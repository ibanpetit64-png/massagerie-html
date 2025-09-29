const socket = io();

// --- Auth ---
const authDiv = document.getElementById("auth");
const registerDiv = document.getElementById("register");
const chatDiv = document.getElementById("chat");
const userDisplay = document.getElementById("userDisplay");

document.getElementById("showRegister").onclick = () => {
  authDiv.style.display = "none";
  registerDiv.style.display = "block";
};

document.getElementById("showLogin").onclick = () => {
  registerDiv.style.display = "none";
  authDiv.style.display = "block";
};

document.getElementById("registerBtn").onclick = async () => {
  const username = document.getElementById("regUsername").value.trim();
  const password = document.getElementById("regPassword").value.trim();
  const res = await fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  alert(data.message);
  if (res.ok) {
    registerDiv.style.display = "none";
    authDiv.style.display = "block";
  }
};

document.getElementById("loginBtn").onclick = async () => {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (!res.ok) return alert(data.message);

  userDisplay.textContent = username;
  authDiv.style.display = "none";
  chatDiv.style.display = "block";
  window.username = username;
};

// --- Chat ---
const messagesDiv = document.getElementById("messages");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");

sendBtn.onclick = () => {
  const msg = msgInput.value.trim();
  if (!msg) return;
  socket.emit("sendMessage", { user: window.username, text: msg });
  msgInput.value = "";
};

socket.on("receiveMessage", ({ user, text }) => {
  const div = document.createElement("div");
  div.className = "message " + (user === window.username ? "self" : "other");
  div.textContent = `${user}: ${text}`;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});
