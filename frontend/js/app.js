// ================================================================
// app.js - shared helpers used on every page
// ================================================================

const API_BASE = "/api";

// ---------- HTML Sanitizer Helper ----------
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ---------- Date Formatter Helper (YYYY-MM-DD) ----------
function getLocalDateString(dateObj = new Date()) {
  const d = new Date(dateObj);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ---------- Token / session helpers ----------
function getToken() { return localStorage.getItem("npai_token"); }
function getUser() {
  const raw = localStorage.getItem("npai_user");
  return raw ? JSON.parse(raw) : null;
}
function saveSession(token, user) {
  localStorage.setItem("npai_token", token);
  localStorage.setItem("npai_user", JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem("npai_token");
  localStorage.removeItem("npai_user");
}

// Redirect to login if not authenticated. Call at the top of protected pages.
function requireAuth() {
  if (!getToken()) {
    window.location.href = "index.html";
  }
}

// ---------- Generic API call wrapper ----------
async function apiCall(endpoint, method = "GET", body = null) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = "Bearer " + token;

  const res = await fetch(API_BASE + endpoint, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });

  let data = {};
  try { data = await res.json(); } catch (e) { /* empty body */ }

  if (!res.ok) {
    if ((res.status === 401 || res.status === 403) && typeof window !== "undefined" && window.location && !window.location.pathname.endsWith("index.html") && window.location.pathname !== "/") {
      clearSession();
      window.location.href = "index.html";
    }
    throw new Error(data.message || "Something went wrong. Please try again.");
  }
  return data;
}

// ---------- Theme (dark mode) ----------
function initTheme() {
  const saved = localStorage.getItem("npai_theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("npai_theme", next);
}

// ---------- Shared navbar ----------
function renderNavbar(activePage) {
  const mount = document.getElementById("navbar-mount");
  if (!mount) return;
  const user = getUser();

  const links = [
    { href: "dashboard.html", label: "Dashboard" },
    { href: "record.html", label: "Record / Import" },
    { href: "attendance.html", label: "📋 Attendance" },
    { href: "notes.html", label: "My Notes" },
    { href: "flashcards.html", label: "🎴 Flashcards" },
    { href: "planner.html", label: "Study Planner" },
    { href: "quiz.html", label: "Quiz" },
    { href: "supporter.html", label: "🤖 Student Supporter" },
    { href: "focus.html", label: "Focus & Skill Tree" }
  ];

  const linksHtml = links
    .map(
      (l) =>
        `<a href="${l.href}" class="${activePage === l.href ? "active" : ""}">${l.label}</a>`
    )
    .join("");

  mount.innerHTML = `
    <div class="brand"><a href="dashboard.html" style="text-decoration:none; color:inherit;">Notes<span class="dot">Pilot</span> AI</a></div>
    <nav style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
      ${linksHtml}
      <button class="theme-toggle" style="margin-left:12px;" onclick="toggleTheme()">🌓 Theme</button>
      <span class="muted" style="margin-left:10px;">${user ? "Hi, " + user.name.split(" ")[0] : ""}</span>
      <button class="btn btn-ghost" style="margin-left:8px; padding:5px 12px;" onclick="logout()">Logout</button>
    </nav>
  `;
}

function logout() {
  clearSession();
  window.location.href = "index.html";
}

// ---------- Text-to-Speech (Audio Notes / Mini Podcast) ----------
let currentUtterance = null;

function speakText(text, onEndCallback = null) {
  if (!("speechSynthesis" in window)) {
    alert("Speech Synthesis is not supported in this browser.");
    return;
  }
  window.speechSynthesis.cancel(); // Stop any active speech

  const cleanText = text.replace(/[*_#`]/g, "");
  currentUtterance = new SpeechSynthesisUtterance(cleanText);
  currentUtterance.rate = 1.0;
  currentUtterance.pitch = 1.0;
  currentUtterance.lang = "en-US";

  if (onEndCallback) {
    currentUtterance.onend = onEndCallback;
    currentUtterance.onerror = onEndCallback;
  }

  window.speechSynthesis.speak(currentUtterance);
}

function stopSpeech() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

// Run theme init on every page load
initTheme();

