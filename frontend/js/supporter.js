// ================================================================
// supporter.js - Student Supporter AI Academic Companion
// Powered by OpenAI Platform API with Offline Assistant Fallback
// ================================================================

requireAuth();
renderNavbar("supporter.html");

const STORAGE_KEY_CHAT = "npai_supporter_chat_v1";
const STORAGE_KEY_OPENAI = "npai_openai_key";
const STORAGE_KEY_MODEL = "npai_openai_model";

let chatHistory = [];
let availableLectures = [];
let selectedLectureId = null;

// ================================================================
// INITIALIZATION
// ================================================================
async function initSupporter() {
  // Check URL query parameters for pre-selected lecture
  const params = new URLSearchParams(window.location.search);
  const paramLectureId = params.get("id") || params.get("lectureId");
  if (paramLectureId) {
    selectedLectureId = paramLectureId;
  }

  // Load lectures into dropdown
  await loadLecturesDropdown();

  // Load saved API settings and update badge
  updateModelBadge();

  // Load chat history from localStorage
  loadSavedChat();
}

async function loadLecturesDropdown() {
  const select = document.getElementById("lecture-context-select");
  if (!select) return;

  try {
    const { lectures } = await apiCall("/lectures");
    availableLectures = lectures || [];

    let html = `<option value="">🌐 General Tutoring (All Subjects)</option>`;
    availableLectures.forEach((l) => {
      const isSelected = selectedLectureId === l.id;
      html += `<option value="${l.id}" ${isSelected ? "selected" : ""}>📚 ${escapeHtml(l.subject)} (${escapeHtml(l.teacher || "Class")})</option>`;
    });

    select.innerHTML = html;

    if (selectedLectureId) {
      select.value = selectedLectureId;
    }
  } catch (err) {
    console.error("Error loading lectures:", err);
  }
}

function onLectureContextChange() {
  const select = document.getElementById("lecture-context-select");
  selectedLectureId = select.value || null;

  if (selectedLectureId) {
    const lec = availableLectures.find((l) => l.id === selectedLectureId);
    if (lec) {
      appendSystemNotice(`Context set to: **${lec.subject}** (Prof. ${lec.teacher || "N/A"}). Questions will now reference this lecture's notes.`);
    }
  } else {
    appendSystemNotice("Context set to **General Academic Tutoring** across all subjects.");
  }
}

// ================================================================
// CHAT RENDERING & PERSISTENCE
// ================================================================
function loadSavedChat() {
  const saved = localStorage.getItem(STORAGE_KEY_CHAT);
  if (saved) {
    try {
      chatHistory = JSON.parse(saved);
      const feed = document.getElementById("chat-feed");
      feed.innerHTML = ""; // Clear default message if history exists
      chatHistory.forEach((msg) => {
        renderMessageBubble(msg.role, msg.content, msg.source, false);
      });
      scrollChatToBottom();
    } catch (e) {
      chatHistory = [];
    }
  }
}

function saveChatToStorage() {
  try {
    // Save last 25 messages
    localStorage.setItem(STORAGE_KEY_CHAT, JSON.stringify(chatHistory.slice(-25)));
  } catch (e) {
    console.warn("Failed to persist chat:", e);
  }
}

function clearChatHistory() {
  if (!confirm("Are you sure you want to clear your conversation history with Student Supporter?")) return;
  chatHistory = [];
  localStorage.removeItem(STORAGE_KEY_CHAT);

  const feed = document.getElementById("chat-feed");
  feed.innerHTML = `
    <div class="supporter-msg-row bot">
      <div class="supporter-avatar">🤖</div>
      <div class="supporter-bubble">
        <h3>Chat history cleared! 👋</h3>
        <p>I'm ready for your next question or study goal. Type below or pick a prompt to start.</p>
      </div>
    </div>
  `;
}

