// ================================================================
// attendance.js - Client-Side Controller for Smart Attendance Management
// NotesPilot AI Classroom Learning & Attendance Assistant
// ================================================================

requireAuth();
renderNavbar("attendance.html");

// Helper: Format date string YYYY-MM-DD
function getLocalDateString(dateObj = new Date()) {
  const d = new Date(dateObj);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

let currentSummaryData = null;
let currentHistoryData = [];
let currentCalendarYear = new Date().getFullYear();
let currentCalendarMonth = new Date().getMonth() + 1; // 1-indexed (1 = Jan, 8 = Aug)
let currentCalendarDays = {};
let currentProjectionTarget = 75;
let videoStream = null;

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  initLiveDate();
  loadSummary();
  loadCalendar(currentCalendarYear, currentCalendarMonth);
  loadHistory();
  loadTeacherSessions();
  loadTeacherRoster();
});

// ---------- 1. Header & Live Date ----------
function initLiveDate() {
  const dateEl = document.getElementById("att-live-date-str");
  if (!dateEl) return;
  const now = new Date();
  const options = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
  dateEl.textContent = `Today is ${now.toLocaleDateString(undefined, options)}`;
}

// ---------- 2. Tab Navigation ----------
function switchTab(tabId) {
  const tabs = ["overview", "calendar", "history", "qr", "monthly", "teacher"];
  tabs.forEach((t) => {
    const pane = document.getElementById(`tab-content-${t}`);
    const btn = document.getElementById(`tab-btn-${t}`);
    if (pane) pane.classList.toggle("hidden", t !== tabId);
    if (btn) btn.classList.toggle("active", t === tabId);
  });

  if (tabId === "history") loadHistory();
  if (tabId === "calendar") loadCalendar(currentCalendarYear, currentCalendarMonth);
  if (tabId === "teacher") {
    loadTeacherSessions();
    loadTeacherRoster();
  }
}

// Helper: Open QR tab directly
function openQrModal() {
  switchTab("qr");
  const input = document.getElementById("input-session-pin");
  if (input) input.focus();
}

// ---------- 3. Summary & Projection Stats ----------
async function loadSummary() {
  try {
    const summary = await apiCall("/attendance/summary");
    currentSummaryData = summary;

    // Top Stat Cards
    const overallEl = document.getElementById("stat-overall-pct");
    const attendedEl = document.getElementById("stat-classes-attended");
    const hoursEl = document.getElementById("stat-learning-hours");
    const statusHealthEl = document.getElementById("stat-status-health");

    const pct = summary.overallPercentage;
    const color = pct >= 85 ? "var(--sage)" : pct >= 75 ? "var(--accent-amber)" : "var(--rule-red)";
    if (overallEl) {
      overallEl.textContent = `${pct}%`;
      overallEl.style.color = color;
    }

    if (attendedEl) {
      attendedEl.innerHTML = `${summary.attendedClasses} <span style="font-size:1rem; font-weight:normal; color:var(--ink-soft);">/ ${summary.totalClasses}</span>`;
    }

    if (hoursEl) {
      hoursEl.textContent = `${summary.totalHours} hrs`;
    }

    if (statusHealthEl) {
      if (pct >= 85) {
        statusHealthEl.innerHTML = `<span style="color:var(--sage);">🟢 Excellent</span>`;
      } else if (pct >= 75) {
        statusHealthEl.innerHTML = `<span style="color:var(--accent-amber);">🟡 Safe</span>`;
      } else {
        statusHealthEl.innerHTML = `<span style="color:var(--rule-red);">🔴 Shortage</span>`;
      }
    }

    // Low Attendance Shortage Alert Banner
    const alertBox = document.getElementById("att-shortage-alert");
    const alertDesc = document.getElementById("att-shortage-desc");
    const alertRemedy = document.getElementById("att-shortage-remedy");

    if (alertBox) {
      if (summary.isLowOverall) {
        alertBox.classList.remove("hidden");
        const lowSubList = summary.lowSubjects.map((s) => `${s.subject} (${s.percentage}%)`).join(", ");
        alertDesc.textContent = `Your overall attendance is currently ${pct}% (minimum required is ${summary.requiredThreshold}%). ${lowSubList ? "Low in: " + lowSubList : ""}`;
        
        const needed = summary.projections ? summary.projections.target75 : 0;
        alertRemedy.textContent = needed > 0
          ? `💡 Remediation advice: You need to attend the next ${needed} consecutive class${needed === 1 ? "" : "es"} without missing to bring your attendance back to 75%.`
          : "💡 Maintain regular attendance to stay above the 75% requirement.";
      } else {
        alertBox.classList.add("hidden");
      }
    }

    // Update Projection Result
    renderProjection();

    // Render Subject-Wise Cards
    renderSubjectCards(summary.subjects || []);

    // Render Monthly Reports Table
    renderMonthlyReport(summary.monthly || []);

    // Populate Subject Filter in History Tab
    populateSubjectFilters(summary.subjects || []);

  } catch (err) {
    console.error("Failed to load attendance summary:", err);
  }
}

