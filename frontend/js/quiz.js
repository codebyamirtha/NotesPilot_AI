// ================================================================
// quiz.js - AI Active Recall Quiz Generator & Evaluator
// ================================================================

requireAuth();
renderNavbar("quiz.html");

let activeQuiz = null;
let selectedQuestionCount = 10;
let currentLectures = [];

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function setQuestionCount(count) {
  selectedQuestionCount = count;
  document.querySelectorAll("#count-pills .count-pill").forEach((btn) => {
    if (parseInt(btn.getAttribute("data-count"), 10) === count) {
      btn.style.borderColor = "var(--accent-amber)";
      btn.style.background = "rgba(232,163,61,0.15)";
      btn.style.fontWeight = "600";
    } else {
      btn.style.borderColor = "";
      btn.style.background = "";
      btn.style.fontWeight = "normal";
    }
  });
}

async function loadLecturesIntoSelect() {
  const select = document.getElementById("lecture-select");
  const generateBtn = document.getElementById("btn-generate-quiz");

  try {
    const { lectures } = await apiCall("/lectures");
    currentLectures = lectures || [];

    if (currentLectures.length === 0) {
      select.innerHTML = `<option value="">No lectures recorded yet - Record or import notes first</option>`;
      if (generateBtn) generateBtn.disabled = true;
      return;
    }

    if (generateBtn) generateBtn.disabled = false;
    select.innerHTML = currentLectures
      .map(
        (l) =>
          `<option value="${l.id}">${escapeHtml(l.subject || "Untitled")} — ${new Date(
            l.date
          ).toLocaleDateString()}</option>`
      )
      .join("");

    const wantedId = getQueryParam("id");
    if (wantedId && currentLectures.some((l) => l.id === wantedId)) {
      select.value = wantedId;
      // Auto-trigger generation if navigating with a lecture ID
      generateQuiz();
    }
  } catch (err) {
    console.error("Failed to load lectures:", err);
    select.innerHTML = `<option value="">Error loading lectures</option>`;
  }
}

async function generateQuiz() {
  const select = document.getElementById("lecture-select");
  const lectureId = select.value;
  if (!lectureId) {
    alert("Please select a lecture first.");
    return;
  }

  const loadingEl = document.getElementById("quiz-loading");
  const workspaceEl = document.getElementById("quiz-workspace");
  const resultEl = document.getElementById("quiz-result");
  const generateBtn = document.getElementById("btn-generate-quiz");

  resultEl.classList.add("hidden");
  workspaceEl.classList.add("hidden");
  loadingEl.classList.remove("hidden");
  if (generateBtn) generateBtn.disabled = true;

  try {
    const { quiz } = await apiCall("/quiz/generate", "POST", {
      lectureId,
      count: selectedQuestionCount
    });

    activeQuiz = quiz;
    loadingEl.classList.add("hidden");
    workspaceEl.classList.remove("hidden");
    renderQuiz(quiz);
  } catch (err) {
    loadingEl.classList.add("hidden");
    alert("Error generating quiz: " + err.message);
  } finally {
    if (generateBtn) generateBtn.disabled = false;
  }
}

function updateProgress() {
  if (!activeQuiz || !activeQuiz.questions) return;
  const form = document.getElementById("quiz-form");
  const formData = new FormData(form);
  let answered = 0;

  activeQuiz.questions.forEach((_, idx) => {
    const val = formData.get(`q${idx}`);
    if (val && String(val).trim().length > 0) answered++;
  });

  const progressEl = document.getElementById("quiz-progress-text");
  if (progressEl) {
    progressEl.textContent = `${answered} of ${activeQuiz.questions.length} Answered`;
  }
}

function selectRadioOption(labelEl, name, value) {
  const container = labelEl.closest(".quiz-options-grid");
  if (container) {
    container.querySelectorAll(".quiz-option-label").forEach((lbl) => {
      lbl.classList.remove("selected");
    });
  }
  labelEl.classList.add("selected");
  const radio = labelEl.querySelector('input[type="radio"]');
  if (radio) {
    radio.checked = true;
    updateProgress();
  }
}