function renderMessageBubble(role, content, source = "", animate = true) {
  const feed = document.getElementById("chat-feed");
  if (!feed) return;

  const isUser = role === "user";
  const row = document.createElement("div");
  row.className = `supporter-msg-row ${isUser ? "user" : "bot"}`;
  if (!animate) row.style.animation = "none";

  const avatar = isUser ? "🎓" : "🤖";
  const formattedHtml = isUser ? escapeHtml(content).replace(/\n/g, "<br/>") : parseMarkdown(content);

  let footerHtml = "";
  if (!isUser) {
    const sourceLabel = source === "openai" ? "⚡ OpenAI GPT" : "💡 NotesPilot AI";
    footerHtml = `
      <div class="supporter-bubble-footer">
        <span>${sourceLabel}</span>
        <button onclick="copyBubbleText(this)">📋 Copy</button>
        <button onclick="readAloudText(this.parentElement.parentElement.innerText)">🔊 Read Aloud</button>
      </div>
    `;
  }

  row.innerHTML = `
    <div class="supporter-avatar">${avatar}</div>
    <div class="supporter-bubble">
      ${formattedHtml}
      ${footerHtml}
    </div>
  `;

  feed.appendChild(row);
  scrollChatToBottom();
}

function appendSystemNotice(text) {
  const feed = document.getElementById("chat-feed");
  if (!feed) return;
  const div = document.createElement("div");
  div.style.textAlign = "center";
  div.style.fontSize = "0.78rem";
  div.style.color = "var(--ink-soft)";
  div.style.margin = "4px 0";
  div.innerHTML = parseMarkdown(text);
  feed.appendChild(div);
  scrollChatToBottom();
}

function scrollChatToBottom() {
  const feed = document.getElementById("chat-feed");
  if (feed) {
    feed.scrollTop = feed.scrollHeight;
  }
}

// ================================================================
// SENDING MESSAGES & OPENAI INTERACTION
// ================================================================
async function sendMessage() {
  const input = document.getElementById("user-input");
  const text = input.value.trim();
  if (!text) return;

  const sendBtn = document.getElementById("send-btn");
  sendBtn.disabled = true;
  input.value = "";
  autoResizeTextarea(input);

  // Render User Message
  renderMessageBubble("user", text);
  chatHistory.push({ role: "user", content: text });
  saveChatToStorage();

  // Render Temporary Thinking Bubble
  const feed = document.getElementById("chat-feed");
  const thinkingRow = document.createElement("div");
  thinkingRow.className = "supporter-msg-row bot";
  thinkingRow.id = "thinking-indicator";
  thinkingRow.innerHTML = `
    <div class="supporter-avatar">🤖</div>
    <div class="supporter-bubble" style="color:var(--ink-soft); font-style:italic;">
      Student Supporter is formulating your answer... ✍️
    </div>
  `;
  feed.appendChild(thinkingRow);
  scrollChatToBottom();

  const apiKey = localStorage.getItem(STORAGE_KEY_OPENAI) || "";
  const model = localStorage.getItem(STORAGE_KEY_MODEL) || "gpt-4o-mini";

  try {
    const res = await apiCall("/supporter/chat", "POST", {
      message: text,
      history: chatHistory.slice(-8),
      lectureId: selectedLectureId,
      apiKey,
      model
    });

    // Remove thinking row
    const el = document.getElementById("thinking-indicator");
    if (el) el.remove();

    // Render Bot Response
    renderMessageBubble("assistant", res.reply, res.source);
    chatHistory.push({ role: "assistant", content: res.reply, source: res.source });
    saveChatToStorage();
  } catch (err) {
    const el = document.getElementById("thinking-indicator");
    if (el) el.remove();

    renderMessageBubble("assistant", `⚠️ **Error generating response**: ${err.message}\n\nPlease check your network connection or OpenAI API key.`, "error");
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

function handleInputKeydown(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

function autoResizeTextarea(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 120) + "px";
}

function applyQuickPrompt(promptPrefix) {
  const input = document.getElementById("user-input");
  input.value = promptPrefix;
  input.focus();
  autoResizeTextarea(input);
}

// ================================================================
// OPENAI SETTINGS MODAL
// ================================================================
function openOpenAIModal() {
  const modal = document.getElementById("openai-modal");
  const keyInput = document.getElementById("openai-key-input");
  const modelSelect = document.getElementById("openai-model-select");

  keyInput.value = localStorage.getItem(STORAGE_KEY_OPENAI) || "";
  modelSelect.value = localStorage.getItem(STORAGE_KEY_MODEL) || "gpt-4o-mini";

  modal.classList.remove("hidden");
}

function closeOpenAIModal() {
  const modal = document.getElementById("openai-modal");
  if (modal) modal.classList.add("hidden");
}

function saveOpenAISettings() {
  const keyInput = document.getElementById("openai-key-input").value.trim();
  const modelSelect = document.getElementById("openai-model-select").value;

  if (keyInput) {
    localStorage.setItem(STORAGE_KEY_OPENAI, keyInput);
  } else {
    localStorage.removeItem(STORAGE_KEY_OPENAI);
  }

  localStorage.setItem(STORAGE_KEY_MODEL, modelSelect);
  closeOpenAIModal();
  updateModelBadge();

  if (keyInput) {
    appendSystemNotice(`✅ **OpenAI Key Configured!** Active Model: **${modelSelect}**.`);
  } else {
    appendSystemNotice(`ℹ️ Active Model: **${modelSelect === "offline" ? "Offline Assistant" : modelSelect}**.`);
  }
}

function removeOpenAIKey() {
  localStorage.removeItem(STORAGE_KEY_OPENAI);
  document.getElementById("openai-key-input").value = "";
  closeOpenAIModal();
  updateModelBadge();
  appendSystemNotice("🔒 Saved OpenAI key removed. Switched to Offline Assistant mode.");
}

function updateModelBadge() {
  const badge = document.getElementById("model-status-badge");
  if (!badge) return;

  const key = localStorage.getItem(STORAGE_KEY_OPENAI);
  const model = localStorage.getItem(STORAGE_KEY_MODEL) || "gpt-4o-mini";

  if (key && key.startsWith("sk-") && model !== "offline") {
    badge.textContent = `⚡ OpenAI (${model})`;
    badge.style.background = "rgba(42, 157, 143, 0.15)";
    badge.style.color = "#2A9D8F";
    badge.style.borderColor = "rgba(42, 157, 143, 0.3)";
  } else {
    badge.textContent = "💡 Offline Smart Assistant";
    badge.style.background = "rgba(78, 143, 184, 0.12)";
    badge.style.color = "var(--accent-blue)";
    badge.style.borderColor = "rgba(78, 143, 184, 0.25)";
  }
}

// ================================================================
// UTILITIES (MARKDOWN, COPY, TTS)
// ================================================================
function copyBubbleText(btn) {
  const bubble = btn.closest(".supporter-bubble");
  if (!bubble) return;
  const clone = bubble.cloneNode(true);
  const footer = clone.querySelector(".supporter-bubble-footer");
  if (footer) footer.remove();

  navigator.clipboard.writeText(clone.innerText.trim()).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = "✅ Copied!";
    setTimeout(() => { btn.innerHTML = orig; }, 1500);
  });
}