// 🎯 Projection Calculator
function setProjectionTarget(targetPercent) {
  currentProjectionTarget = targetPercent;
  document.querySelectorAll(".target-pill").forEach((btn) => {
    btn.classList.toggle("active", btn.textContent.includes(`${targetPercent}%`));
  });
  renderProjection();
}

function renderProjection() {
  if (!currentSummaryData) return;

  const resultTitle = document.getElementById("projection-result-title");
  const resultSubtitle = document.getElementById("projection-result-subtitle");
  if (!resultTitle || !resultSubtitle) return;

  const currentPct = currentSummaryData.overallPercentage;
  const total = currentSummaryData.totalClasses;
  const attended = currentSummaryData.attendedClasses;
  const target = currentProjectionTarget;

  if (total === 0) {
    resultTitle.innerHTML = `No classes recorded yet.`;
    resultSubtitle.textContent = `Start recording lectures or checking into classes to see your attendance trajectory.`;
    return;
  }

  if (currentPct < target) {
    // Calculate how many consecutive classes needed:
    // (attended + x) / (total + x) >= target / 100
    // => x >= (target/100 * total - attended) / (1 - target/100)
    const t = target / 100;
    const numerator = (t * total) - attended;
    const denominator = 1 - t;
    const needed = Math.max(0, Math.ceil(numerator / denominator));

    resultTitle.innerHTML = `<span style="color:var(--rule-red);">⚠️ Below ${target}% Target:</span> You need to attend <strong>${needed}</strong> consecutive classes.`;
    resultSubtitle.innerHTML = `If you attend the next <strong>${needed}</strong> classes without missing any, your overall attendance will rise from <strong>${currentPct}%</strong> to <strong>${target}%</strong>.`;
  } else {
    // Calculate how many classes can be safely missed:
    // attended / (total + y) >= target / 100
    // => y <= (attended / (target/100)) - total
    const t = target / 100;
    const maxTotal = attended / t;
    const safeSkips = Math.max(0, Math.floor(maxTotal - total));

    resultTitle.innerHTML = `<span style="color:var(--sage);">✅ On Track!</span> You can safely miss up to <strong>${safeSkips}</strong> class${safeSkips === 1 ? "" : "es"}.`;
    resultSubtitle.innerHTML = `Your current attendance is <strong>${currentPct}%</strong>. Even if you miss <strong>${safeSkips}</strong> upcoming classes, your attendance will stay at or above your <strong>${target}%</strong> target.`;
  }
}

// Render Subject Cards
function renderSubjectCards(subjects) {
  const container = document.getElementById("subject-cards-grid");
  if (!container) return;

  if (subjects.length === 0) {
    container.innerHTML = `<p class="muted">No subject records found yet. Check in to your first class!</p>`;
    return;
  }

  container.innerHTML = subjects
    .map((s) => {
      const isLow = s.percentage < 75;
      const barColor = s.percentage >= 85 ? "var(--sage)" : s.percentage >= 75 ? "var(--accent-amber)" : "var(--rule-red)";
      return `
      <div class="subject-card">
        <div class="flex-between">
          <div>
            <h4 style="margin:0;">${escapeHtml(s.subject)}</h4>
            <span class="muted" style="font-size:0.8rem;">Tag: ${escapeHtml(s.subjectTag || s.subject)}</span>
          </div>
          <span class="att-badge ${isLow ? 'badge-absent' : 'badge-present'}">
            ${s.percentage}% ${isLow ? '⚠️ Shortage' : '✅ Good'}
          </span>
        </div>

        <div class="progress-bar-bg" style="margin-top:14px;">
          <div class="progress-bar-fill" style="width: ${s.percentage}%; background: ${barColor};"></div>
        </div>

        <div class="flex-between" style="font-size:0.86rem; color:var(--ink-soft); margin-top:8px;">
          <span>Classes: <strong>${s.attended}</strong> / ${s.total}</span>
          <span>Hours: <strong>${s.hours} hrs</strong></span>
        </div>

        <div style="margin-top:10px; font-size:0.8rem; display:flex; gap:6px; flex-wrap:wrap;">
          <span style="color:var(--sage);">🟢 ${s.present} Present</span>
          <span style="color:var(--accent-amber);">🟡 ${s.late} Late</span>
          <span style="color:var(--accent-blue);">🟠 ${s.partial} Partial</span>
          <span style="color:var(--rule-red);">🔴 ${s.absent} Absent</span>
        </div>
      </div>
    `;
    })
    .join("");
}