function renderQuiz(quiz) {
  const form = document.getElementById("quiz-form");
  const titleEl = document.getElementById("quiz-subject-title");
  if (titleEl) {
    titleEl.textContent = `📝 ${escapeHtml(quiz.subject || "Lecture")} — Quiz (${quiz.questions.length} Questions)`;
  }

  if (!quiz.questions || quiz.questions.length === 0) {
    form.innerHTML = `
      <div class="card" style="text-align:center; padding:32px 20px;">
        <h3>No Questions Generated</h3>
        <p class="muted">This lecture doesn't have sufficient notes yet. Try adding more notes or picking another lecture.</p>
      </div>`;
    return;
  }

  form.innerHTML =
    quiz.questions
      .map((q, idx) => {
        const isTrueFalse = q.type === "true-false" || q.type === "true_false";
        const isFillBlank = q.type === "fill_blank" || q.type === "fill-blank";
        const isMcq = !isTrueFalse && !isFillBlank;

        const typeBadge =
          isMcq
            ? '<span class="tag" style="background:var(--accent-blue); color:white;">MCQ</span>'
            : isTrueFalse
            ? '<span class="tag" style="background:var(--sage); color:white;">True / False</span>'
            : '<span class="tag" style="background:var(--accent-amber); color:white;">Fill-in-the-Blank</span>';

        const difficultyBadge =
          q.difficulty === "Hard"
            ? '<span class="capacity-pill" style="color:#E63946; border-color:#E63946;">🔥 Hard</span>'
            : q.difficulty === "Easy"
            ? '<span class="capacity-pill" style="color:#2A9D8F; border-color:#2A9D8F;">🌱 Easy</span>'
            : '<span class="capacity-pill" style="color:var(--accent-amber); border-color:var(--accent-amber);">⚡ Medium</span>';

        let bodyHtml = "";

        if (isMcq || isTrueFalse) {
          const options = q.options && q.options.length > 0 ? q.options : (isTrueFalse ? ["True", "False"] : []);
          bodyHtml = `
            <div class="quiz-options-grid">
              ${options
                .map(
                  (opt) => `
                <label class="quiz-option-label" onclick="selectRadioOption(this, 'q${idx}', '${escapeHtml(opt)}')">
                  <input type="radio" name="q${idx}" value="${escapeHtml(opt)}" onchange="updateProgress()" />
                  <span>${escapeHtml(opt)}</span>
                </label>`
                )
                .join("")}
            </div>`;
        } else {
          // Fill in the blank
          bodyHtml = `
            <div>
              <input type="text" class="quiz-input-field" name="q${idx}" placeholder="Type your answer here..." oninput="updateProgress()" autocomplete="off" />
            </div>`;
        }

        return `
          <div class="quiz-question-card">
            <div class="quiz-q-meta">
              <div style="display:flex; align-items:center; gap:8px;">
                <strong style="color:var(--ink);">Question ${idx + 1}</strong>
                ${typeBadge}
              </div>
              <div>${difficultyBadge}</div>
            </div>
            <div class="quiz-q-text">${escapeHtml(q.question)}</div>
            ${bodyHtml}
          </div>`;
      })
      .join("") +
    `
    <div style="margin-top:20px; display:flex; justify-content:flex-end;">
      <button type="submit" id="btn-submit-quiz" class="btn btn-primary" style="padding:12px 32px; font-size:1rem; font-weight:600;">
        🚀 Submit Quiz
      </button>
    </div>`;

  form.onsubmit = submitQuiz;
  updateProgress();
}

async function submitQuiz(e) {
  e.preventDefault();
  if (!activeQuiz) return;

  const submitBtn = document.getElementById("btn-submit-quiz");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Grading Quiz...";
  }

  const formData = new FormData(e.target);
  const answers = {};
  activeQuiz.questions.forEach((q, idx) => {
    answers[idx] = formData.get(`q${idx}`) || "";
  });

  try {
    const { score, results } = await apiCall(`/quiz/${activeQuiz.id}/submit`, "POST", { answers });
    renderResults(score, results);
  } catch (err) {
    alert("Submission error: " + err.message);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "🚀 Submit Quiz";
    }
  }
}