function readAloudText(text) {
  if (!("speechSynthesis" in window)) {
    alert("Text-to-speech is not supported on this browser.");
    return;
  }
  window.speechSynthesis.cancel();
  const clean = text.replace(/📋 Copy|🔊 Read Aloud|Powered by NotesPilot AI|⚡ OpenAI GPT|💡 NotesPilot AI/g, "").trim();
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.rate = 1.0;
  window.speechSynthesis.speak(utterance);
}

// Simple fast Markdown parser for educational responses
function parseMarkdown(text) {
  if (!text) return "";
  let html = escapeHtml(text);

  // Code blocks: ```js ... ```
  html = html.replace(/```([a-zA-Z]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre><code>${code}</code></pre>`;
  });

  // Inline code: `code`
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold: **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // Italics: _text_ or *text*
  html = html.replace(/_([^_]+)_/g, "<em>$1</em>");

  // Headers: ### Heading
  html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
  html = html.replace(/^## (.*$)/gim, "<h3>$1</h3>");
  html = html.replace(/^# (.*$)/gim, "<h3>$1</h3>");

  // Blockquotes: > quote
  html = html.replace(/^\> (.*$)/gim, "<blockquote>$1</blockquote>");

  // Unordered list items: - item or * item
  html = html.replace(/^\s*[-*]\s+(.*$)/gim, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>");

  // Numbered list items: 1. item
  html = html.replace(/^\s*\d+\.\s+(.*$)/gim, "<li>$1</li>");

  // Paragraph breaks
  html = html.replace(/\n\n/g, "<br/><br/>");

  return html;
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

// Start supporter
initSupporter();