// ---------- 4. Interactive Visual Calendar ----------
async function loadCalendar(year, month) {
  try {
    currentCalendarYear = year;
    currentCalendarMonth = month;

    const data = await apiCall(`/attendance/calendar?year=${year}&month=${month}`);
    currentCalendarDays = data.days || {};

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    const label = document.getElementById("cal-month-year-label");
    if (label) label.textContent = `${monthNames[month - 1]} ${year}`;

    renderCalendarGrid(year, month, currentCalendarDays);
  } catch (err) {
    console.error("Failed to load calendar:", err);
  }
}

function navigateCalendar(delta) {
  currentCalendarMonth += delta;
  if (currentCalendarMonth > 12) {
    currentCalendarMonth = 1;
    currentCalendarYear++;
  } else if (currentCalendarMonth < 1) {
    currentCalendarMonth = 12;
    currentCalendarYear--;
  }
  loadCalendar(currentCalendarYear, currentCalendarMonth);
}

function jumpToCurrentMonth() {
  const now = new Date();
  loadCalendar(now.getFullYear(), now.getMonth() + 1);
}

function renderCalendarGrid(year, month, daysData) {
  const container = document.getElementById("calendar-cells-container");
  if (!container) return;

  container.innerHTML = "";

  const firstDayIndex = new Date(year, month - 1, 1).getDay(); // 0 (Sun) to 6 (Sat)
  const totalDaysInMonth = new Date(year, month, 0).getDate();
  const prevMonthTotalDays = new Date(year, month - 1, 0).getDate();

  const todayStr = getLocalDateString(new Date());

  // 1. Previous Month Leading Days
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dayNum = prevMonthTotalDays - i;
    const cell = document.createElement("div");
    cell.className = "calendar-day-cell other-month";
    cell.innerHTML = `<span class="calendar-day-num">${dayNum}</span>`;
    container.appendChild(cell);
  }

  // 2. Current Month Days
  for (let d = 1; d <= totalDaysInMonth; d++) {
    const dayDateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayInfo = daysData[dayDateStr];

    const cell = document.createElement("div");
    cell.className = "calendar-day-cell";
    if (dayDateStr === todayStr) cell.classList.add("today");

    let dotsHtml = "";
    if (dayInfo && dayInfo.records && dayInfo.records.length > 0) {
      dotsHtml = dayInfo.records
        .map((r) => `<span class="cal-dot ${r.status || 'present'}" title="${escapeHtml(r.subject)} (${r.status})"></span>`)
        .join("");
    }

    cell.innerHTML = `
      <div class="flex-between">
        <span class="calendar-day-num">${d}</span>
        ${dayInfo ? `<span style="font-size:0.75rem; font-weight:600; color:var(--ink-soft);">${dayInfo.records.length}</span>` : ""}
      </div>
      <div class="calendar-day-dots">${dotsHtml}</div>
    `;

    cell.onclick = () => openCalendarDayModal(dayDateStr, dayInfo);
    container.appendChild(cell);
  }

  // 3. Trailing Days to complete the grid (up to 42 cells or full weeks)
  const totalRendered = firstDayIndex + totalDaysInMonth;
  const remaining = (7 - (totalRendered % 7)) % 7;
  for (let r = 1; r <= remaining; r++) {
    const cell = document.createElement("div");
    cell.className = "calendar-day-cell other-month";
    cell.innerHTML = `<span class="calendar-day-num">${r}</span>`;
    container.appendChild(cell);
  }
}

