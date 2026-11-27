// ================================================================
// dashboard.js - Feature 16: Dashboard & Learning Analytics
// Centralized Lecture Doubts & Solutions Checklist
// ================================================================

requireAuth();
renderNavbar("dashboard.html");

let allDoubtsList = [];
let currentDoubtFilter = "all";

async function loadDashboard() {
  try {
    const stats = await apiCall("/stats");

    // Attendance stats
    const att = stats.attendance || { percentage: 100, totalClasses: 0, attendedClasses: 0, learningHours: 0, isLow: false, lowSubjects: [] };
    const attColor = att.percentage >= 85 ? "var(--sage)" : att.percentage >= 75 ? "var(--accent-amber)" : "var(--rule-red)";

    const grid = document.getElementById("stat-grid");
    grid.innerHTML = `
      <div class="stat-card">
        <div class="value" style="color:${attColor};">${att.percentage}%</div>
        <div class="label">Attendance Rate</div>
      </div>
      <div class="stat-card">
        <div class="value" style="color:var(--accent-blue);">${att.attendedClasses} <span style="font-size:1rem; color:var(--ink-soft); font-weight:normal;">/ ${att.totalClasses}</span></div>
        <div class="label">Classes Attended</div>
      </div>
      <div class="stat-card">
        <div class="value" style="color:var(--sage);">${att.learningHours} <span style="font-size:1rem; color:var(--ink-soft); font-weight:normal;">hrs</span></div>
        <div class="label">Total Learning Hours</div>
      </div>
      <div class="stat-card">
        <div class="value">${stats.lecturesCompleted}</div>
        <div class="label">Lectures Completed</div>
      </div>
      <div class="stat-card">
        <div class="value" style="color:var(--rule-red);">${stats.pendingDoubts || 0}</div>
        <div class="label">Pending Doubts</div>
      </div>
    `;

    // Low Attendance Alert Banner
    const alertBanner = document.getElementById("dashboard-attendance-alert");
    const alertText = document.getElementById("dashboard-attendance-alert-text");
    if (alertBanner && alertText) {
      if (att.isLow) {
        alertBanner.classList.remove("hidden");
        const subList = att.lowSubjects && att.lowSubjects.length > 0 
          ? `(${att.lowSubjects.map(s => `${s.subject}: ${s.percentage}%`).join(", ")})` 
          : "";
        alertText.textContent = `Your overall attendance is currently at ${att.percentage}% (below the 75% minimum threshold). ${subList}`;
      } else {
        alertBanner.classList.add("hidden");
      }
    }

    const topicsDiv = document.getElementById("top-topics");
    topicsDiv.innerHTML = stats.topTopics.length
      ? stats.topTopics.map((t) => `<span class="tag">${t.topic} · ${t.count}</span>`).join("")
      : `<p class="muted">Record a lecture to see your top topics here.</p>`;
  } catch (err) {
    console.error("Failed loading stats:", err);
  }

  // Load centralized doubts checklist
  await loadDashboardDoubts();

  // Load recent lectures
  try {
    const { lectures } = await apiCall("/lectures");
    const listDiv = document.getElementById("recent-lectures");

    if (!lectures || lectures.length === 0) {
      listDiv.innerHTML = `<p class="muted">No lectures yet. <a href="record.html">Record your first one →</a></p>`;
      return;
    }

    listDiv.innerHTML = lectures
      .slice(0, 5)
      .map(
        (l) => `
        <div class="flex-between" style="padding:10px 0; border-bottom:1px solid var(--border);">
          <div>
            <strong>${l.subject}</strong>
            <div class="muted">${new Date(l.date).toLocaleString()} · Teacher: ${l.teacher}</div>
          </div>
          <a class="btn btn-ghost" href="notes.html?id=${l.id}">View Notes</a>
        </div>`
      )
      .join("");
  } catch (err) {
    console.error("Failed loading recent lectures:", err);
  }
}

// ================================================================
// CENTRALIZED DOUBTS CHECKLIST LOGIC
// ================================================================

async function loadDashboardDoubts() {
  const container = document.getElementById("dashboard-doubts-list");
  if (!container) return;

  try {
    const res = await apiCall("/lectures/doubts/all");
    allDoubtsList = res.doubts || [];

    // Update filter counts
    const total = allDoubtsList.length;
    const resolved = allDoubtsList.filter((d) => d.resolved).length;
    const pending = total - resolved;

    const countAll = document.getElementById("count-all");
    const countPending = document.getElementById("count-pending");
    const countResolved = document.getElementById("count-resolved");

    if (countAll) countAll.textContent = total;
    if (countPending) countPending.textContent = pending;
    if (countResolved) countResolved.textContent = resolved;

    renderDashboardDoubts();
  } catch (err) {
    container.innerHTML = `<p class="error-msg">Failed to load doubts: ${err.message}</p>`;
  }
}

