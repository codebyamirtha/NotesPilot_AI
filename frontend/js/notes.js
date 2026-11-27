// ================================================================
// notes.js
// Feature 4: Smart Note Generation (rendering)
// Feature 5: AI Lecture Summary & 🔊 Text-to-Speech (Audio Notes)
// Feature 6: Important Point Detection & Mnemonics
// Feature 7: Keyword Extraction
// Feature 11: Lecture History
// Feature 12: Search Notes
// Feature 14: Multi-Format PDF/MD/HTML/JSON Export
// Extra Features:
// - 📐 Cornell Notes 3-Column Layout Toggle
// - 📄 1-Page Exam Cheat Sheet Generator & Print
// - 💬 "Chat with Your Notes" (AI Doubt Solver)
// - 🎯 Professor Exam Question Predictor (Mock University Exam Paper)
// ================================================================

requireAuth();
renderNavbar("notes.html");

let currentLecture = null;
let isCornellView = false;
let isSpeaking = false;

// Handwritten Notes Study Mode State
let currentStudyMode = "normal"; // "normal" or "handwritten"
let activeHandwrittenPageIndex = 0;
let handwrittenZoom = 1.0;
let handwrittenFilterMode = "normal"; // "normal", "contrast", "inverted"

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function highlightKeywords(text, keywords) {
  let out = text;
  keywords.forEach((k) => {
    const regex = new RegExp(`\\b(${escapeRegex(k)})\\b`, "gi");
    out = out.replace(regex, '<span class="keyword-pill">$1</span>');
  });
  return out;
}

let selectedTagFilter = "All";

async function loadSubjectTags() {
  try {
    const { tags } = await apiCall("/lectures/tags");
    const select = document.getElementById("tag-filter");
    if (!select) return;
    select.innerHTML = `<option value="All">🏷️ All Subject Tags (${tags.length})</option>` +
      tags.map((t) => `<option value="${t}">${t}</option>`).join("");
    select.value = selectedTagFilter;
  } catch (err) { console.warn("Failed loading tags", err); }
}

async function filterByTag() {
  const select = document.getElementById("tag-filter");
  selectedTagFilter = select ? select.value : "All";
  loadLectureList(selectedTagFilter);
}

async function loadLectureList(tag = "All") {
  const listDiv = document.getElementById("lecture-list");
  const countBadge = document.getElementById("lecture-count-badge");
  try {
    const query = tag && tag !== "All" ? `?tag=${encodeURIComponent(tag)}` : "";
    const { lectures } = await apiCall(`/lectures${query}`);
    
    if (countBadge) countBadge.textContent = `${lectures.length} notes`;

    if (lectures.length === 0) {
      listDiv.innerHTML = `<p class="muted" style="padding:12px 0;">No notes found for tag "${tag}". <a href="record.html">Record or import one →</a></p>`;
      document.getElementById("notes-panel").innerHTML = `<p class="muted">Select a lecture to view notes.</p>`;
      return;
    }

    listDiv.innerHTML = lectures
      .map(
        (l) => `
        <div class="flex-between" style="padding:10px 0; border-bottom:1px solid var(--border); cursor:pointer;"
             onclick="selectLecture('${l.id}')">
          <div>
            <strong>${l.subject}</strong>
            <div class="muted" style="font-size:0.8rem; margin-top:2px;">
              <span class="tag" style="padding:2px 6px; font-size:0.75rem;">🏷️ ${l.subjectTag || "General"}</span>
              · ${new Date(l.date).toLocaleDateString()}
            </div>
          </div>
          <span>→</span>
        </div>`
      )
      .join("");

    const wantedId = getQueryParam("id");
    const targetLecture = wantedId ? lectures.find(x => x.id === wantedId) || lectures[0] : lectures[0];
    if (targetLecture) selectLecture(targetLecture.id);
  } catch (err) {
    listDiv.innerHTML = `<p class="error-msg">${err.message}</p>`;
  }
}

async function selectLecture(id) {
  stopSpeaking();
  const panel = document.getElementById("notes-panel");
  panel.innerHTML = `<p class="muted">Loading notes...</p>`;

  try {
    const { lecture } = await apiCall(`/lectures/${id}`);
    currentLecture = lecture;
    renderNotesPanel(lecture);
  } catch (err) {
    panel.innerHTML = `<p class="error-msg">${err.message}</p>`;
  }
}

function toggleCornellView() {
  isCornellView = !isCornellView;
  if (currentLecture) renderNotesPanel(currentLecture);
}

function speakSummary(type = "1min") {
  if (!currentLecture) return;
  const n = currentLecture.notes || {};
  const text = type === "1min" 
    ? (n.summaryShort || "No summary available.")
    : (n.summary5min || "No summary available.");

  const btn = document.getElementById(`btn-tts-${type}`);
  if (isSpeaking) {
    stopSpeaking();
    return;
  }

  isSpeaking = true;
  if (btn) btn.textContent = "⏹️ Stop Audio";

  speakText(text, () => {
    isSpeaking = false;
    if (btn) btn.textContent = type === "1min" ? "🔊 Listen to 1-Min Summary" : "🔊 Listen to 5-Min Summary";
  });
}

function stopSpeaking() {
  stopSpeech();
  isSpeaking = false;
  const btn1 = document.getElementById("btn-tts-1min");
  const btn5 = document.getElementById("btn-tts-5min");
  if (btn1) btn1.textContent = "🔊 Listen to 1-Min Summary";
  if (btn5) btn5.textContent = "🔊 Listen to 5-Min Summary";
}