// Calendar Day Detail Modal
function openCalendarDayModal(dateStr, dayInfo) {
  const modal = document.getElementById("cal-day-modal");
  const title = document.getElementById("cal-day-modal-title");
  const subtitle = document.getElementById("cal-day-modal-subtitle");
  const list = document.getElementById("cal-day-sessions-list");

  if (!modal || !title || !list) return;

  title.textContent = `📅 Attendance Details: ${dateStr}`;

  if (!dayInfo || !dayInfo.records || dayInfo.records.length === 0) {
    subtitle.textContent = "No lecture attendance recorded on this day.";
    list.innerHTML = `
      <div style="text-align:center; padding: 20px;" class="muted">
        <p>No class sessions were logged for this date.</p>
        <button class="btn btn-primary" onclick="closeCalendarDayModal(); openQuickCheckInModal();" style="margin-top:10px;">
          + Log Attendance for this Day
        </button>
      </div>
    `;
  } else {
    subtitle.textContent = `${dayInfo.records.length} class session${dayInfo.records.length === 1 ? "" : "s"} logged:`;
    list.innerHTML = dayInfo.records
      .map((r) => {
        const inTime = r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "N/A";
        const outTime = r.checkOutTime ? new Date(r.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Ongoing";
        return `
        <div class="card" style="margin-bottom:10px; padding: 14px 16px;">
          <div class="flex-between">
            <h4 style="margin:0;">${escapeHtml(r.subject)}</h4>
            <span class="att-badge badge-${r.status || 'present'}">${r.status || 'present'}</span>
          </div>
          <div class="muted" style="font-size:0.86rem; margin-top:4px;">
            Teacher: ${escapeHtml(r.teacher || 'Instructor')} · Tag: ${escapeHtml(r.subjectTag || r.subject)}
          </div>
          <div class="flex-between" style="font-size:0.86rem; margin-top:8px; color:var(--ink);">
            <span>⏱️ <strong>${inTime}</strong> → <strong>${outTime}</strong></span>
            <span>Duration: <strong>${r.durationMinutes || 0} mins</strong></span>
          </div>
          ${r.lectureId ? `
            <div style="margin-top:10px; display:flex; gap:8px;">
              <a href="notes.html?id=${r.lectureId}" class="btn btn-ghost" style="padding:4px 10px; font-size:0.82rem;">📒 Smart Notes</a>
              <a href="quiz.html?id=${r.lectureId}" class="btn btn-ghost" style="padding:4px 10px; font-size:0.82rem;">🧠 Quiz</a>
            </div>
          ` : ""}
        </div>
      `;
      })
      .join("");
  }

  modal.classList.remove("hidden");
}

function closeCalendarDayModal() {
  const modal = document.getElementById("cal-day-modal");
  if (modal) modal.classList.add("hidden");
}

// ---------- 5. Attendance History Tab ----------
async function loadHistory() {
  try {
    const data = await apiCall("/attendance/history");
    currentHistoryData = data.records || [];
    renderHistoryTable(currentHistoryData);
  } catch (err) {
    console.error("Failed to load history:", err);
  }
}

function filterHistory() {
  const searchInput = document.getElementById("history-search");
  const subjectSelect = document.getElementById("history-subject-filter");
  const statusSelect = document.getElementById("history-status-filter");

  const query = (searchInput ? searchInput.value : "").trim().toLowerCase();
  const sub = subjectSelect ? subjectSelect.value : "all";
  const st = statusSelect ? statusSelect.value : "all";

  let filtered = currentHistoryData.filter((r) => {
    if (sub !== "all" && r.subject.toLowerCase() !== sub.toLowerCase() && (r.subjectTag || "").toLowerCase() !== sub.toLowerCase()) {
      return false;
    }
    if (st !== "all" && r.status !== st) {
      return false;
    }
    if (query) {
      const match = (r.subject && r.subject.toLowerCase().includes(query)) ||
                    (r.teacher && r.teacher.toLowerCase().includes(query)) ||
                    (r.dayOfWeek && r.dayOfWeek.toLowerCase().includes(query)) ||
                    (r.remarks && r.remarks.toLowerCase().includes(query));
      if (!match) return false;
    }
    return true;
  });

  renderHistoryTable(filtered);
}

function renderHistoryTable(records) {
  const tbody = document.getElementById("history-table-body");
  if (!tbody) return;

  if (records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px;" class="muted">No matching attendance records found.</td></tr>`;
    return;
  }

  tbody.innerHTML = records
    .map((r) => {
      const inTime = r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "-";
      const outTime = r.checkOutTime ? new Date(r.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Active";
      const dur = r.durationMinutes > 0 ? `${r.durationMinutes}m` : "-";

      return `
      <tr>
        <td>
          <strong>${r.date}</strong><br/>
          <span class="muted" style="font-size:0.8rem;">${r.dayOfWeek || ""}</span>
        </td>
        <td>
          <strong>${escapeHtml(r.subject)}</strong><br/>
          <span class="muted" style="font-size:0.8rem;">${escapeHtml(r.subjectTag || "")}</span>
        </td>
        <td>${escapeHtml(r.teacher || "Instructor")}</td>
        <td>
          <span style="font-family:var(--font-mono); font-size:0.85rem;">${inTime}</span> → 
          <span style="font-family:var(--font-mono); font-size:0.85rem;">${outTime}</span>
        </td>
        <td><strong>${dur}</strong></td>
        <td><span class="att-badge badge-${r.status || 'present'}">${r.status || 'present'}</span></td>
        <td><span class="tag" style="font-size:0.75rem; text-transform:uppercase;">${r.method || 'auto'}</span></td>
        <td>
          ${r.notesAvailable || r.lectureId ? `
            <div style="display:flex; gap:6px;">
              <a href="notes.html?id=${r.lectureId}" class="btn btn-ghost" style="padding:3px 8px; font-size:0.78rem;">📒 Notes</a>
              <a href="quiz.html?id=${r.lectureId}" class="btn btn-ghost" style="padding:3px 8px; font-size:0.78rem;">🧠 Quiz</a>
            </div>
          ` : `<span class="muted" style="font-size:0.8rem;">No lecture notes</span>`}
        </td>
      </tr>
    `;
    })
    .join("");
}

function populateSubjectFilters(subjects) {
  const historySelect = document.getElementById("history-subject-filter");
  const rosterSelect = document.getElementById("teacher-roster-subject-filter");

  if (!historySelect) return;

  const currentVal = historySelect.value;
  historySelect.innerHTML = `<option value="all">All Subjects</option>`;

  if (rosterSelect) {
    rosterSelect.innerHTML = `<option value="all">All Subjects</option>`;
  }

  subjects.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.subject;
    opt.textContent = s.subject;
    historySelect.appendChild(opt);

    if (rosterSelect) {
      const opt2 = document.createElement("option");
      opt2.value = s.subject;
      opt2.textContent = s.subject;
      rosterSelect.appendChild(opt2);
    }
  });

  historySelect.value = currentVal || "all";
}