function filterDashboardDoubts(filter) {
  currentDoubtFilter = filter;
  ["all", "pending", "resolved"].forEach((f) => {
    const btn = document.getElementById(`doubt-filter-${f}`);
    if (btn) {
      if (f === filter) btn.classList.add("active");
      else btn.classList.remove("active");
    }
  });
  renderDashboardDoubts();
}

function renderDashboardDoubts() {
  const container = document.getElementById("dashboard-doubts-list");
  if (!container) return;

  let filtered = allDoubtsList;
  if (currentDoubtFilter === "pending") {
    filtered = allDoubtsList.filter((d) => !d.resolved);
  } else if (currentDoubtFilter === "resolved") {
    filtered = allDoubtsList.filter((d) => d.resolved);
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:24px 16px; background:var(--paper); border-radius:var(--radius); border:1px dashed var(--border);">
        <p class="muted" style="margin:0;">
          ${currentDoubtFilter === "pending" ? "🎉 No pending doubts! You're completely up to speed." : "No doubts logged yet. Add questions directly inside any lecture notes to track them here!"}
        </p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map((d) => `
    <div class="dashboard-doubt-row ${d.resolved ? "resolved" : ""}" id="dash-doubt-${d.id}">
      <div class="flex-between" style="gap:10px; align-items:flex-start;">
        <label class="flex" style="gap:10px; cursor:pointer; align-items:flex-start; flex:1;">
          <input type="checkbox" class="doubt-checkbox" style="margin-top:4px;" ${d.resolved ? "checked" : ""} onchange="toggleDashboardDoubt('${d.id}')" />
          <div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
              <span class="tag" style="background:var(--accent-blue); color:#fff; font-size:0.72rem;">📚 ${escapeHtml(d.lectureSubject)}</span>
              <span class="tag ${d.resolved ? "tag-resolved" : "tag-pending"}" style="font-size:0.72rem;">
                ${d.resolved ? "✅ Resolved" : "⏳ Pending"}
              </span>
            </div>
            <strong class="doubt-title ${d.resolved ? "resolved-title" : ""}" style="font-size:0.92rem; line-height:1.4;">
              ${escapeHtml(d.question)}
            </strong>
          </div>
        </label>

        <div class="flex" style="gap:6px; flex-shrink:0;">
          ${d.solution ? `<button class="btn btn-ghost btn-sm" onclick="toggleSolutionPreview('${d.id}')">📝 Solution</button>` : ""}
          <a class="btn btn-ghost btn-sm" href="notes.html?id=${d.lectureId}">Open Note →</a>
        </div>
      </div>

      <!-- Collapsible Solution Notepad Preview -->
      <div id="dash-sol-${d.id}" class="dash-solution-box hidden" style="margin-top:10px; padding:10px 14px; background:var(--card-bg); border:1px solid var(--border); border-radius:8px; font-size:0.88rem; line-height:1.5;">
        <strong style="color:var(--ink-soft); font-size:0.78rem; display:block; margin-bottom:4px;">📝 Solution Notepad:</strong>
        <div style="white-space:pre-wrap;">${escapeHtml(d.solution || "No solution text recorded yet.")}</div>
      </div>
    </div>
  `).join("");
}

async function toggleDashboardDoubt(doubtId) {
  const doubt = allDoubtsList.find((d) => d.id === doubtId);
  if (!doubt) return;

  const newStatus = !doubt.resolved;
  doubt.resolved = newStatus;

  // Update UI immediately
  renderDashboardDoubts();

  try {
    await apiCall(`/lectures/doubts/${doubtId}/toggle`, "PATCH");
    
    // Update counter badges
    const total = allDoubtsList.length;
    const resolved = allDoubtsList.filter((d) => d.resolved).length;
    const pending = total - resolved;
    
    const countPending = document.getElementById("count-pending");
    const countResolved = document.getElementById("count-resolved");
    if (countPending) countPending.textContent = pending;
    if (countResolved) countResolved.textContent = resolved;

    // Refresh pending count in main stat grid
    const stats = await apiCall("/stats");
    const grid = document.getElementById("stat-grid");
    if (grid && stats) {
      grid.children[4].querySelector(".value").textContent = stats.pendingDoubts || 0;
    }
  } catch (err) {
    doubt.resolved = !newStatus; // revert
    renderDashboardDoubts();
    alert("Failed to toggle doubt status: " + err.message);
  }
}

function toggleSolutionPreview(doubtId) {
  const el = document.getElementById(`dash-sol-${doubtId}`);
  if (el) {
    el.classList.toggle("hidden");
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

loadDashboard();