function renderNotesPanel(lecture) {
  const n = lecture.notes;
  const panel = document.getElementById("notes-panel");

  // Render Definitions
  const defsHtml = n.definitions && n.definitions.length
    ? n.definitions.map((d) => `<li><strong>${d.term}:</strong> ${d.definition}</li>`).join("")
    : `<li class="muted">No explicit definitions detected in this lecture.</li>`;

  // Render Formulas
  const formulasHtml = n.formulas && n.formulas.length
    ? n.formulas.map((f) => `<li style="font-family:var(--font-mono); font-weight:600;">${f}</li>`).join("")
    : `<li class="muted">No formulas detected in this lecture.</li>`;

  // Render Highlights
  const highlightsHtml = n.highlights && n.highlights.length
    ? n.highlights.map((h) => `<li>⭐ ${h}</li>`).join("")
    : `<li class="muted">No "important / remember / exam" cues detected.</li>`;

  // Render Mnemonics
  const mnemonicsHtml = n.mnemonics && n.mnemonics.length
    ? n.mnemonics.map(m => `
      <div style="background:var(--paper); border:1px solid var(--border); border-radius:8px; padding:10px 14px; margin-bottom:8px;">
        <span class="tag" style="background:#2A9D8F; color:#fff; font-weight:700;">Acronym: ${m.acronym}</span>
        <strong style="margin-left:8px;">${m.phrase}</strong>
        <p class="muted" style="margin:4px 0 0; font-size:0.84rem;">💡 ${m.tip}</p>
      </div>`).join("")
    : `<p class="muted">No mnemonic patterns generated yet.</p>`;


  // Render Examples
  const examplesHtml = n.examples && n.examples.length
    ? n.examples.map((e) => `<li>💡 ${e}</li>`).join("")
    : "";

  // Render Conclusions
  const conclusionsHtml = n.conclusions && n.conclusions.length
    ? n.conclusions.map((c) => `<li>🎯 ${c}</li>`).join("")
    : "";

  let bodyHtml = "";

  if (isCornellView) {
    // 📐 Cornell Notes 3-Column View Layout
    bodyHtml = `
      <div class="cornell-layout">
        <div class="cornell-cues">
          <h4 style="border-bottom:2px solid var(--border); padding-bottom:6px;">📌 Cues & Keywords</h4>
          <div style="display:flex; flex-direction:column; gap:6px; margin-top:8px;">
            ${n.keywords.map((k) => `<span class="tag">${k}</span>`).join("")}
          </div>
          <h5 style="margin-top:16px; margin-bottom:6px;">Key Formulas</h5>
          <ul style="padding-left:14px; font-size:0.85rem;">${formulasHtml}</ul>
        </div>
        <div class="cornell-main">
          <h4 style="border-bottom:2px solid var(--border); padding-bottom:6px;">📚 Lecture Notes</h4>
          ${n.sections.map(s => `
            <div style="margin-bottom:14px;">
              <h5 style="color:var(--accent-blue); margin-bottom:4px;">${s.heading}</h5>
              <ul style="padding-left:18px;">${s.bullets.map(b => `<li>${highlightKeywords(b, n.keywords)}</li>`).join("")}</ul>
            </div>
          `).join("")}
          <h5 style="margin-top:14px; margin-bottom:6px;">⭐ Critical Highlights</h5>
          <ul style="padding-left:18px;">${highlightsHtml}</ul>
          ${examplesHtml ? `<h5 style="margin-top:14px; margin-bottom:6px;">💡 Examples</h5><ul style="padding-left:18px;">${examplesHtml}</ul>` : ""}
          ${conclusionsHtml ? `<h5 style="margin-top:14px; margin-bottom:6px;">🎯 Conclusions</h5><ul style="padding-left:18px;">${conclusionsHtml}</ul>` : ""}
        </div>
        <div class="cornell-summary-area">
          <h4 style="margin-bottom:4px;">📝 Bottom Summary (Cornell Review)</h4>
          <p style="margin:0; font-size:0.95rem;">${n.summary5min || n.summaryShort}</p>
        </div>
      </div>
    `;
  } else {
    // Standard Notebook View
    const sectionsHtml = n.sections
      .map(
        (s) => `
        <div style="margin-bottom:14px;">
          <h4 style="margin-bottom:6px;">${s.heading}</h4>
          <ul>${s.bullets.map((b) => `<li>${highlightKeywords(b, n.keywords)}</li>`).join("")}</ul>
        </div>`
      )
      .join("");

    bodyHtml = `
      <div style="margin:12px 0;">${n.keywords.map((k) => `<span class="tag">${k}</span>`).join("")}</div>

      <div class="flex-between" style="flex-wrap:wrap; margin-top:14px;">
        <h4 style="margin:0;">📝 1-Minute Summary</h4>
        <button id="btn-tts-1min" class="btn btn-ghost" style="padding:4px 10px; font-size:0.8rem;" onclick="speakSummary('1min')">🔊 Listen to 1-Min Summary</button>
      </div>
      <p>${n.summaryShort || "—"}</p>

      <div class="flex-between" style="flex-wrap:wrap; margin-top:14px;">
        <h4 style="margin:0;">📖 5-Minute Summary</h4>
        <button id="btn-tts-5min" class="btn btn-ghost" style="padding:4px 10px; font-size:0.8rem;" onclick="speakSummary('5min')">🔊 Listen to 5-Min Summary</button>
      </div>
      <p>${n.summary5min || "—"}</p>

      <h4>📚 Structured Notes</h4>
      ${sectionsHtml || "<p class='muted'>Not enough content to structure yet.</p>"}

      <h4>🧠 Memory Hooks & Mnemonics</h4>
      ${mnemonicsHtml}

      <h4>📌 Definitions</h4>
      <ul>${defsHtml}</ul>

      <h4>➗ Formulas</h4>
      <ul>${formulasHtml}</ul>

      <h4>⭐ Important Points</h4>
      <ul>${highlightsHtml}</ul>

      ${examplesHtml ? `<h4>💡 Practical Examples</h4><ul>${examplesHtml}</ul>` : ""}

      ${conclusionsHtml ? `<h4>🎯 Key Conclusions & Takeaways</h4><ul>${conclusionsHtml}</ul>` : ""}

      <div style="margin-top:18px;">
        <div class="flex-between" style="cursor:pointer;" onclick="toggleTranscriptBox()">
          <h4 style="margin:0;">📜 Full Transcript & Marked Doubts (🔴)</h4>
          <span class="tag" id="toggle-transcript-tag">▼ Show Transcript</span>
        </div>
        <div id="transcript-preview-container" class="transcript-preview-box hidden" style="margin-top:8px;">
          ${renderTranscriptWithDoubtSpots(lecture.transcript)}
        </div>
      </div>
    `;
  }

  const noteWordCount = (lecture.transcript ? lecture.transcript.match(/[\w\d\u00C0-\u024F\u1E00-\u1EFF]+/g) || [] : []).length;
  const noteReadMins = Math.max(1, Math.round(noteWordCount / 200));

  panel.innerHTML = `
    <div class="flex-between" style="flex-wrap:wrap; gap:10px; border-bottom:2px solid var(--border); padding-bottom:12px;">
      <div>
        <h3 style="margin-bottom:4px;">${lecture.subject}</h3>
        <div class="flex" style="gap:6px; flex-wrap:wrap; align-items:center;">
          <span class="tag" style="background:var(--accent-blue); color:white;">🏷️ ${lecture.subjectTag || "General"}</span>
          <span class="capacity-pill" style="font-size:0.78rem;">📝 ${noteWordCount.toLocaleString()} words (~${noteReadMins} min read)</span>
          <span class="muted">Teacher: ${lecture.teacher}</span>
        </div>
      </div>
      
      <!-- Top Action Controls -->
      <div class="flex" style="flex-wrap:wrap; gap:6px;">
        <button class="btn btn-ghost" style="font-size:0.85rem;" onclick="toggleCornellView()">
          ${isCornellView ? "📖 Standard View" : "📐 Cornell View"}
        </button>
        <button class="btn btn-ghost" style="font-size:0.85rem; border-color:var(--accent-blue); color:var(--accent-blue);" onclick="scrollToDoubtsNotepad()">
          💡 Doubts Notepad (${(lecture.doubts || []).length})
        </button>
        <button class="btn btn-primary" style="font-size:0.85rem;" onclick="openCheatSheetModal()">
          📄 1-Page Cheat Sheet
        </button>
        <button class="btn btn-accent" style="font-size:0.85rem;" onclick="openExamPaperModal()">
          🎯 Mock Exam Paper
        </button>
        <button class="btn btn-ghost" style="font-size:0.85rem; border-color:var(--accent-blue);" onclick="openEditNoteModal()">
          ✏️ Edit Note
        </button>
        <button class="btn btn-ghost" style="font-size:0.85rem; border-color:#E63946; color:#E63946;" onclick="deleteCurrentNote()">
          🗑️ Delete Note
        </button>

        <div style="position:relative; display:inline-block;">
          <button class="btn btn-ghost" onclick="toggleExportMenu()">📦 Export ▼</button>
          <div id="export-dropdown" class="card hidden" style="position:absolute; right:0; top:42px; min-width:230px; padding:8px; z-index:30; box-shadow:var(--shadow);">
            <button class="btn btn-ghost" style="width:100%; text-align:left; padding:8px 12px;" onclick="exportPdf()">📕 Export PDF Document (.pdf)</button>
            <button class="btn btn-ghost" style="width:100%; text-align:left; padding:8px 12px;" onclick="exportDoc()">📄 Export Word Document (.doc)</button>
            <button class="btn btn-ghost" style="width:100%; text-align:left; padding:8px 12px;" onclick="exportTxt()">📋 Export Plain Text File (.txt)</button>
            <button class="btn btn-ghost" style="width:100%; text-align:left; padding:8px 12px;" onclick="exportImage()">🖼️ Export Note Image (.png)</button>
            <button class="btn btn-ghost" style="width:100%; text-align:left; padding:8px 12px;" onclick="exportMarkdown()">📝 Export Markdown (.md)</button>
            <button class="btn btn-ghost" style="width:100%; text-align:left; padding:8px 12px;" onclick="exportPrintableHtml()">🖨️ Printable Paper View</button>
            <button class="btn btn-ghost" style="width:100%; text-align:left; padding:8px 12px;" onclick="copyNotesToClipboard()">📋 Copy to Clipboard</button>
            <button class="btn btn-ghost" style="width:100%; text-align:left; padding:8px 12px;" onclick="exportJson()">💾 Backup JSON Data</button>
          </div>
        </div>
      </div>
    </div>

    <!-- My Study Notes Mode Switcher (Normal vs Handwritten) -->
    <div class="study-mode-bar" style="margin: 14px 0 16px; border-bottom: 2px solid var(--border); padding-bottom: 8px; display: flex; gap: 8px; flex-wrap: wrap;">
      <button class="btn ${currentStudyMode === 'normal' ? 'btn-primary' : 'btn-ghost'}" onclick="switchStudyMode('normal')" style="font-size:0.9rem; border-radius:8px;">
        📄 Normal Notes (AI Structured)
      </button>
      <button class="btn ${currentStudyMode === 'handwritten' ? 'btn-primary' : 'btn-ghost'}" onclick="switchStudyMode('handwritten')" style="font-size:0.9rem; border-radius:8px;">
        ✍️ Handwritten Notes (${(lecture.handwrittenPages || []).length} Pages)
      </button>
    </div>

    ${currentStudyMode === "handwritten" ? renderHandwrittenNotesHtml(lecture) : `
      ${bodyHtml}

      <!-- Lecture Doubts & Solutions Notepad -->
      ${renderDoubtsNotepadHtml(lecture)}

      <div class="flex" style="margin-top:20px; gap:10px; flex-wrap:wrap;">
        <a class="btn btn-accent" href="supporter.html?id=${lecture.id}">🤖 Ask Student Supporter</a>
        <a class="btn btn-ghost" href="quiz.html?id=${lecture.id}">🧠 Practice Quiz</a>
        <button class="btn btn-ghost" style="border-color:var(--accent-blue);" onclick="openEditNoteModal()">✏️ Edit</button>
        <button class="btn btn-ghost" style="border-color:#E63946; color:#E63946;" onclick="deleteCurrentNote()">🗑️ Delete</button>
      </div>

      <!-- 🤖 Responsive AI Synthesizer & Assistant -->
      <div class="responsive-ai-panel" style="margin-top:20px; background:var(--card-bg); border:1.5px solid var(--accent-blue); border-radius:var(--radius); padding:16px;">
        <div class="flex-between" style="flex-wrap:wrap; gap:8px; border-bottom:1px solid var(--border); padding-bottom:8px; margin-bottom:12px;">
          <strong style="font-size:0.95rem; display:flex; align-items:center; gap:6px;">
            🤖 Responsive AI Assistant & Synthesizer
          </strong>
          <span class="tag" style="background:rgba(78, 143, 184, 0.15); color:var(--accent-blue); font-weight:600;">⚡ Instant Synthesis</span>
        </div>
        <p class="muted" style="margin:0 0 10px; font-size:0.85rem;">Click any AI quick action below to instantly analyze or transform this lecture note:</p>
        
        <div class="flex" style="gap:8px; flex-wrap:wrap; margin-bottom:12px;">
          <button class="btn btn-ghost btn-sm" onclick="runAiSynthesis('3bullet')">⚡ 3-Bullet Takeaways</button>
          <button class="btn btn-ghost btn-sm" onclick="runAiSynthesis('eli5')">💡 Explain Simply (ELI5)</button>
          <button class="btn btn-ghost btn-sm" onclick="runAiSynthesis('quiz3')">🎯 3 Practice Flash Questions</button>
          <button class="btn btn-ghost btn-sm" onclick="runAiSynthesis('formulas')">➗ Key Formulas & Rules</button>
        </div>

        <div id="responsive-ai-output" class="hidden" style="background:var(--paper); padding:12px 14px; border-radius:8px; border:1px solid var(--border); font-size:0.9rem; line-height:1.5;">
          <div class="flex-between" style="margin-bottom:6px;">
            <strong id="responsive-ai-title" style="font-size:0.85rem; color:var(--accent-blue);">AI Response:</strong>
            <button class="btn btn-ghost btn-sm" onclick="document.getElementById('responsive-ai-output').classList.add('hidden')">✕</button>
          </div>
          <div id="responsive-ai-content" style="white-space:pre-wrap;"></div>
        </div>
      </div>

    `}

    <p id="export-toast" class="muted" style="margin-top:8px; font-weight:600;"></p>
  `;
}