// ---------- 6. Monthly Reports Table ----------
function renderMonthlyReport(monthly) {
  const tbody = document.getElementById("monthly-report-tbody");
  if (!tbody) return;

  if (monthly.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px;" class="muted">No monthly records yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = monthly
    .map((m) => {
      const isLow = m.percentage < 75;
      return `
      <tr>
        <td><strong>${m.monthKey}</strong></td>
        <td>${m.total}</td>
        <td><strong>${m.attended}</strong></td>
        <td>${m.hours} hrs</td>
        <td>
          <span style="font-weight:700; color:${m.percentage >= 85 ? 'var(--sage)' : m.percentage >= 75 ? 'var(--accent-amber)' : 'var(--rule-red)'};">
            ${m.percentage}%
          </span>
        </td>
        <td>
          <span class="att-badge ${isLow ? 'badge-absent' : 'badge-present'}">
            ${isLow ? 'Shortage Warning' : 'Good Standing'}
          </span>
        </td>
      </tr>
    `;
    })
    .join("");
}

// ---------- 7. Quick Check-In Modal ----------
function openQuickCheckInModal() {
  const modal = document.getElementById("quick-checkin-modal");
  if (modal) modal.classList.remove("hidden");
}

function closeQuickCheckInModal() {
  const modal = document.getElementById("quick-checkin-modal");
  if (modal) modal.classList.add("hidden");
  const msg = document.getElementById("quick-modal-msg");
  if (msg) msg.innerHTML = "";
}

async function handleQuickCheckIn(e) {
  e.preventDefault();
  const subject = document.getElementById("quick-subject").value;
  const subjectTag = document.getElementById("quick-tag").value;
  const teacher = document.getElementById("quick-teacher").value;
  const duration = parseInt(document.getElementById("quick-duration").value) || 60;
  const msg = document.getElementById("quick-modal-msg");

  try {
    const res = await apiCall("/attendance/check-in", "POST", {
      subject,
      subjectTag,
      teacher,
      scheduledDurationMinutes: duration,
      method: "manual"
    });

    if (res.isDuplicate) {
      msg.innerHTML = `<p style="color:var(--accent-amber); margin-top:8px;">ℹ️ ${res.message}</p>`;
    } else {
      msg.innerHTML = `<p class="success-msg">✅ ${res.message}</p>`;
    }

    setTimeout(() => {
      closeQuickCheckInModal();
      loadSummary();
      loadCalendar(currentCalendarYear, currentCalendarMonth);
      loadHistory();
    }, 1200);
  } catch (err) {
    msg.innerHTML = `<p class="error-msg">${err.message}</p>`;
  }
}

// ---------- 8. Session PIN / QR Check-In ----------
async function handlePinCheckIn(e) {
  e.preventDefault();
  const sessionCode = document.getElementById("input-session-pin").value;
  const subject = document.getElementById("input-pin-subject").value;
  const msg = document.getElementById("pin-checkin-msg");

  if (!sessionCode) return;

  try {
    const res = await apiCall("/attendance/check-in", "POST", {
      sessionCode: sessionCode.trim().toUpperCase(),
      subject: subject || undefined,
      method: "code"
    });

    if (res.isDuplicate) {
      msg.innerHTML = `<div class="card" style="background:rgba(232, 163, 61, 0.1); margin-top:12px; padding:12px; border-left-color:var(--accent-amber);">
        <strong style="color:var(--accent-amber);">Already Checked-In:</strong>
        <p style="margin:4px 0 0; font-size:0.9rem;">${res.message}</p>
      </div>`;
    } else {
      msg.innerHTML = `<div class="card" style="background:rgba(110, 159, 92, 0.1); margin-top:12px; padding:12px; border-left-color:var(--sage);">
        <strong style="color:var(--sage);">Checked In Successfully!</strong>
        <p style="margin:4px 0 0; font-size:0.9rem;">${res.message} Status: <strong>${res.record.status.toUpperCase()}</strong></p>
      </div>`;
    }

    loadSummary();
    loadCalendar(currentCalendarYear, currentCalendarMonth);
    loadHistory();
  } catch (err) {
    msg.innerHTML = `<p class="error-msg" style="margin-top:10px;">${err.message}</p>`;
  }
}

// Live Camera Scan Simulator
async function toggleWebcamScanner() {
  const video = document.getElementById("qr-video-preview");
  const placeholder = document.getElementById("qr-camera-placeholder");
  const btn = document.getElementById("btn-toggle-cam");

  if (videoStream) {
    videoStream.getTracks().forEach((track) => track.stop());
    videoStream = null;
    video.style.display = "none";
    placeholder.style.display = "flex";
    btn.textContent = "Start Camera Scan";
  } else {
    try {
      videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      video.srcObject = videoStream;
      video.style.display = "block";
      placeholder.style.display = "none";
      btn.textContent = "Stop Camera Scan";
    } catch (err) {
      alert("Camera access was not permitted or is unavailable. You can type the 6-digit session PIN directly!");
    }
  }
}

// Test / Simulate QR scan
async function simulateQrScan() {
  const simulatedCode = "NP-1001";
  const pinInput = document.getElementById("input-session-pin");
  if (pinInput) pinInput.value = simulatedCode;
  
  const form = document.getElementById("pin-checkin-form");
  if (form) {
    const fakeEvent = { preventDefault: () => {} };
    handlePinCheckIn(fakeEvent);
  }
}

// ---------- 9. Teacher View & Roster Management ----------
function openCreateSessionModal() {
  const modal = document.getElementById("teacher-session-modal");
  const now = new Date();
  const startInput = document.getElementById("session-start");
  const endInput = document.getElementById("session-end");

  if (startInput) startInput.value = now.toTimeString().substring(0, 5);
  if (endInput) {
    const later = new Date(now.getTime() + 60 * 60000);
    endInput.value = later.toTimeString().substring(0, 5);
  }

  if (modal) modal.classList.remove("hidden");
}

let lastGeneratedSession = null;

function closeCreateSessionModal() {
  const modal = document.getElementById("teacher-session-modal");
  if (modal) modal.classList.add("hidden");
  const msg = document.getElementById("teacher-modal-msg");
  if (msg) msg.innerHTML = "";
  const btn = document.getElementById("btn-generate-session");
  if (btn) {
    btn.disabled = false;
    btn.textContent = "Generate Session & QR 🔲";
  }
}

// Fallback Canvas QR Matrix Generator (zero external dependency)
function drawFallbackQrCode(container, qrText, codeString) {
  container.innerHTML = "";
  const canvas = document.createElement("canvas");
  canvas.width = 170;
  canvas.height = 170;
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, 170, 170);

  // Draw simulated 2D barcode matrix
  ctx.fillStyle = "#1B1F3B";
  const size = 17;
  const cellSize = 10;

  // Simple pseudo-random hash generator for deterministic patterns
  let hash = 0;
  for (let i = 0; i < qrText.length; i++) {
    hash = ((hash << 5) - hash) + qrText.charCodeAt(i);
    hash |= 0;
  }

  // Draw QR corner positional squares
  function drawCorner(r, c) {
    ctx.fillRect(c * cellSize, r * cellSize, 7 * cellSize, 7 * cellSize);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect((c + 1) * cellSize, (r + 1) * cellSize, 5 * cellSize, 5 * cellSize);
    ctx.fillStyle = "#1B1F3B";
    ctx.fillRect((c + 2) * cellSize, (r + 2) * cellSize, 3 * cellSize, 3 * cellSize);
  }

  drawCorner(0, 0); // Top-left
  drawCorner(0, 10); // Top-right
  drawCorner(10, 0); // Bottom-left

  // Fill data cells
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if ((r < 7 && c < 7) || (r < 7 && c >= 10) || (r >= 10 && c < 7)) continue;
      const bit = Math.abs((hash ^ (r * 31 + c * 17))) % 3;
      if (bit === 1) {
        ctx.fillRect(c * cellSize, r * cellSize, cellSize - 1, cellSize - 1);
      }
    }
  }

  container.appendChild(canvas);
}

