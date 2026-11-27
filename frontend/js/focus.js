// ================================================================
// focus.js - EXTRA ENHANCEMENT FEATURES (beyond the original brief)
// 1) Pomodoro-style Focus Timer with a daily study streak tracker
// 2) AI Mind Map - a simple canvas visualization of lecture keywords
// ================================================================

requireAuth();
renderNavbar("focus.html");

// ---------------- Pomodoro Timer ----------------
let totalSeconds = 25 * 60;
let remaining = totalSeconds;
let timerId = null;

const display = document.getElementById("timer-display");

function formatTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function updateDisplay() {
  display.textContent = formatTime(remaining);
}

function setMode(minutes) {
  pauseTimer();
  totalSeconds = minutes * 60;
  remaining = totalSeconds;
  updateDisplay();
}

function startTimer() {
  if (timerId) return;
  document.getElementById("start-btn").textContent = "Running...";
  timerId = setInterval(() => {
    remaining--;
    updateDisplay();
    if (remaining <= 0) {
      clearInterval(timerId);
      timerId = null;
      document.getElementById("start-btn").textContent = "Start";
      playChime();
      recordSession();
      remaining = totalSeconds;
      updateDisplay();
    }
  }, 1000);
}

function pauseTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
    document.getElementById("start-btn").textContent = "Start";
  }
}

function resetTimer() {
  pauseTimer();
  remaining = totalSeconds;
  updateDisplay();
}

// Small beep using the Web Audio API - no external sound file needed
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) { /* audio not supported, silently ignore */ }
}

// ---------------- Streak Tracker (stored per-browser in localStorage) ----------------
function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function recordSession() {
  const data = JSON.parse(localStorage.getItem("npai_focus") || "{}");
  const today = todayKey();

  data.sessionsByDay = data.sessionsByDay || {};
  data.sessionsByDay[today] = (data.sessionsByDay[today] || 0) + 1;

  // Recompute streak: count consecutive days ending today with >=1 session
  let streak = 0;
  let cursor = new Date();
  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    if (data.sessionsByDay[key] && data.sessionsByDay[key] > 0) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  data.streak = streak;

  localStorage.setItem("npai_focus", JSON.stringify(data));
  renderStreak();
}

function renderStreak() {
  const data = JSON.parse(localStorage.getItem("npai_focus") || "{}");
  const today = todayKey();
  document.getElementById("streak-value").textContent = data.streak || 0;
  document.getElementById("sessions-value").textContent =
    (data.sessionsByDay && data.sessionsByDay[today]) || 0;
}

// ---------------- AI Mind Map ----------------
function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

async function loadLecturesForMindmap() {
  const select = document.getElementById("lecture-select");
  try {
    const { lectures } = await apiCall("/lectures");
    if (lectures.length === 0) {
      select.innerHTML = `<option value="">No lectures yet</option>`;
      return;
    }
    select.innerHTML = lectures
      .map((l) => `<option value="${l.id}">${l.subject}</option>`)
      .join("");
    select.onchange = () => drawMindMap(select.value);

    const wanted = getQueryParam("id") || lectures[0].id;
    select.value = wanted;
    drawMindMap(wanted);
  } catch (err) {
    select.innerHTML = `<option value="">Error loading lectures</option>`;
  }
}

async function drawMindMap(lectureId) {
  if (!lectureId) return;
  const canvas = document.getElementById("mindmap-canvas");
  const ctx = canvas.getContext("2d");

  // Match canvas resolution to its displayed size (keeps it crisp)
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;

  try {
    const { lecture } = await apiCall(`/lectures/${lectureId}`);
    const keywords = ((lecture && lecture.notes && lecture.notes.keywords) || []).slice(0, 8);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = Math.min(cx, cy) - 60;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Center node = the subject
    drawNode(ctx, cx, cy, (lecture && lecture.subject) || "Lecture", "#E8A33D", 46);

    keywords.forEach((k, i) => {
      const angle = (i / keywords.length) * Math.PI * 2;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);

      ctx.strokeStyle = "#C1666B";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.stroke();

      drawNode(ctx, x, y, k, "#4E8FB8", 30);
    });
  } catch (err) {
    ctx.fillText("Could not load mind map.", 20, 30);
  }
}