// ================================================================
// LECTURE DOUBTS & SOLUTIONS NOTEPAD (FRONTEND HANDLERS)
// ================================================================

function renderDoubtsNotepadHtml(lecture) {
  const doubts = lecture.doubts || [];
  const total = doubts.length;
  const resolved = doubts.filter((d) => d.resolved).length;

  let doubtsListHtml = "";
  if (doubts.length === 0) {
    doubtsListHtml = `<p class="muted" style="padding:12px; text-align:center; margin:0;">No doubts logged for this lecture yet. Add a question below or use "Chat with Notes" to solve one!</p>`;
  } else {
    doubtsListHtml = doubts.map((d) => `
      <div class="doubt-card ${d.resolved ? "resolved" : ""}" id="doubt-card-${d.id}">
        <div class="doubt-header">
          <label class="doubt-check-label">
            <input type="checkbox" class="doubt-checkbox" ${d.resolved ? "checked" : ""} onchange="toggleDoubtResolved('${d.id}')" />
            <span class="doubt-title ${d.resolved ? "resolved-title" : ""}">${escapeHtml(d.question)}</span>
          </label>
          <span class="tag ${d.resolved ? "tag-resolved" : "tag-pending"}">
            ${d.resolved ? "✅ Resolved" : "⏳ Pending"}
          </span>
        </div>

        <div class="doubt-solution-box">
          <div class="flex-between" style="margin-bottom:6px;">
            <strong style="font-size:0.82rem; color:var(--ink-soft);">📝 Solution & Notes Notepad:</strong>
            <span class="muted" style="font-size:0.75rem;">${d.updatedAt ? "Updated " + new Date(d.updatedAt).toLocaleTimeString() : ""}</span>
          </div>
          <textarea id="notepad-${d.id}" class="doubt-solution-textarea" rows="3" placeholder="Write explanation, formula proof, or textbook solution notes here...">${escapeHtml(d.solution || "")}</textarea>
          
          <div class="flex-between" style="margin-top:8px; flex-wrap:wrap; gap:6px;">
            <div class="flex" style="gap:6px;">
              <button class="btn btn-primary btn-sm" onclick="saveDoubtSolution('${d.id}')">💾 Save Solution</button>
              <button class="btn btn-ghost btn-sm" onclick="copyDoubtSolution('${d.id}')">📋 Copy</button>
            </div>
            <button class="btn btn-ghost btn-sm" style="color:#E63946; border-color:#E63946;" onclick="deleteLectureDoubt('${d.id}')">🗑️ Delete</button>
          </div>
        </div>
      </div>
    `).join("");
  }

  return `
    <div class="doubt-notepad-panel">
      <div class="flex-between" style="border-bottom:2px solid var(--border); padding-bottom:8px; margin-bottom:14px; flex-wrap:wrap; gap:8px;">
        <h4 style="margin:0; display:flex; align-items:center; gap:8px;">
          💡 Lecture Doubts & Solutions Notepad
        </h4>
        <span class="tag" style="background:rgba(78, 143, 184, 0.15); color:var(--accent-blue); font-weight:600;" id="doubts-counter-badge">
          ${resolved}/${total} Resolved (${total - resolved} Pending)
        </span>
      </div>

      <!-- Add New Doubt Form -->
      <div class="doubt-add-bar">
        <input type="text" id="new-doubt-input" placeholder="Type a doubt or question from this lecture..." class="doubt-add-input" onkeydown="if(event.key==='Enter') addNewDoubt()" />
        <div class="flex" style="gap:6px; flex-shrink:0;">
          <button class="btn btn-primary btn-sm" onclick="addNewDoubt()" title="Add doubt to notepad">✍️ Add Doubt</button>
        </div>
      </div>

      <!-- Doubts Cards List -->
      <div class="doubts-container" id="doubts-container">
        ${doubtsListHtml}
      </div>
    </div>
  `;
}

async function addNewDoubt() {
  if (!currentLecture) return;
  const input = document.getElementById("new-doubt-input");
  const question = input ? input.value.trim() : "";
  if (!question) {
    alert("Please enter a question or doubt text.");
    return;
  }

  input.value = "";

  try {
    const res = await apiCall(`/lectures/${currentLecture.id}/doubts`, "POST", {
      question
    });

    if (!currentLecture.doubts) currentLecture.doubts = [];
    currentLecture.doubts.unshift(res.doubt);

    // Re-render notes panel to show new doubt in notepad
    renderNotesPanel(currentLecture);
  } catch (err) {
    alert("Error adding doubt: " + err.message);
  }
}

async function toggleDoubtResolved(doubtId) {
  if (!currentLecture) return;
  const doubts = currentLecture.doubts || [];
  const doubt = doubts.find((d) => d.id === doubtId);
  if (!doubt) return;

  const newStatus = !doubt.resolved;
  doubt.resolved = newStatus;

  // Optimistic UI update
  const card = document.getElementById(`doubt-card-${doubtId}`);
  if (card) {
    card.classList.toggle("resolved", newStatus);
    const titleEl = card.querySelector(".doubt-title");
    if (titleEl) titleEl.classList.toggle("resolved-title", newStatus);
    const tagEl = card.querySelector(".tag");
    if (tagEl) {
      tagEl.className = `tag ${newStatus ? "tag-resolved" : "tag-pending"}`;
      tagEl.textContent = newStatus ? "✅ Resolved" : "⏳ Pending";
    }
  }

  try {
    await apiCall(`/lectures/${currentLecture.id}/doubts/${doubtId}`, "PATCH", {
      resolved: newStatus
    });
    updateDoubtsCounterBadge();
  } catch (err) {
    doubt.resolved = !newStatus; // revert
    renderNotesPanel(currentLecture);
    alert("Failed to update doubt status: " + err.message);
  }
}

async function saveDoubtSolution(doubtId) {
  if (!currentLecture) return;
  const notepad = document.getElementById(`notepad-${doubtId}`);
  if (!notepad) return;
  const solution = notepad.value;

  try {
    await apiCall(`/lectures/${currentLecture.id}/doubts/${doubtId}`, "PATCH", {
      solution
    });

    const doubt = (currentLecture.doubts || []).find((d) => d.id === doubtId);
    if (doubt) doubt.solution = solution;

    notepad.style.borderColor = "#2A9D8F";
    setTimeout(() => { notepad.style.borderColor = ""; }, 1500);
  } catch (err) {
    alert("Failed to save solution: " + err.message);
  }
}