async function handleCreateTeacherSession(e) {
  e.preventDefault();
  const subject = document.getElementById("session-subject").value;
  const subjectTag = document.getElementById("session-tag").value;
  const startTime = document.getElementById("session-start").value;
  const endTime = document.getElementById("session-end").value;
  const msg = document.getElementById("teacher-modal-msg");
  const btn = document.getElementById("btn-generate-session");

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Generating...";
  }

  try {
    const res = await apiCall("/attendance/teacher/session", "POST", {
      subject,
      subjectTag,
      startTime,
      endTime
    });

    lastGeneratedSession = res.session;

    const view = document.getElementById("generated-session-qr-view");
    const pinText = document.getElementById("generated-session-pin-text");
    const codeSub = document.getElementById("generated-session-code-sub");
    const canvasHolder = document.getElementById("generated-qr-canvas-holder");
    const actionMsg = document.getElementById("generated-session-action-msg");

    if (view && pinText && canvasHolder) {
      view.classList.remove("hidden");
      pinText.textContent = res.session.code;
      if (codeSub) codeSub.textContent = res.session.code;
      if (actionMsg) actionMsg.innerHTML = "";

      // Render QR Code via QRCode.js or Fallback Canvas Generator
      canvasHolder.innerHTML = "";
      const qrPayload = JSON.stringify({
        app: "NotesPilotAI",
        sessionId: res.session.id,
        sessionCode: res.session.code,
        subject: res.session.subject
      });

      if (typeof QRCode !== "undefined") {
        try {
          new QRCode(canvasHolder, {
            text: qrPayload,
            width: 170,
            height: 170,
            colorDark: "#1B1F3B",
            colorLight: "#FFFFFF",
            correctLevel: QRCode.CorrectLevel.M
          });
        } catch (qrErr) {
          drawFallbackQrCode(canvasHolder, qrPayload, res.session.code);
        }
      } else {
        drawFallbackQrCode(canvasHolder, qrPayload, res.session.code);
      }
    }

    if (msg) msg.innerHTML = `<p class="success-msg" style="margin-top:10px;">✅ ${res.message}</p>`;

    loadTeacherSessions();
    loadTeacherRoster();
  } catch (err) {
    if (msg) msg.innerHTML = `<p class="error-msg" style="margin-top:10px;">❌ ${err.message}</p>`;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Generate Session & QR 🔲";
    }
  }
}