function renderResults(score, results) {
  const workspaceEl = document.getElementById("quiz-workspace");
  const resultEl = document.getElementById("quiz-result");

  workspaceEl.classList.add("hidden");
  resultEl.classList.remove("hidden");

  const emoji =
    score.percentage >= 80 ? "🏆" : score.percentage >= 60 ? "🎉" : score.percentage >= 40 ? "📚" : "💪";

  const feedbackText =
    score.percentage >= 80
      ? "Outstanding Mastery! You have a solid grasp of this lecture material."
      : score.percentage >= 60
      ? "Good Job! A quick review of missed concepts will make your understanding bulletproof."
      : "Keep practicing! Review your Cornell notes and retry to reinforce retention.";

  const reviewItemsHtml = results
    .map((r, idx) => {
      const isCorrect = r.isCorrect;
      const statusPill = isCorrect
        ? '<span class="tag" style="background:#2A9D8F; color:white;">✅ Correct</span>'
        : '<span class="tag" style="background:#E63946; color:white;">❌ Incorrect</span>';

      return `
        <div class="quiz-question-card ${isCorrect ? "quiz-review-correct" : "quiz-review-incorrect"}">
          <div class="quiz-q-meta">
            <div style="display:flex; align-items:center; gap:8px;">
              <strong style="color:var(--ink);">Question ${idx + 1}</strong>
              <span class="muted">(${r.type.toUpperCase()})</span>
            </div>
            <div>${statusPill}</div>
          </div>
          <div class="quiz-q-text">${escapeHtml(r.question)}</div>
          
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px; margin-top:12px;">
            <div style="padding:10px 14px; border-radius:8px; background:${isCorrect ? "rgba(42,157,143,0.1)" : "rgba(230,57,70,0.1)"};">
              <span style="font-size:0.8rem; font-weight:600; color:var(--ink-soft); display:block;">Your Answer:</span>
              <strong style="color:${isCorrect ? "#2A9D8F" : "#E63946"};">${escapeHtml(r.userAnswer)}</strong>
            </div>

            ${
              !isCorrect
                ? `
            <div style="padding:10px 14px; border-radius:8px; background:rgba(42,157,143,0.1);">
              <span style="font-size:0.8rem; font-weight:600; color:var(--ink-soft); display:block;">Correct Answer:</span>
              <strong style="color:#2A9D8F;">${escapeHtml(r.correctAnswer)}</strong>
            </div>`
                : ""
            }
          </div>

          <div class="quiz-explanation-box">
            <strong>💡 AI Explanation:</strong> ${escapeHtml(r.explanation)}
          </div>
        </div>`;
    })
    .join("");

  resultEl.innerHTML = `
    <div class="quiz-score-banner">
      <div style="font-size:3rem; margin-bottom:4px;">${emoji}</div>
      <h2 style="margin:4px 0;">Quiz Completed</h2>
      <div class="quiz-score-badge">${score.correct} / ${score.total} Correct (${score.percentage}%)</div>
      <p style="font-size:1.05rem; max-width:600px; margin:8px auto 20px auto; color:var(--ink-soft);">${feedbackText}</p>
      
      <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="retakeQuiz()">🔄 Retake This Quiz</button>
        <button class="btn btn-accent" onclick="generateQuiz()">⚡ Generate New Questions</button>
        <a href="notes.html" class="btn btn-ghost" style="text-decoration:none;">📖 Review My Notes</a>
      </div>
    </div>

    <h3 style="margin-bottom:16px;">Detailed Question Breakdown</h3>
    ${reviewItemsHtml}
  `;

  resultEl.scrollIntoView({ behavior: "smooth" });
}

function retakeQuiz() {
  if (!activeQuiz) return;
  const workspaceEl = document.getElementById("quiz-workspace");
  const resultEl = document.getElementById("quiz-result");

  resultEl.classList.add("hidden");
  workspaceEl.classList.remove("hidden");
  renderQuiz(activeQuiz);
  workspaceEl.scrollIntoView({ behavior: "smooth" });
}

// Initial load
loadLecturesIntoSelect();