async function deleteLectureDoubt(doubtId) {
  if (!currentLecture) return;
  if (!confirm("Are you sure you want to delete this doubt?")) return;

  try {
    await apiCall(`/lectures/${currentLecture.id}/doubts/${doubtId}`, "DELETE");
    currentLecture.doubts = (currentLecture.doubts || []).filter((d) => d.id !== doubtId);
    renderNotesPanel(currentLecture);
  } catch (err) {
    alert("Error deleting doubt: " + err.message);
  }
}

function copyDoubtSolution(doubtId) {
  const notepad = document.getElementById(`notepad-${doubtId}`);
  if (!notepad) return;
  navigator.clipboard.writeText(notepad.value).then(() => {
    alert("✅ Solution copied to clipboard!");
  });
}

function updateDoubtsCounterBadge() {
  const badge = document.getElementById("doubts-counter-badge");
  if (!badge || !currentLecture) return;
  const doubts = currentLecture.doubts || [];
  const total = doubts.length;
  const resolved = doubts.filter((d) => d.resolved).length;
  badge.textContent = `${resolved}/${total} Resolved (${total - resolved} Pending)`;
}

function scrollToDoubtsNotepad() {
  const el = document.querySelector(".doubt-notepad-panel");
  if (el) el.scrollIntoView({ behavior: "smooth" });
}

function toggleTranscriptBox() {
  const box = document.getElementById("transcript-preview-container");
  const tag = document.getElementById("toggle-transcript-tag");
  if (!box) return;
  const isHidden = box.classList.contains("hidden");
  box.classList.toggle("hidden", !isHidden);
  if (tag) tag.textContent = isHidden ? "▲ Hide Transcript" : "▼ Show Transcript";
}

function renderTranscriptWithDoubtSpots(transcript) {
  if (!transcript) return "<p class='muted'>No transcript available.</p>";

  // Escape HTML first
  const escaped = escapeHtml(transcript);

  // Replace 🔴 with interactive styled spot markers
  const withMarkers = escaped.replace(/🔴/g, `<span class="doubt-dot-marker" onclick="inspectDoubtSpot(event, this)" title="🔴 Click to view/solve this doubt">🔴</span>`);

  return `<div class="transcript-text" style="line-height:1.7; font-size:0.92rem; white-space:pre-wrap;">${withMarkers}</div>`;
}

function inspectDoubtSpot(event, el) {
  event.stopPropagation();
  if (!currentLecture) return;

  // Find surrounding text context
  const parent = el.closest(".transcript-text") || el.parentElement;
  const fullText = parent ? parent.innerText : "";
  const dotIndex = fullText.indexOf("🔴");
  const snippet = fullText.slice(Math.max(0, dotIndex - 60), Math.min(fullText.length, dotIndex + 60)).trim();

  // Scroll to doubts notepad
  scrollToDoubtsNotepad();

  // Try to find matching doubt card in notepad
  const cards = document.querySelectorAll(".doubt-card");
  let found = false;
  cards.forEach((card) => {
    if (snippet && card.innerText.includes(snippet.slice(0, 25))) {
      card.style.boxShadow = "0 0 0 3px #E63946";
      setTimeout(() => { card.style.boxShadow = ""; }, 2500);
      found = true;
    }
  });

  if (!found) {
    const input = document.getElementById("new-doubt-input");
    if (input) {
      input.value = `Doubt on: "${snippet || "marked section"}"`;
      input.focus();
      input.style.borderColor = "#E63946";
      setTimeout(() => { input.style.borderColor = ""; }, 2000);
    }
  }
}

// 📄 1-Page Exam Cheat Sheet Modal
function openCheatSheetModal() {
  if (!currentLecture) return;
  const n = currentLecture.notes;
  const modal = document.getElementById("app-modal");
  const body = document.getElementById("modal-body");

  body.innerHTML = `
    <div class="flex-between" style="border-bottom:2px solid var(--rule-red); padding-bottom:10px; margin-bottom:16px;">
      <div>
        <h2 style="margin:0;">📄 1-Page Exam Cheat Sheet</h2>
        <span class="muted">${currentLecture.subject} · ${currentLecture.subjectTag || "General"}</span>
      </div>
      <div class="flex" style="gap:8px;">
        <button class="btn btn-primary" onclick="window.print()">🖨️ Print Cheat Sheet</button>
        <button class="btn btn-ghost" onclick="closeModal()">✕ Close</button>
      </div>
    </div>

    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; font-size:0.88rem;">
      <div style="background:var(--paper); padding:12px; border-radius:8px;">
        <h4 style="margin:0 0 6px;">➗ High-Priority Formulas</h4>
        <ul style="padding-left:16px; margin:0; font-family:var(--font-mono);">
          ${n.formulas.length ? n.formulas.map(f => `<li>${f}</li>`).join("") : "<li>No explicit math formulas.</li>"}
        </ul>
      </div>

      <div style="background:var(--paper); padding:12px; border-radius:8px;">
        <h4 style="margin:0 0 6px;">🏷️ Core Keywords & Concepts</h4>
        <div style="display:flex; flex-wrap:wrap; gap:4px;">
          ${n.keywords.map(k => `<span class="tag" style="font-size:0.75rem;">${k}</span>`).join("")}
        </div>
      </div>

      <div style="background:var(--paper); padding:12px; border-radius:8px; grid-column:1/-1;">
        <h4 style="margin:0 0 6px;">📌 Essential Definitions</h4>
        <ul style="padding-left:16px; margin:0;">
          ${n.definitions.length ? n.definitions.map(d => `<li><strong>${d.term}:</strong> ${d.definition}</li>`).join("") : "<li>No definitions extracted.</li>"}
        </ul>
      </div>

      <div style="background:var(--paper); padding:12px; border-radius:8px; grid-column:1/-1;">
        <h4 style="margin:0 0 6px;">⭐ Critical Exam Highlights</h4>
        <ul style="padding-left:16px; margin:0;">
          ${n.highlights.length ? n.highlights.map(h => `<li>${h}</li>`).join("") : "<li>Review full notes for detailed topics.</li>"}
        </ul>
      </div>
    </div>
  `;

  modal.classList.remove("hidden");
}

// 🎯 Mock University Exam Paper Modal
async function openExamPaperModal() {
  if (!currentLecture) return;
  const modal = document.getElementById("app-modal");
  const body = document.getElementById("modal-body");

  body.innerHTML = `<p class="muted">Generating University Mock Exam Paper...</p>`;
  modal.classList.remove("hidden");

  try {
    const { examPaper } = await apiCall(`/lectures/${currentLecture.id}/exam-paper`);
    
    const renderSection = (sec) => `
      <div style="margin-top:18px;">
        <div class="flex-between" style="background:var(--paper); padding:8px 12px; border-radius:8px; margin-bottom:10px;">
          <h4 style="margin:0;">${sec.title}</h4>
          <span class="tag" style="background:var(--accent-blue); color:#fff;">${sec.marksPerQuestion} Marks Each</span>
        </div>
        ${sec.questions.map((q, idx) => `
          <div style="margin-bottom:14px; padding-left:10px; border-left:3px solid var(--border);">
            <strong>Q${q.id || idx+1}. ${q.question}</strong> <span class="muted">(${q.marks} Marks)</span>
            <details style="margin-top:6px;">
              <summary style="cursor:pointer; color:var(--accent-amber); font-weight:600; font-size:0.85rem;">View Model Answer & Grading Rubric</summary>
              <div style="background:var(--paper); padding:8px 12px; border-radius:6px; margin-top:4px; font-size:0.88rem;">
                <p style="margin:2px 0;"><strong>Model Answer:</strong> ${q.modelAnswer}</p>
                <p class="muted" style="margin:2px 0;"><strong>Marking Rubric:</strong> ${q.rubric}</p>
              </div>
            </details>
          </div>
        `).join("")}
      </div>
    `;

    body.innerHTML = `
      <div class="flex-between" style="border-bottom:2px solid var(--ink); padding-bottom:10px; margin-bottom:16px;">
        <div>
          <h2 style="margin:0;">🎯 ${examPaper.examTitle}</h2>
          <span class="muted">Max Marks: ${examPaper.totalMarks} · Duration: ${examPaper.duration}</span>
        </div>
        <div class="flex" style="gap:8px;">
          <button class="btn btn-primary" onclick="window.print()">🖨️ Print Exam Paper</button>
          <button class="btn btn-ghost" onclick="closeModal()">✕ Close</button>
        </div>
      </div>

      <div style="background:var(--paper); padding:10px 14px; border-radius:8px; margin-bottom:14px;">
        <strong>General Instructions:</strong>
        <ul style="margin:4px 0 0; padding-left:18px; font-size:0.85rem;">
          ${examPaper.instructions.map(i => `<li>${i}</li>`).join("")}
        </ul>
      </div>

      ${renderSection(examPaper.sections.sectionA)}
      ${renderSection(examPaper.sections.sectionB)}
      ${renderSection(examPaper.sections.sectionC)}
    `;
  } catch (err) {
    body.innerHTML = `<p class="error-msg">${err.message}</p><button class="btn btn-ghost" onclick="closeModal()">Close</button>`;
  }
}