// 1-Click Test Check-In to Generated Session
async function quickCheckInToGeneratedSession() {
  if (!lastGeneratedSession) return;
  const actionMsg = document.getElementById("generated-session-action-msg");

  try {
    const res = await apiCall("/attendance/check-in", "POST", {
      sessionId: lastGeneratedSession.id,
      sessionCode: lastGeneratedSession.code,
      method: "qr"
    });

    if (actionMsg) {
      actionMsg.innerHTML = `<p class="success-msg" style="font-weight:600;">✅ ${res.message} Status: ${res.record.status.toUpperCase()}</p>`;
    }

    loadSummary();
    loadCalendar(currentCalendarYear, currentCalendarMonth);
    loadHistory();
    loadTeacherRoster();
  } catch (err) {
    if (actionMsg) {
      actionMsg.innerHTML = `<p class="error-msg">${err.message}</p>`;
    }
  }
}

async function loadTeacherSessions() {
  const container = document.getElementById("teacher-sessions-list");
  if (!container) return;

  try {
    const data = await apiCall("/attendance/teacher/sessions");
    const sessions = data.sessions || [];

    if (sessions.length === 0) {
      container.innerHTML = `<p class="muted">No active sessions yet. Create one above!</p>`;
      return;
    }

    container.innerHTML = sessions
      .slice(0, 6)
      .map((s) => `
      <div class="card" style="margin-bottom:0; padding:16px;">
        <div class="flex-between">
          <h4 style="margin:0;">${escapeHtml(s.subject)}</h4>
          <span class="session-pin-badge" style="font-size:1rem; padding:3px 10px; margin:0;">${s.code}</span>
        </div>
        <div class="muted" style="font-size:0.84rem; margin-top:6px;">
          ${s.date} · ${s.dayOfWeek} · ${s.startTime} - ${s.endTime}
        </div>
      </div>
    `)
      .join("");
  } catch (err) {
    console.error("Failed to load teacher sessions:", err);
  }
}

