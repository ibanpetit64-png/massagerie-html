const socket = io();
let currentUser = null;
let currentChat = null;

const auth = document.getElementById("auth");
const app = document.getElementById("app");

// NAVIGATION LOGIN ⇄ REGISTER
document.getElementById("goRegister").onclick = () => {
  document.getElementById("register").style.display = "block";
};

document.getElementById("goLogin").onclick = () => {
  document.getElementById("register").style.display = "none";
};

// INSCRIPTION
document.getElementById("regBtn").onclick = async () => {
  let username = document.getElementById("regUser").value;
  let password = document.getElementById("regPass").value;

  let res = await fetch("/api/register", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ username, password })
  });

  let data = await res.json();
  alert(data.message);
};

// CONNEXION
document.getElementById("loginBtn").onclick = async () => {
  let username = document.getElementById("loginUser").value;
  let password = document.getElementById("loginPass").value;

  let res = await fetch("/api/login", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ username, password })
  });

  let data = await res.json();
  if (!res.ok) return alert(data.message);

  currentUser = username;
  auth.style.display = "none";
  app.style.display = "flex";
};

// AJOUT CONTACT
document.getElementById("addContactBtn").onclick = () => {
  const contact = document.getElementById("addContactInput").value;
  if (!contact) return;

  let li = document.createElement("li");
  li.innerText = contact;
  li.onclick = () => openChat(contact);

  document.getElementById("contactList").appendChild(li);
  document.getElementById("addContactInput").value = "";
};

// OUVERTURE D’UNE CONVERSATION
function openChat(name) {
  currentChat = name;
  document.getElementById("currentChat").innerText = name;

  document.querySelectorAll("#contactList li").forEach(li => li.classList.remove("active"));
  event.target.classList.add("active");

  document.getElementById("messages").innerHTML = "";
}

// ENVOI MESSAGE
document.getElementById("sendBtn").onclick = () => {
  if (!currentChat) return alert("Choisis un contact !");
  const text = document.getElementById("msgInput").value;

  socket.emit("sendMessage", {
    from: currentUser,
    to: currentChat,
    text
  });

  document.getElementById("msgInput").value = "";
};

// RÉCEPTION MESSAGE
socket.on("receiveMessage", msg => {
  if (msg.to !== currentUser && msg.from !== currentUser) return;

  const div = document.createElement("div");
  div.className = "message " + (msg.from === currentUser ? "self" : "other");
  div.innerText = `${msg.from}: ${msg.text}`;
  document.getElementById("messages").appendChild(div);
});

// THEME
document.getElementById("toggleTheme").onclick = () => {
  document.body.classList.toggle("light");
};

// DECONNEXION
document.getElementById("logout").onclick = () => {
  location.reload();
};
