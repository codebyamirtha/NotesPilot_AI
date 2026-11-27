// ================================================================
// planner.js
// Feature: Visual Weekly Study Planner Timetable & AI Exam Sprint
// ================================================================

requireAuth();
renderNavbar("planner.html");

const PRESET_COLORS = [
  "#4E8FB8", // Ocean Blue
  "#E63946", // Coral Red
  "#2A9D8F", // Teal Green
  "#E76F51", // Burnt Sienna
  "#8E44AD", // Deep Violet
  "#E8A33D", // Warm Amber
  "#2B7A78", // Pine Emerald
  "#6D597A", // Slate Mauve
  "#3D5A80", // Navy Slate
  "#588157"  // Sage Forest
];

const DAYS_OF_WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_LABELS = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun"
};

const TIME_HOURS = [
  "07:00", "08:00", "09:00", "10:00", "11:00", "12:00",
  "13:00", "14:00", "15:00", "16:00", "17:00", "18:00",
  "19:00", "20:00", "21:00"
];

// State
let activeTab = "timetable";
let timetableData = [];
let availableSubjects = [];
let availableLectures = [];
let activeSubjectFilter = "ALL";
let selectedModalColor = PRESET_COLORS[0];
let currentSprintPlan = null;

// ================================================================
// TAB SWITCHER
// ================================================================
function switchPlannerTab(tabName) {
  activeTab = tabName;
  const ttBtn = document.getElementById("tab-btn-timetable");
  const spBtn = document.getElementById("tab-btn-sprint");
  const ttContent = document.getElementById("timetable-tab-content");
  const spContent = document.getElementById("sprint-tab-content");

  if (tabName === "timetable") {
    ttBtn.classList.add("active");
    spBtn.classList.remove("active");
    ttContent.classList.remove("hidden");
    spContent.classList.add("hidden");
  } else {
    spBtn.classList.add("active");
    ttBtn.classList.remove("active");
    spContent.classList.remove("hidden");
    ttContent.classList.add("hidden");
    if (!currentSprintPlan) loadCurrentPlan();
  }
}

// ================================================================
// TIMETABLE CORE: FETCH & RENDER
// ================================================================
async function loadTimetable() {
  try {
    const res = await apiCall("/planner/timetable");
    timetableData = res.timetable || [];
    availableSubjects = res.subjects || [];
    availableLectures = res.lectures || [];

    renderTimetableHeader();
    renderSubjectFilters();
    renderTimetableStats(res.stats);
    renderSubjectDistribution(res.stats.subjectBreakdown, res.stats.totalHours);
    renderTimetableGrid();
  } catch (err) {
    console.error("Error loading timetable:", err);
  }
}