async function loadTeacherRoster() {
  const tbody = document.getElementById("teacher-roster-tbody");
  const subjectSelect = document.getElementById("teacher-roster-subject-filter");
  const subject = subjectSelect ? subjectSelect.value : "all";

  if (!tbody) return;

  try {
    const data = await apiCall(`/attendance/teacher/roster?subject=${encodeURIComponent(subject)}`);
    const roster = data.roster || [];

    if (roster.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px;" class="muted">No student attendance recorded for this filter.</td></tr>`;
      return;
    }

    tbody.innerHTML = roster
      .map((r) => {
        const inTime = r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "-";
        const outTime = r.checkOutTime ? new Date(r.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Active";
        const dur = r.durationMinutes > 0 ? `${r.durationMinutes}m` : "-";

        return `
        <tr>
          <td>
            <strong>${escapeHtml(r.userName || "Student")}</strong><br/>
            <span class="muted" style="font-size:0.8rem;">${escapeHtml(r.userEmail || "")}</span>
          </td>
          <td><strong>${escapeHtml(r.subject)}</strong></td>
          <td>${r.date} (${r.dayOfWeek})</td>
          <td><span style="font-family:var(--font-mono); font-size:0.85rem;">${inTime}</span></td>
          <td><span style="font-family:var(--font-mono); font-size:0.85rem;">${outTime}</span></td>
          <td><strong>${dur}</strong></td>
          <td>
            <select style="padding:4px 8px; font-size:0.85rem;" onchange="overrideStatus('${r.id}', this.value)">
              <option value="present" ${r.status === 'present' ? 'selected' : ''}>🟢 Present</option>
              <option value="late" ${r.status === 'late' ? 'selected' : ''}>🟡 Late</option>
              <option value="partial" ${r.status === 'partial' ? 'selected' : ''}>🟠 Partial</option>
              <option value="absent" ${r.status === 'absent' ? 'selected' : ''}>🔴 Absent</option>
            </select>
          </td>
          <td>
            <span class="muted" style="font-size:0.8rem;">${escapeHtml(r.remarks || "No remarks")}</span>
          </td>
        </tr>
      `;
      })
      .join("");
  } catch (err) {
    console.error("Failed to load teacher roster:", err);
  }
}

async function overrideStatus(attendanceId, newStatus) {
  try {
    await apiCall(`/attendance/teacher/override/${attendanceId}`, "PATCH", { status: newStatus });
    loadSummary();
    loadTeacherRoster();
  } catch (err) {
    alert("Failed to update status: " + err.message);
  }
}

// ---------- 10. Export CSV ----------
function exportAttendanceCsv() {
  const token = getToken();
  window.location.href = `${API_BASE}/attendance/export-csv?token=${token || ""}`;
}