// ✏️ Edit Note Modal
function openEditNoteModal() {
  if (!currentLecture) return;
  const n = currentLecture.notes;
  const modal = document.getElementById("app-modal");
  const body = document.getElementById("modal-body");

  body.innerHTML = `
    <div class="flex-between" style="border-bottom:2px solid var(--border); padding-bottom:10px; margin-bottom:16px;">
      <h2 style="margin:0;">✏️ Edit Lecture Note</h2>
      <button class="btn btn-ghost" onclick="closeModal()">✕ Close</button>
    </div>

    <form id="edit-note-form" onsubmit="saveEditedNote(event)">
      <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:12px; margin-bottom:14px;">
        <div>
          <label for="edit-subject">Subject / Title</label>
          <input type="text" id="edit-subject" value="${currentLecture.subject || ""}" required />
        </div>
        <div>
          <label for="edit-subjectTag">Subject Tag</label>
          <input type="text" id="edit-subjectTag" value="${currentLecture.subjectTag || ""}" placeholder="e.g. CS101" />
        </div>
        <div>
          <label for="edit-teacher">Teacher</label>
          <input type="text" id="edit-teacher" value="${currentLecture.teacher || ""}" />
        </div>
      </div>

      <div style="margin-bottom:14px;">
        <label for="edit-summaryShort">1-Minute Summary</label>
        <textarea id="edit-summaryShort" class="transcript-box" style="height:70px;">${n.summaryShort || ""}</textarea>
      </div>

      <div style="margin-bottom:14px;">
        <label for="edit-summary5min">5-Minute Summary</label>
        <textarea id="edit-summary5min" class="transcript-box" style="height:90px;">${n.summary5min || ""}</textarea>
      </div>

      <div style="margin-bottom:14px;">
        <label for="edit-transcript">Full Lecture Transcript</label>
        <textarea id="edit-transcript" class="transcript-box" style="height:120px;">${currentLecture.transcript || ""}</textarea>
      </div>

      <div style="margin-bottom:16px; background:var(--paper); padding:10px 14px; border-radius:8px;">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; margin:0; font-weight:500;">
          <input type="checkbox" id="edit-regenerate-ai" style="width:auto;" />
          🔄 Re-analyze & Regenerate AI Notes (Headings, Definitions, Formulas, Mnemonics) from updated transcript
        </label>
      </div>

      <div class="flex-between">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary" id="save-edit-btn">💾 Save Changes</button>
      </div>
      <p id="edit-error" class="error-msg" style="margin-top:8px;"></p>
    </form>
  `;

  modal.classList.remove("hidden");
}

async function saveEditedNote(e) {
  e.preventDefault();
  if (!currentLecture) return;

  const btn = document.getElementById("save-edit-btn");
  const errEl = document.getElementById("edit-error");
  btn.disabled = true;
  btn.textContent = "Saving...";

  const subject = document.getElementById("edit-subject").value.trim();
  const subjectTag = document.getElementById("edit-subjectTag").value.trim();
  const teacher = document.getElementById("edit-teacher").value.trim();
  const summaryShort = document.getElementById("edit-summaryShort").value.trim();
  const summary5min = document.getElementById("edit-summary5min").value.trim();
  const transcript = document.getElementById("edit-transcript").value.trim();
  const regenerateAI = document.getElementById("edit-regenerate-ai").checked;

  try {
    const payload = {
      subject,
      subjectTag,
      teacher,
      transcript,
      regenerateAI,
      notes: {
        summaryShort,
        summary5min
      }
    };

    const res = await apiCall(`/lectures/${currentLecture.id}`, "PUT", payload);
    currentLecture = res.lecture;
    closeModal();
    renderNotesPanel(currentLecture);
    loadSubjectTags();
    loadLectureList(selectedTagFilter);
  } catch (err) {
    if (errEl) errEl.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "💾 Save Changes";
  }
}

// 🗑️ Delete Note
async function deleteCurrentNote() {
  if (!currentLecture) return;

  const confirmDelete = confirm(
    `Are you sure you want to delete "${currentLecture.subject}"?\n\nThis action cannot be undone and will also clean up associated quizzes.`
  );
  if (!confirmDelete) return;

  try {
    await apiCall(`/lectures/${currentLecture.id}`, "DELETE");
    currentLecture = null;
    await loadSubjectTags();
    await loadLectureList(selectedTagFilter);
  } catch (err) {
    alert("Error deleting lecture: " + err.message);
  }
}

function closeModal() {
  const modal = document.getElementById("app-modal");
  if (modal) modal.classList.add("hidden");
}

function toggleExportMenu() {
  const dropdown = document.getElementById("export-dropdown");
  if (dropdown) dropdown.classList.toggle("hidden");
}

// Multi-Format Export 1: PDF
function exportPdf() {
  toggleExportMenu();
  if (!currentLecture) return;
  if (!window.jspdf || !window.jspdf.jsPDF) {
    exportPrintableHtml();
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const n = currentLecture.notes;

  let y = 15;
  const addLine = (text, size = 11, gap = 7) => {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, 180);
    lines.forEach((line) => {
      if (y > 280) { doc.addPage(); y = 15; }
      doc.text(line, 14, y);
      y += gap;
    });
  };

  addLine(currentLecture.subject, 18, 9);
  addLine(`Subject Tag: ${currentLecture.subjectTag || "General"} | Teacher: ${currentLecture.teacher} | ${new Date(currentLecture.date).toLocaleString()}`, 10, 8);
  addLine("");
  addLine("1-Minute Summary:", 13, 7);
  addLine(n.summaryShort || "-");
  addLine("");
  addLine("Structured Notes:", 13, 7);
  n.sections.forEach((s) => {
    addLine(s.heading, 12, 7);
    s.bullets.forEach((b) => addLine("• " + b));
  });
  addLine("");
  addLine("Keywords: " + n.keywords.join(", "));

  doc.save(`${currentLecture.subject.replace(/\s+/g, "_")}_notes.pdf`);
}