function drawNode(ctx, x, y, label, color, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "12px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const short = label.length > 14 ? label.slice(0, 12) + "…" : label;
  ctx.fillText(short, x, y);
}

// ---------------- 🌲 Semester Skill Tree & Knowledge Graph ----------------
let allLecturesCache = [];
let treeNodes = [];

async function loadSkillTree() {
  const canvas = document.getElementById("skilltree-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;

  try {
    const { lectures } = await apiCall("/lectures");
    allLecturesCache = lectures;

    if (lectures.length === 0) {
      ctx.fillStyle = "#A0A5C0";
      ctx.font = "14px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No lecture nodes yet. Record your first few lectures to generate your course skill tree!", canvas.width / 2, canvas.height / 2);
      return;
    }

    drawSkillTree(ctx, canvas, lectures);
    setupSkillTreeInteractions(canvas);
  } catch (err) {
    ctx.fillText("Could not load skill tree.", 20, 30);
  }
}

function drawSkillTree(ctx, canvas, lectures) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  treeNodes = [];

  const count = lectures.length;
  const spacingX = Math.min(180, (canvas.width - 120) / Math.max(1, count - 1));
  const startX = 60;
  const centerY = canvas.height / 2;

  // Draw connecting branch lines
  ctx.strokeStyle = "#4E8FB8";
  ctx.lineWidth = 3;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const x = startX + i * spacingX;
    const y = centerY + (i % 2 === 0 ? -40 : 40);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]); // reset

  // Draw nodes
  lectures.forEach((l, i) => {
    const x = startX + i * spacingX;
    const y = centerY + (i % 2 === 0 ? -40 : 40);
    const isUnlocked = true;
    const color = i === 0 ? "#6E9F5C" : i === count - 1 ? "#E8A33D" : "#4E8FB8";

    // Node Circle
    ctx.beginPath();
    ctx.arc(x, y, 26, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = "rgba(0,0,0,0.2)";
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Node Icon / Level
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 11px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`Lec ${i + 1}`, x, y);

    // Node Label
    ctx.fillStyle = "var(--ink)";
    ctx.font = "11px Inter, sans-serif";
    const label = l.subject.length > 16 ? l.subject.slice(0, 14) + "…" : l.subject;
    ctx.fillText(label, x, y + 36);

    treeNodes.push({ x, y, r: 26, lecture: l, index: i });
  });
}

function setupSkillTreeInteractions(canvas) {
  canvas.onclick = (e) => {
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const hit = treeNodes.find((n) => {
      const dx = clickX - n.x;
      const dy = clickY - n.y;
      return Math.sqrt(dx * dx + dy * dy) <= n.r;
    });

    if (hit) {
      window.location.href = `notes.html?id=${hit.lecture.id}`;
    }
  };

  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const moveX = e.clientX - rect.left;
    const moveY = e.clientY - rect.top;
    const details = document.getElementById("tree-node-details");

    const hit = treeNodes.find((n) => {
      const dx = moveX - n.x;
      const dy = moveY - n.y;
      return Math.sqrt(dx * dx + dy * dy) <= n.r;
    });

    if (hit) {
      canvas.style.cursor = "pointer";
      if (details) {
        details.innerHTML = `<strong>Lecture ${hit.index + 1}: ${hit.lecture.subject}</strong> (${hit.lecture.subjectTag || "General"}) · Click to jump to notes →`;
      }
    } else {
      canvas.style.cursor = "default";
    }
  };
}

// ---------------- Init ----------------
updateDisplay();
renderStreak();
loadLecturesForMindmap();
loadSkillTree();