function formatTime12(time24) {
  if (!time24) return "";
  const [hStr, mStr] = time24.split(":");
  let h = parseInt(hStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${mStr} ${ampm}`;
}

function getTodayDayName() {
  const dayIndex = new Date().getDay(); // 0 is Sunday, 1 is Monday ...
  const map = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return map[dayIndex];
}

function renderTimetableHeader() {
  const today = getTodayDayName();
  DAYS_OF_WEEK.forEach((d) => {
    const th = document.getElementById(`th-${d}`);
    if (th) {
      const isToday = d === today;
      th.innerHTML = `${DAY_LABELS[d]} ${isToday ? '<span style="font-size:0.7rem; background:var(--accent-blue); color:#fff; padding:1px 5px; border-radius:4px; margin-left:2px;">TODAY</span>' : ""}`;
      if (isToday) {
        th.classList.add("today-header");
      } else {
        th.classList.remove("today-header");
      }
    }
  });
}

function renderSubjectFilters() {
  const container = document.getElementById("subject-filter-container");
  if (!container) return;

  let html = `<span class="sub-filter-pill ${activeSubjectFilter === "ALL" ? "active" : ""}" onclick="filterBySubject('ALL')">🌐 All Subjects</span>`;

  availableSubjects.forEach((sub) => {
    const isActive = activeSubjectFilter === sub.name;
    html += `
      <span class="sub-filter-pill ${isActive ? "active" : ""}" onclick="filterBySubject('${escapeAttr(sub.name)}')">
        <span style="width:8px; height:8px; border-radius:50%; background:${sub.color}; display:inline-block;"></span>
        ${escapeHtml(sub.name)}
      </span>
    `;
  });

  container.innerHTML = html;
}

function filterBySubject(subjectName) {
  activeSubjectFilter = subjectName;
  renderSubjectFilters();
  renderTimetableGrid();
}

function renderTimetableStats(stats) {
  if (!stats) return;
  const hoursEl = document.getElementById("tt-stat-hours");
  const compEl = document.getElementById("tt-stat-completed");
  const progEl = document.getElementById("tt-stat-progress");
  const subsEl = document.getElementById("tt-stat-subjects");

  if (hoursEl) hoursEl.textContent = `${stats.totalHours} hrs`;
  if (compEl) compEl.textContent = `${stats.completedHours} hrs`;
  if (progEl) progEl.textContent = `${stats.completedPercentage}%`;
  if (subsEl) subsEl.textContent = availableSubjects.length;
}

function renderSubjectDistribution(breakdown, totalHours) {
  const bar = document.getElementById("subject-dist-bar");
  const legend = document.getElementById("subject-dist-legend");
  const totalLbl = document.getElementById("dist-total-lbl");

  if (totalLbl) totalLbl.textContent = `${totalHours || 0} Total Weekly Hours`;

  if (!breakdown || breakdown.length === 0 || totalHours === 0) {
    if (bar) bar.innerHTML = `<div class="subject-dist-segment" style="width:100%; background:var(--paper-line);"></div>`;
    if (legend) legend.innerHTML = `<span class="muted">No study sessions scheduled yet. Click any slot or auto-generate below!</span>`;
    return;
  }

  if (bar) {
    bar.innerHTML = breakdown
      .map(
        (b) =>
          `<div class="subject-dist-segment" style="width:${b.percentage}%; background:${b.color};" title="${escapeHtml(b.subject)}: ${b.hours} hrs (${b.percentage}%)"></div>`
      )
      .join("");
  }

  if (legend) {
    legend.innerHTML = breakdown
      .map(
        (b) => `
        <div class="legend-item">
          <span class="legend-dot" style="background:${b.color};"></span>
          <span><strong>${escapeHtml(b.subject)}</strong> · ${b.hours}h (${b.percentage}%)</span>
        </div>
      `
      )
      .join("");
  }
}

function renderTimetableGrid() {
  const tbody = document.getElementById("timetable-tbody");
  if (!tbody) return;

  const today = getTodayDayName();

  // Filter slots if a subject filter is selected
  const filteredSlots = activeSubjectFilter === "ALL"
    ? timetableData
    : timetableData.filter((s) => s.subject.toLowerCase() === activeSubjectFilter.toLowerCase());

  let rowsHtml = "";

  TIME_HOURS.forEach((timeHour) => {
    const hourInt = parseInt(timeHour.split(":")[0], 10);
    const displayTime = formatTime12(timeHour);

    let cellsHtml = `<td class="time-col">${displayTime}</td>`;

    DAYS_OF_WEEK.forEach((day) => {
      const isToday = day === today;
      const todayClass = isToday ? "today-col" : "";

      // Find slots starting in this hour (e.g. 09:00 - 09:59)
      const matchingSlots = filteredSlots.filter((slot) => {
        if (slot.day.toLowerCase() !== day) return false;
        const slotHour = parseInt(slot.startTime.split(":")[0], 10);
        return slotHour === hourInt;
      });

      let cardsHtml = "";
      matchingSlots.forEach((slot) => {
        const completedClass = slot.completed ? "completed" : "";
        const checkIcon = slot.completed ? "✅" : "⭕";
        const lectureBadge = slot.lectureId 
          ? `<a href="notes.html?id=${slot.lectureId}" onclick="event.stopPropagation();" title="Jump to lecture note" style="font-size:0.75rem; text-decoration:none; margin-left:4px;">📒</a>`
          : "";

        cardsHtml += `
          <div class="tt-session-card ${completedClass}" style="border-left-color:${slot.color};" onclick="openEditSessionModal('${slot.id}', event)">
            <div class="tt-card-header">
              <span class="tt-subject-badge" style="background:${slot.color};">${escapeHtml(slot.subject)}</span>
              <span class="tt-time-badge">${slot.startTime} - ${slot.endTime}</span>
            </div>
            <div class="tt-title">${escapeHtml(slot.topic || slot.subject)} ${lectureBadge}</div>
            <div class="tt-footer-actions">
              <button class="tt-check-btn" onclick="toggleSlotCompletion('${slot.id}', event)">
                ${checkIcon} ${slot.completed ? "Done" : "Mark Done"}
              </button>
              <span class="muted" style="font-size:0.7rem;">✏️ Edit</span>
            </div>
          </div>
        `;
      });

      // Quick-add trigger cell
      const nextHour = String(hourInt + 1).padStart(2, "0") + ":30";
      cellsHtml += `
        <td class="day-slot ${todayClass}" onclick="openQuickAddModal('${day}', '${timeHour}', '${nextHour}', event)">
          ${cardsHtml}
          <div class="slot-add-placeholder">➕ Add Session</div>
        </td>
      `;
    });

    rowsHtml += `<tr>${cellsHtml}</tr>`;
  });

  tbody.innerHTML = rowsHtml;
}

// ================================================================
// MODAL MANAGEMENT (CREATE & EDIT)
// ================================================================
function openQuickAddModal(day, startTime, defaultEndTime, event) {
  // If user clicked inside a card or button, avoid opening quick add
  if (event && (event.target.closest(".tt-session-card") || event.target.closest("button") || event.target.closest("a"))) {
    return;
  }
  openSessionModal({ day, startTime, endTime: defaultEndTime || "10:30" });
}

function openSessionModal(defaults = {}) {
  const modal = document.getElementById("session-modal");
  const form = document.getElementById("session-form");
  form.reset();

  document.getElementById("modal-title").textContent = "➕ Add Study Session";
  document.getElementById("modal-session-id").value = "";
  document.getElementById("modal-delete-btn").style.display = "none";
  document.getElementById("modal-save-btn").textContent = "Save Session";

  // Set Day & Times
  document.getElementById("modal-day").value = defaults.day || "monday";
  document.getElementById("modal-start-time").value = defaults.startTime || "09:00";
  document.getElementById("modal-end-time").value = defaults.endTime || "10:30";
  document.getElementById("modal-topic").value = defaults.topic || "";
  document.getElementById("modal-notes").value = defaults.notes || "";

  // Populate Subject Select
  populateSubjectDropdown(defaults.subject);
  // Populate Lecture Select
  populateLectureDropdown(defaults.lectureId);
  // Color palette
  renderColorPalette(defaults.color || PRESET_COLORS[0]);

  modal.classList.remove("hidden");
}

function openEditSessionModal(sessionId, event) {
  if (event) event.stopPropagation();
  const slot = timetableData.find((s) => s.id === sessionId);
  if (!slot) return;

  const modal = document.getElementById("session-modal");
  document.getElementById("modal-title").textContent = "✏️ Edit Study Session";
  document.getElementById("modal-session-id").value = slot.id;
  document.getElementById("modal-delete-btn").style.display = "inline-block";
  document.getElementById("modal-save-btn").textContent = "Update Session";

  document.getElementById("modal-day").value = slot.day;
  document.getElementById("modal-start-time").value = slot.startTime;
  document.getElementById("modal-end-time").value = slot.endTime;
  document.getElementById("modal-topic").value = slot.topic || "";
  document.getElementById("modal-notes").value = slot.notes || "";

  populateSubjectDropdown(slot.subject);
  populateLectureDropdown(slot.lectureId);
  renderColorPalette(slot.color || PRESET_COLORS[0]);

  modal.classList.remove("hidden");
}

function closeSessionModal() {
  const modal = document.getElementById("session-modal");
  if (modal) modal.classList.add("hidden");
}

function populateSubjectDropdown(selectedSubject) {
  const select = document.getElementById("modal-subject-select");
  const customInput = document.getElementById("modal-subject-custom");
  customInput.style.display = "none";
  customInput.value = "";

  let html = `<option value="">-- Choose existing subject --</option>`;

  let foundMatch = false;
  availableSubjects.forEach((sub) => {
    const isSel = selectedSubject && sub.name.toLowerCase() === selectedSubject.toLowerCase();
    if (isSel) foundMatch = true;
    html += `<option value="${escapeAttr(sub.name)}" ${isSel ? "selected" : ""}>${escapeHtml(sub.name)}</option>`;
  });

  html += `<option value="__custom__" ${selectedSubject && !foundMatch ? "selected" : ""}>➕ Add New / Custom Subject...</option>`;
  select.innerHTML = html;

  if (selectedSubject && !foundMatch) {
    customInput.style.display = "block";
    customInput.value = selectedSubject;
  }
}

function onSubjectSelectChange() {
  const select = document.getElementById("modal-subject-select");
  const customInput = document.getElementById("modal-subject-custom");
  if (select.value === "__custom__") {
    customInput.style.display = "block";
    customInput.focus();
  } else {
    customInput.style.display = "none";
    // If selected an existing subject, auto-pick its color
    const matched = availableSubjects.find((s) => s.name.toLowerCase() === select.value.toLowerCase());
    if (matched) {
      renderColorPalette(matched.color);
    }
  }
}

function populateLectureDropdown(selectedLectureId) {
  const select = document.getElementById("modal-lecture-link");
  let html = `<option value="">-- None (Standalone study block) --</option>`;

  availableLectures.forEach((lec) => {
    const isSel = selectedLectureId === lec.id;
    html += `<option value="${lec.id}" ${isSel ? "selected" : ""}>${escapeHtml(lec.subject)} (Prof. ${escapeHtml(lec.teacher || "N/A")})</option>`;
  });

  select.innerHTML = html;
}

function renderColorPalette(currentColor) {
  selectedModalColor = currentColor || PRESET_COLORS[0];
  document.getElementById("modal-color").value = selectedModalColor;

  const mount = document.getElementById("color-palette-mount");
  if (!mount) return;

  mount.innerHTML = PRESET_COLORS.map(
    (c) => `
      <div 
        class="color-dot-choice ${c.toLowerCase() === selectedModalColor.toLowerCase() ? "selected" : ""}" 
        style="background:${c};" 
        onclick="pickModalColor('${c}')"
        title="Select color"
      ></div>
    `
  ).join("");
}

function pickModalColor(color) {
  selectedModalColor = color;
  document.getElementById("modal-color").value = color;
  renderColorPalette(color);
}

async function handleSessionFormSubmit(e) {
  e.preventDefault();

  const sessionId = document.getElementById("modal-session-id").value;
  const day = document.getElementById("modal-day").value;
  const startTime = document.getElementById("modal-start-time").value;
  const endTime = document.getElementById("modal-end-time").value;
  const subjectSelect = document.getElementById("modal-subject-select").value;
  const customSubject = document.getElementById("modal-subject-custom").value.trim();
  const topic = document.getElementById("modal-topic").value.trim();
  const lectureId = document.getElementById("modal-lecture-link").value || null;
  const color = document.getElementById("modal-color").value || PRESET_COLORS[0];
  const notes = document.getElementById("modal-notes").value.trim();

  let subject = subjectSelect;
  if (subjectSelect === "__custom__" || !subjectSelect) {
    subject = customSubject || "General Study";
  }

  if (!subject) {
    alert("Please select or enter a subject name.");
    return;
  }

  const payload = {
    day,
    startTime,
    endTime,
    subject,
    topic,
    lectureId,
    color,
    notes
  };

  try {
    if (sessionId) {
      await apiCall(`/planner/timetable/${sessionId}`, "PUT", payload);
    } else {
      await apiCall("/planner/timetable", "POST", payload);
    }
    closeSessionModal();
    await loadTimetable();
  } catch (err) {
    alert("Error saving session: " + err.message);
  }
}

async function deleteSessionFromModal() {
  const sessionId = document.getElementById("modal-session-id").value;
  if (!sessionId) return;
  if (!confirm("Are you sure you want to remove this study session from your timetable?")) return;

  try {
    await apiCall(`/planner/timetable/${sessionId}`, "DELETE");
    closeSessionModal();
    await loadTimetable();
  } catch (err) {
    alert("Error deleting session: " + err.message);
  }
}

async function toggleSlotCompletion(slotId, event) {
  if (event) event.stopPropagation();
  try {
    await apiCall(`/planner/timetable/${slotId}/toggle`, "PATCH");
    await loadTimetable();
  } catch (err) {
    alert("Error updating status: " + err.message);
  }
}

async function autoScheduleTimetable() {
  if (timetableData.length > 0) {
    const ok = confirm("Auto-scheduling will replace your current weekly slots with an optimal study timetable based on your lecture subjects. Continue?");
    if (!ok) return;
  }

  try {
    const res = await apiCall("/planner/timetable/auto-generate", "POST");
    alert("✅ " + res.message);
    await loadTimetable();
  } catch (err) {
    alert("Error generating timetable: " + err.message);
  }
}

async function clearTimetable() {
  if (timetableData.length === 0) return;
  if (!confirm("Are you sure you want to clear your entire weekly timetable?")) return;

  try {
    await apiCall("/planner/timetable/clear/all", "DELETE");
    await loadTimetable();
  } catch (err) {
    alert("Error clearing timetable: " + err.message);
  }
}

// ================================================================
// AI EXAM SPRINT PLANNER (TAB 2)
// ================================================================
function initDefaultDate() {
  const targetInput = document.getElementById("target-date");
  if (targetInput) {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    targetInput.value = nextWeek.toISOString().split("T")[0];
  }
}

async function loadCurrentPlan() {
  const view = document.getElementById("planner-view");
  if (!view) return;
  view.innerHTML = `<p class="muted">Loading study schedule...</p>`;

  try {
    const { plan } = await apiCall("/planner");
    currentSprintPlan = plan;

    if (!plan) {
      view.innerHTML = `
        <div style="text-align:center; padding:30px 10px;">
          <div style="font-size:3rem; margin-bottom:12px;">📆</div>
          <h3>No Active Exam Sprint Plan Yet</h3>
          <p class="muted" style="max-width:500px; margin:0 auto 18px;">
            Set your target exam date above and click <strong>Generate Personalized Study Schedule</strong>.
            NotesPilot AI will structure your lectures into daily manageable review milestones!
          </p>
        </div>`;
      return;
    }

    renderPlannerView(plan);
  } catch (err) {
    view.innerHTML = `<p class="error-msg">${err.message}</p>`;
  }
}

function renderPlannerView(plan) {
  const view = document.getElementById("planner-view");
  if (!view) return;

  let totalTasks = 0;
  let completedTasks = 0;

  plan.days.forEach((day) => {
    day.tasks.forEach((task) => {
      totalTasks++;
      if (task.completed) completedTasks++;
    });
  });

  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const daysHtml = plan.days
    .map((day) => {
      const tasksHtml = day.tasks
        .map((task) => {
          const checked = task.completed ? "checked" : "";
          const lineStyle = task.completed ? "text-decoration:line-through; opacity:0.6;" : "";
          
          let actionLink = "";
          if (task.lectureId) {
            actionLink = `<a href="notes.html?id=${task.lectureId}" style="font-size:0.8rem; margin-left:8px;">View Note →</a>`;
          } else if (task.type === "quiz") {
            actionLink = `<a href="quiz.html" style="font-size:0.8rem; margin-left:8px;">Quiz Hub →</a>`;
          }

          return `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-bottom:1px dashed var(--border);">
              <label style="display:flex; align-items:center; gap:10px; cursor:pointer; margin:0; flex:1;">
                <input type="checkbox" ${checked} onchange="toggleSprintTask('${task.id}', this.checked)" style="width:18px; height:18px; cursor:pointer;" />
                <span style="${lineStyle}">${escapeHtml(task.title)}</span>
              </label>
              <div style="display:flex; align-items:center; gap:6px;">
                <span class="tag" style="font-size:0.75rem;">${escapeHtml(task.subject)}</span>
                ${actionLink}
              </div>
            </div>`;
        })
        .join("");

      return `
        <div style="margin-bottom:20px; padding:16px; background:var(--paper); border:1px solid var(--border); border-radius:var(--radius);">
          <div class="flex-between" style="margin-bottom:10px;">
            <h4 style="margin:0;">Day ${day.dayIndex} · ${day.displayDate}</h4>
            <span class="muted" style="font-size:0.85rem;">${day.tasks.filter((t) => t.completed).length} / ${day.tasks.length} done</span>
          </div>
          <div>${tasksHtml}</div>
        </div>`;
    })
    .join("");

  view.innerHTML = `
    <div class="flex-between" style="flex-wrap:wrap; gap:12px; margin-bottom:16px;">
      <div>
        <h3 style="margin:0;">🎯 Exam Sprint Target: ${new Date(plan.targetDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</h3>
        <p class="muted" style="margin-top:4px;">${plan.totalDays} Days Schedule · Goal: ${plan.hoursPerDay} Hours / Day</p>
      </div>
      <div style="text-align:right;">
        <span style="font-size:1.4rem; font-weight:700; color:var(--ink);">${progressPercent}%</span>
        <div class="muted" style="font-size:0.8rem;">Sprint Plan Completed</div>
      </div>
    </div>

    <!-- Progress Bar -->
    <div style="width:100%; height:12px; background:var(--paper-line); border-radius:6px; overflow:hidden; margin-bottom:24px;">
      <div style="width:${progressPercent}%; height:100%; background:var(--accent-amber); transition:width 0.3s ease;"></div>
    </div>

    ${daysHtml}
  `;
}

async function toggleSprintTask(taskId, completed) {
  try {
    const { plan } = await apiCall(`/planner/tasks/${taskId}`, "PATCH", { completed });
    currentSprintPlan = plan;
    renderPlannerView(plan);
  } catch (err) {
    alert("Failed updating task: " + err.message);
  }
}

async function generatePlan() {
  const msg = document.getElementById("gen-msg");
  msg.textContent = "";
  msg.className = "";

  const targetDate = document.getElementById("target-date").value;
  const hoursPerDay = document.getElementById("hours-per-day").value;

  if (!targetDate) {
    msg.textContent = "Please select a target exam date.";
    msg.className = "error-msg";
    return;
  }

  const btn = document.getElementById("gen-btn");
  btn.disabled = true;
  btn.textContent = "Generating Schedule...";

  try {
    const { plan } = await apiCall("/planner/generate", "POST", { targetDate, hoursPerDay });
    currentSprintPlan = plan;
    renderPlannerView(plan);
    msg.textContent = "✅ New exam study schedule generated!";
    msg.className = "muted";
  } catch (err) {
    msg.textContent = err.message;
    msg.className = "error-msg";
  } finally {
    btn.disabled = false;
    btn.textContent = "⚡ Generate Personalized Study Schedule";
  }
}

// Helper sanitizers
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(str) {
  if (!str) return "";
  return String(str).replace(/"/g, "&quot;").replace(/'/g, "\\'");
}

// Initialize
initDefaultDate();
loadTimetable();