// Multi-Format Export 2: Word Document (.doc)
function exportDoc() {
  toggleExportMenu();
  if (!currentLecture) return;
  const n = currentLecture.notes;

  let html = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset='utf-8'><title>${currentLecture.subject}</title>
    <style>body{font-family:Arial,sans-serif;line-height:1.6;padding:20px;} h1{color:#1B1F3B;} h2{color:#C1666B;border-bottom:1px solid #ddd;} ul{padding-left:20px;}</style>
    </head><body>
    <h1>${currentLecture.subject}</h1>
    <p><b>Course:</b> ${currentLecture.subjectTag || "General"} | <b>Teacher:</b> ${currentLecture.teacher} | <b>Date:</b> ${new Date(currentLecture.date).toLocaleDateString()}</p>
    <h2>📝 1-Minute Summary</h2><p>${n.summaryShort}</p>
    <h2>📖 5-Minute Summary</h2><p>${n.summary5min}</p>
    <h2>📚 Structured Notes</h2>
    ${n.sections.map(s => `<h3>${s.heading}</h3><ul>${s.bullets.map(b => `<li>${b}</li>`).join("")}</ul>`).join("")}
    <h2>📌 Key Definitions</h2>
    <ul>${n.definitions.map(d => `<li><b>${d.term}:</b> ${d.definition}</li>`).join("")}</ul>
    <h2>➗ Formulas</h2>
    <ul>${n.formulas.map(f => `<li>${f}</li>`).join("")}</ul>
    <h2>🏷️ Keywords</h2><p>${n.keywords.join(", ")}</p>
    </body></html>
  `;

  const blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${currentLecture.subject.replace(/\s+/g, "_")}_notes.doc`;
  a.click();
  URL.revokeObjectURL(url);
}

// Multi-Format Export 3: Plain Text File (.txt)
function exportTxt() {
  toggleExportMenu();
  if (!currentLecture) return;
  const n = currentLecture.notes;

  let txt = `====================================================\n`;
  txt += `LECTURE NOTES: ${currentLecture.subject.toUpperCase()}\n`;
  txt += `Course: ${currentLecture.subjectTag || "General"} | Teacher: ${currentLecture.teacher}\n`;
  txt += `Date: ${new Date(currentLecture.date).toLocaleString()}\n`;
  txt += `====================================================\n\n`;
  txt += `[1-MINUTE SUMMARY]\n${n.summaryShort}\n\n`;
  txt += `[5-MINUTE SUMMARY]\n${n.summary5min}\n\n`;
  txt += `[STRUCTURED NOTES]\n`;
  n.sections.forEach(s => {
    txt += `* ${s.heading}:\n`;
    s.bullets.forEach(b => { txt += `  - ${b}\n`; });
    txt += `\n`;
  });
  if (n.definitions.length) {
    txt += `[KEY DEFINITIONS]\n`;
    n.definitions.forEach(d => { txt += `- ${d.term}: ${d.definition}\n`; });
    txt += `\n`;
  }
  if (n.formulas.length) {
    txt += `[FORMULAS]\n`;
    n.formulas.forEach(f => { txt += `- ${f}\n`; });
    txt += `\n`;
  }
  txt += `[KEYWORDS]\n${n.keywords.join(", ")}\n`;

  const blob = new Blob([txt], { type: "text/plain;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${currentLecture.subject.replace(/\s+/g, "_")}_notes.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// Multi-Format Export 4: Visual Note Snapshot Image (.png)
function exportImage() {
  toggleExportMenu();
  if (!currentLecture) return;
  const n = currentLecture.notes;

  const canvas = document.createElement("canvas");
  const width = 900;
  const height = 1100;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#FDFBF7";
  ctx.fillRect(0, 0, width, height);

  // Top Header Banner
  ctx.fillStyle = "#1B1F3B";
  ctx.fillRect(0, 0, width, 110);

  // Title
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 26px Georgia, serif";
  ctx.fillText(currentLecture.subject.slice(0, 48), 40, 50);

  // Subtitle
  ctx.font = "14px sans-serif";
  ctx.fillStyle = "#E8A33D";
  ctx.fillText(`🏷️ ${currentLecture.subjectTag || "General"} | 👤 ${currentLecture.teacher} | 📅 ${new Date(currentLecture.date).toLocaleDateString()}`, 40, 85);

  let curY = 150;
  const drawSection = (title, textLines, color = "#C1666B") => {
    ctx.fillStyle = color;
    ctx.font = "bold 18px Georgia, serif";
    ctx.fillText(title, 40, curY);
    curY += 24;

    ctx.fillStyle = "#2B2D42";
    ctx.font = "14px sans-serif";
    textLines.forEach(line => {
      const words = String(line).split(" ");
      let currentLine = "";
      for (let w of words) {
        const testLine = currentLine + w + " ";
        if (ctx.measureText(testLine).width > 810) {
          ctx.fillText(currentLine, 45, curY);
          currentLine = w + " ";
          curY += 20;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        ctx.fillText(currentLine, 45, curY);
        curY += 22;
      }
    });
    curY += 15;
  };

  // 1-Min Summary
  drawSection("📝 Summary", [n.summaryShort || ""]);

  // Key Notes
  const bullets = [];
  n.sections.slice(0, 3).forEach(s => {
    bullets.push(`• ${s.heading}:`);
    s.bullets.slice(0, 2).forEach(b => bullets.push(`   - ${b}`));
  });
  drawSection("📚 Key Structured Notes", bullets);

  // Keywords
  if (n.keywords && n.keywords.length) {
    drawSection("🏷️ Core Keywords", [n.keywords.slice(0, 10).join("   •   ")], "#4E8FB8");
  }

  // Watermark Footer
  ctx.fillStyle = "#888888";
  ctx.font = "12px sans-serif";
  ctx.fillText("Generated by NotesPilot AI (Visual Note Snapshot)", 40, height - 25);

  // Download image
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `${currentLecture.subject.replace(/\s+/g, "_")}_notes.png`;
  a.click();
}

// ================================================================
// 🤖 RESPONSIVE AI ASSISTANT & SYNTHESIS HANDLER
// ================================================================

function runAiSynthesis(action) {
  if (!currentLecture) return;
  const n = currentLecture.notes;
  const outputBox = document.getElementById("responsive-ai-output");
  const titleEl = document.getElementById("responsive-ai-title");
  const contentEl = document.getElementById("responsive-ai-content");

  if (!outputBox || !contentEl) return;

  outputBox.classList.remove("hidden");

  if (action === "3bullet") {
    titleEl.textContent = "⚡ Top 3-Bullet Key Takeaways:";
    const items = (n.highlights && n.highlights.length >= 3)
      ? n.highlights.slice(0, 3)
      : (n.sections[0] ? n.sections[0].bullets.slice(0, 3) : ["Key concepts summarized in your notes."]);
    contentEl.innerHTML = items.map((it, idx) => `<strong>${idx + 1}.</strong> ${it}`).join("\n\n");
  } else if (action === "eli5") {
    titleEl.textContent = "💡 Explain Simply (ELI5 Concept Breakdown):";
    contentEl.innerHTML = `Imagine you are explaining <strong>${currentLecture.subject}</strong> to a 10-year-old:\n\n` +
      `• In simple terms: ${n.summaryShort || "This lecture teaches how concepts connect logically."}\n` +
      `• Real-world analogy: It works just like a structured blueprint where each part has a specific role.\n` +
      `• Key rule to remember: ${n.definitions[0] ? n.definitions[0].term + " means " + n.definitions[0].definition : "Focus on the core definitions."}`;
  } else if (action === "quiz3") {
    titleEl.textContent = "🎯 3 Instant Practice Flash Questions:";
    const q1 = n.definitions[0] ? `What is the definition of ${n.definitions[0].term}?` : `What is the primary topic of ${currentLecture.subject}?`;
    const a1 = n.definitions[0] ? n.definitions[0].definition : n.summaryShort;
    
    const q2 = n.keywords[1] ? `Explain the role of "${n.keywords[1]}" in this lecture.` : `What are the key principles?`;
    const a2 = n.sections[0] ? n.sections[0].bullets[0] || "Refer to structured notes." : "Review notes.";

    const q3 = `Why is ${currentLecture.subject} important?`;
    const a3 = n.summary5min || "It provides fundamental principles for understanding.";

    contentEl.innerHTML = `<strong>Q1:</strong> ${q1}\n<em class="muted">Answer:</em> ${a1}\n\n` +
      `<strong>Q2:</strong> ${q2}\n<em class="muted">Answer:</em> ${a2}\n\n` +
      `<strong>Q3:</strong> ${q3}\n<em class="muted">Answer:</em> ${a3}`;
  } else if (action === "formulas") {
    titleEl.textContent = "➗ Essential Formulas & Definition Cheatsheet:";
    let body = "";
    if (n.formulas && n.formulas.length) {
      body += "📐 FORMULAS:\n" + n.formulas.map(f => `• ${f}`).join("\n") + "\n\n";
    }
    if (n.definitions && n.definitions.length) {
      body += "📌 DEFINITIONS:\n" + n.definitions.map(d => `• ${d.term}: ${d.definition}`).join("\n");
    }
    if (!body) body = "No explicit mathematical formulas in this lecture. Review structured notes.";
    contentEl.innerHTML = body;
  }
}

// Multi-Format Export 2: Markdown (.md)
function exportMarkdown() {
  toggleExportMenu();
  if (!currentLecture) return;
  const n = currentLecture.notes;

  let md = `# 📚 ${currentLecture.subject}\n\n`;
  md += `**Subject Tag:** ${currentLecture.subjectTag || "General"}  \n`;
  md += `**Teacher:** ${currentLecture.teacher}  \n`;
  md += `**Date:** ${new Date(currentLecture.date).toLocaleString()}\n\n`;

  md += `## 📝 1-Minute Summary\n${n.summaryShort}\n\n`;
  md += `## 📖 5-Minute Summary\n${n.summary5min}\n\n`;

  md += `## 📚 Structured Notes\n`;
  n.sections.forEach((sec) => {
    md += `### ${sec.heading}\n`;
    sec.bullets.forEach((b) => { md += `- ${b}\n`; });
    md += `\n`;
  });

  if (n.definitions.length) {
    md += `## 📌 Key Definitions\n`;
    n.definitions.forEach((d) => { md += `- **${d.term}:** ${d.definition}\n`; });
    md += `\n`;
  }

  if (n.formulas.length) {
    md += `## ➗ Formulas\n`;
    n.formulas.forEach((f) => { md += `- \`${f}\`\n`; });
    md += `\n`;
  }

  md += `## 🏷️ Keywords\n${n.keywords.join(", ")}\n`;

  const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${currentLecture.subject.replace(/\s+/g, "_")}_notes.md`;
  link.click();
  URL.revokeObjectURL(url);
}

// Multi-Format Export 3: Printable HTML Paper Layout
function exportPrintableHtml() {
  toggleExportMenu();
  if (!currentLecture) return;
  const n = currentLecture.notes;

  const printWin = window.open("", "_blank");
  printWin.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${currentLecture.subject} - Notes</title>
      <style>
        body { font-family: Georgia, serif; padding: 40px; color: #111; max-width: 800px; margin: 0 auto; line-height: 1.6; }
        h1 { border-bottom: 2px solid #C1666B; padding-bottom: 8px; font-size: 24px; }
        h2 { color: #1B1F3B; margin-top: 24px; font-size: 18px; border-bottom: 1px solid #ddd; }
        ul { padding-left: 20px; }
        .tag { background: #E8A33D; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
      </style>
    </head>
    <body>
      <h1>📚 ${currentLecture.subject}</h1>
      <p><strong>Tag:</strong> ${currentLecture.subjectTag || "General"} | <strong>Teacher:</strong> ${currentLecture.teacher} | <strong>Date:</strong> ${new Date(currentLecture.date).toLocaleDateString()}</p>
      <h2>📝 Summary</h2>
      <p>${n.summary5min}</p>
      <h2>📚 Structured Notes</h2>
      ${n.sections.map((s) => `<h3>${s.heading}</h3><ul>${s.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>`).join("")}
      <h2>📌 Definitions</h2>
      <ul>${n.definitions.map((d) => `<li><strong>${d.term}:</strong> ${d.definition}</li>`).join("")}</ul>
      <script>window.print();</script>
    </body>
    </html>
  `);
  printWin.document.close();
}

// Multi-Format Export 4: Copy to Clipboard
async function copyNotesToClipboard() {
  toggleExportMenu();
  if (!currentLecture) return;
  const n = currentLecture.notes;

  let text = `📚 ${currentLecture.subject} (${currentLecture.subjectTag || "General"})\n`;
  text += `Teacher: ${currentLecture.teacher} | ${new Date(currentLecture.date).toLocaleDateString()}\n\n`;
  text += `SUMMARY:\n${n.summaryShort}\n\n`;
  text += `KEY NOTES:\n`;
  n.sections.forEach((s) => {
    text += `* ${s.heading}:\n`;
    s.bullets.forEach((b) => { text += `  - ${b}\n`; });
  });

  try {
    await navigator.clipboard.writeText(text);
    const toast = document.getElementById("export-toast");
    if (toast) toast.textContent = "✅ Lecture notes copied to clipboard!";
  } catch (err) {
    alert("Could not copy automatically. Output:\n\n" + text);
  }
}

// Multi-Format Export 5: Backup JSON Data
function exportJson() {
  toggleExportMenu();
  if (!currentLecture) return;
  const jsonStr = JSON.stringify(currentLecture, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${currentLecture.subject.replace(/\s+/g, "_")}_raw.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function searchNotes() {
  const q = document.getElementById("search-input").value.trim();
  const resultsDiv = document.getElementById("search-results");
  if (!q) { resultsDiv.innerHTML = ""; return; }

  try {
    const { results } = await apiCall(`/lectures/search/${encodeURIComponent(q)}`);
    resultsDiv.innerHTML = results.length
      ? `<h4 style="margin-top:16px;">Search Results</h4>` +
        results
          .map(
            (r) => `
          <div style="padding:8px 0; border-bottom:1px solid var(--border); cursor:pointer;" onclick="selectLecture('${r.id}')">
            <strong>${r.subject}</strong> <span class="tag" style="font-size:0.75rem;">🏷️ ${r.subjectTag || "General"}</span>
            <div class="muted" style="font-size:0.82rem;">${r.matchPreview}</div>
          </div>`
          )
          .join("")
      : `<p class="muted" style="margin-top:12px;">No matches found for "${q}".</p>`;
  } catch (err) {
    resultsDiv.innerHTML = `<p class="error-msg">${err.message}</p>`;
  }
}

// ================================================================
// ✍️ HANDWRITTEN NOTES STUDY MODE & UPLOAD HANDLERS
// ================================================================

function switchStudyMode(mode) {
  currentStudyMode = mode;
  if (currentLecture) renderNotesPanel(currentLecture);
}

function triggerHandwrittenUpload() {
  const input = document.getElementById("handwritten-file-input");
  if (input) input.click();
}

function onHandwrittenFilesSelected(event) {
  const files = event.target.files;
  if (files && files.length > 0) {
    processHandwrittenFiles(Array.from(files));
  }
  event.target.value = ""; // reset
}

function handleHandwrittenDrop(event) {
  event.preventDefault();
  const files = event.dataTransfer.files;
  if (files && files.length > 0) {
    processHandwrittenFiles(Array.from(files));
  }
}

async function processHandwrittenFiles(files) {
  if (!currentLecture) return;
  const imageFiles = files.filter(f => f.type.startsWith("image/"));
  if (imageFiles.length === 0) {
    alert("Please upload image files (JPG, JPEG, PNG, WEBP).");
    return;
  }

  const readPromises = imageFiles.map((file, idx) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve({
          name: file.name.replace(/\.[^/.]+$/, "") || `Page ${idx + 1}`,
          dataUrl: e.target.result
        });
      };
      reader.readAsDataURL(file);
    });
  });

  try {
    const pages = await Promise.all(readPromises);
    const res = await apiCall(`/lectures/${currentLecture.id}/handwritten`, "POST", { pages });
    currentLecture.handwrittenPages = res.handwrittenPages;
    activeHandwrittenPageIndex = Math.max(0, currentLecture.handwrittenPages.length - pages.length);
    renderNotesPanel(currentLecture);
  } catch (err) {
    alert("Failed to upload handwritten pages: " + err.message);
  }
}

async function deleteHandwrittenPage(pageId) {
  if (!currentLecture) return;
  if (!confirm("Are you sure you want to remove this handwritten page?")) return;

  try {
    const res = await apiCall(`/lectures/${currentLecture.id}/handwritten/${pageId}`, "DELETE");
    currentLecture.handwrittenPages = res.handwrittenPages;
    if (activeHandwrittenPageIndex >= currentLecture.handwrittenPages.length) {
      activeHandwrittenPageIndex = Math.max(0, currentLecture.handwrittenPages.length - 1);
    }
    renderNotesPanel(currentLecture);
  } catch (err) {
    alert("Failed to delete page: " + err.message);
  }
}

async function moveHandwrittenPage(pageId, direction) {
  if (!currentLecture || !currentLecture.handwrittenPages) return;
  const pages = [...currentLecture.handwrittenPages];
  const idx = pages.findIndex(p => p.id === pageId);
  if (idx === -1) return;

  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= pages.length) return;

  // Swap
  const temp = pages[idx];
  pages[idx] = pages[targetIdx];
  pages[targetIdx] = temp;

  const pageIds = pages.map(p => p.id);
  try {
    const res = await apiCall(`/lectures/${currentLecture.id}/handwritten/reorder`, "PUT", { pageIds });
    currentLecture.handwrittenPages = res.handwrittenPages;
    activeHandwrittenPageIndex = targetIdx;
    renderNotesPanel(currentLecture);
  } catch (err) {
    alert("Failed to reorder: " + err.message);
  }
}

function selectHandwrittenPage(index) {
  activeHandwrittenPageIndex = index;
  if (currentLecture) renderNotesPanel(currentLecture);
}

function navigateHandwrittenPage(delta) {
  if (!currentLecture || !currentLecture.handwrittenPages) return;
  const count = currentLecture.handwrittenPages.length;
  const nextIdx = activeHandwrittenPageIndex + delta;
  if (nextIdx >= 0 && nextIdx < count) {
    activeHandwrittenPageIndex = nextIdx;
    renderNotesPanel(currentLecture);
  }
}

function changeHandwrittenZoom(delta) {
  handwrittenZoom = Math.max(0.5, Math.min(3.0, handwrittenZoom + delta));
  const img = document.getElementById("active-handwritten-img");
  if (img) img.style.transform = `scale(${handwrittenZoom})`;
}

function resetHandwrittenZoom() {
  handwrittenZoom = 1.0;
  const img = document.getElementById("active-handwritten-img");
  if (img) img.style.transform = `scale(1.0)`;
}

function toggleHandwrittenFilter() {
  if (handwrittenFilterMode === "normal") handwrittenFilterMode = "contrast";
  else if (handwrittenFilterMode === "contrast") handwrittenFilterMode = "inverted";
  else handwrittenFilterMode = "normal";

  if (currentLecture) renderNotesPanel(currentLecture);
}

function toggleHandwrittenFullscreen() {
  const stage = document.getElementById("handwritten-study-stage");
  if (!stage) return;
  if (!document.fullscreenElement) {
    stage.requestFullscreen().catch(err => alert("Fullscreen error: " + err.message));
  } else {
    document.exitFullscreen();
  }
}

async function analyzeHandwrittenNotes() {
  if (!currentLecture) return;
  if (!currentLecture.handwrittenPages || currentLecture.handwrittenPages.length === 0) {
    alert("Please upload at least 1 handwritten notebook page before analyzing.");
    return;
  }

  try {
    const res = await apiCall(`/lectures/${currentLecture.id}/handwritten/analyze`, "POST");
    currentLecture.handwrittenAnalysis = res.analysis;
    renderNotesPanel(currentLecture);
  } catch (err) {
    alert("Error analyzing handwritten notes: " + err.message);
  }
}

function renderHandwrittenNotesHtml(lecture) {
  const pages = lecture.handwrittenPages || [];
  const count = pages.length;

  if (activeHandwrittenPageIndex >= count) activeHandwrittenPageIndex = Math.max(0, count - 1);
  const activePage = pages[activeHandwrittenPageIndex];
  const analysis = lecture.handwrittenAnalysis;

  let filterStyle = "";
  if (handwrittenFilterMode === "contrast") filterStyle = "filter: contrast(160%) brightness(95%);";
  else if (handwrittenFilterMode === "inverted") filterStyle = "filter: invert(90%) hue-rotate(180deg);";

  return `
    <div class="handwritten-wrapper">
      <div class="flex-between" style="flex-wrap:wrap; gap:10px; margin-bottom:14px; background:var(--card-bg); padding:12px 16px; border-radius:var(--radius); border:1px solid var(--border);">
        <div class="flex" style="gap:8px; align-items:center; flex-wrap:wrap;">
          <button class="btn btn-accent btn-sm" onclick="triggerHandwrittenUpload()">
            📤 Upload Pages
          </button>
          <input type="file" id="handwritten-file-input" multiple accept="image/png, image/jpeg, image/jpg, image/webp" style="display:none;" onchange="onHandwrittenFilesSelected(event)" />
          
          <button class="btn btn-ghost btn-sm" style="border-color:var(--accent-blue);" onclick="analyzeHandwrittenNotes()" title="Extract text, summary and questions without changing images">
            🔍 Analyze My Handwritten Notes
          </button>
        </div>

        <!-- Study View Controls (Zoom, Filter, Fullscreen) -->
        <div class="flex" style="gap:6px; align-items:center; flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" onclick="toggleHandwrittenFilter()" title="Toggle contrast enhancement / night invert">
            🌓 ${handwrittenFilterMode === 'normal' ? 'Normal View' : (handwrittenFilterMode === 'contrast' ? 'High Contrast' : 'Night Invert')}
          </button>
          <button class="btn btn-ghost btn-sm" onclick="changeHandwrittenZoom(0.15)" title="Zoom In">🔍+</button>
          <button class="btn btn-ghost btn-sm" onclick="changeHandwrittenZoom(-0.15)" title="Zoom Out">🔍-</button>
          <button class="btn btn-ghost btn-sm" onclick="resetHandwrittenZoom()" title="Reset Zoom">100%</button>
          <button class="btn btn-ghost btn-sm" onclick="toggleHandwrittenFullscreen()" title="Fullscreen">⛶ Fullscreen</button>
        </div>
      </div>

      ${count === 0 ? `
        <!-- Empty Upload Dropzone -->
        <div class="handwritten-dropzone" onclick="triggerHandwrittenUpload()" ondragover="event.preventDefault()" ondrop="handleHandwrittenDrop(event)" style="border:2px dashed var(--accent-blue); padding:40px 20px; text-align:center; background:var(--paper); border-radius:var(--radius); cursor:pointer;">
          <div style="font-size:3rem; margin-bottom:10px;">✍️</div>
          <h3 style="margin-bottom:6px;">Upload Your Handwritten Notes</h3>
          <p class="muted" style="max-width:500px; margin:0 auto 16px;">
            Drag & drop or click to upload photos of your handwritten notebook pages. Supported formats: <strong>JPG, JPEG, PNG, WEBP</strong>.
          </p>
          <button type="button" class="btn btn-primary">Choose Handwritten Images</button>
        </div>
      ` : `
        <!-- Active Page Study Stage -->
        <div class="handwritten-study-stage" id="handwritten-study-stage" style="background:#1B1F3B; border-radius:12px; padding:16px; text-align:center; position:relative; overflow:auto; min-height:420px; max-height:680px; display:flex; align-items:center; justify-content:center;">
          <img id="active-handwritten-img" src="${activePage.dataUrl}" alt="${escapeHtml(activePage.name)}" style="max-width:100%; max-height:620px; border-radius:6px; box-shadow:0 8px 24px rgba(0,0,0,0.5); transform:scale(${handwrittenZoom}); transition:transform 0.15s ease; ${filterStyle}" />
        </div>

        <!-- Page Navigation Toolbar -->
        <div class="flex-between" style="margin-top:12px; background:var(--card-bg); padding:10px 16px; border-radius:8px; border:1px solid var(--border);">
          <button class="btn btn-ghost btn-sm" onclick="navigateHandwrittenPage(-1)" ${activeHandwrittenPageIndex === 0 ? 'disabled' : ''}>
            ◀ Previous Page
          </button>
          <span style="font-weight:600; font-size:0.92rem;">
            📖 Page ${activeHandwrittenPageIndex + 1} of ${count} · <span class="muted">${escapeHtml(activePage.name)}</span>
          </span>
          <button class="btn btn-ghost btn-sm" onclick="navigateHandwrittenPage(1)" ${activeHandwrittenPageIndex === count - 1 ? 'disabled' : ''}>
            Next Page ▶
          </button>
        </div>

        <!-- Thumbnail Filmstrip & Page Reordering -->
        <div style="margin-top:16px;">
          <strong style="font-size:0.85rem; color:var(--ink-soft); display:block; margin-bottom:8px;">📑 Pages Filmstrip (Click to jump, use arrows to reorder):</strong>
          <div class="thumbnail-filmstrip" style="display:flex; gap:10px; overflow-x:auto; padding-bottom:8px;">
            ${pages.map((p, idx) => `
              <div class="thumbnail-card ${idx === activeHandwrittenPageIndex ? 'active-thumb' : ''}" style="flex-shrink:0; width:105px; text-align:center; background:var(--card-bg); border:2px solid ${idx === activeHandwrittenPageIndex ? 'var(--accent-blue)' : 'var(--border)'}; border-radius:8px; padding:6px;">
                <img src="${p.dataUrl}" onclick="selectHandwrittenPage(${idx})" style="width:100%; height:75px; object-fit:cover; border-radius:4px; cursor:pointer;" />
                <span style="font-size:0.75rem; display:block; margin:4px 0; font-weight:600;">P. ${idx + 1}</span>
                <div class="flex-between" style="gap:2px;">
                  <button class="btn btn-ghost" style="padding:1px 4px; font-size:0.7rem;" onclick="moveHandwrittenPage('${p.id}', -1)" title="Move Left">◀</button>
                  <button class="btn btn-ghost" style="padding:1px 4px; font-size:0.7rem; color:#E63946;" onclick="deleteHandwrittenPage('${p.id}')" title="Delete Page">🗑️</button>
                  <button class="btn btn-ghost" style="padding:1px 4px; font-size:0.7rem;" onclick="moveHandwrittenPage('${p.id}', 1)" title="Move Right">▶</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `}

      <!-- 🔍 AI Analysis of Handwritten Notes (Keeps Original Images Intact) -->
      ${analysis ? `
        <div class="card" style="margin-top:20px; border-left:4px solid var(--accent-amber); background:var(--card-bg);">
          <div class="flex-between" style="border-bottom:1px solid var(--border); padding-bottom:8px; margin-bottom:12px;">
            <h4 style="margin:0; display:flex; align-items:center; gap:8px;">
              🤖 AI Analysis of Your Handwritten Notes
            </h4>
            <span class="tag" style="background:rgba(232, 163, 61, 0.2); color:var(--accent-amber); font-weight:600;">
              ✨ Synthesized from ${analysis.pageCount} Page(s)
            </span>
          </div>

          <div style="margin-bottom:14px;">
            <strong style="color:var(--ink-soft); font-size:0.85rem;">📝 Extracted Readable Transcription:</strong>
            <pre style="background:var(--paper); padding:10px 14px; border-radius:8px; font-size:0.88rem; line-height:1.5; white-space:pre-wrap; font-family:inherit; margin:6px 0 0;">${escapeHtml(analysis.extractedText)}</pre>
          </div>

          <div style="margin-bottom:14px;">
            <strong style="color:var(--ink-soft); font-size:0.85rem;">📖 Summary of Your Notes:</strong>
            <p style="margin:4px 0 0; font-size:0.92rem;">${escapeHtml(analysis.summary)}</p>
          </div>

          <div>
            <strong style="color:var(--ink-soft); font-size:0.85rem;">🎯 Possible Exam & Practice Questions:</strong>
            <ul style="margin:4px 0 0; padding-left:18px; font-size:0.9rem;">
              ${(analysis.practiceQuestions || []).map(q => `<li><strong>Q:</strong> ${escapeHtml(q)}</li>`).join('')}
            </ul>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

// Close modals when clicking outside
window.addEventListener("click", (e) => {
  const appModal = document.getElementById("app-modal");
  if (appModal && e.target === appModal) {
    closeModal();
  }
  // Close export dropdown if clicked outside
  const exportDropdown = document.getElementById("export-dropdown");
  if (exportDropdown && !exportDropdown.classList.contains("hidden")) {
    const exportBtn = e.target.closest("button");
    if (!exportBtn || !exportBtn.textContent.includes("Export")) {
      exportDropdown.classList.add("hidden");
    }
  }
});

// Run initial loading on page load
loadSubjectTags();
loadLectureList();

