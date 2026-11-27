// ================================================================
// record.js
// Feature 2: Live Lecture Recording
// Feature 3: Speech-to-Text (uses the browser's built-in Web Speech API)
// Feature: 🎛️ Audio Quality DSP (Noise Suppression / AEC / AGC)
// Feature: 🎵 Audio File Player & Importer
// ================================================================

requireAuth();
renderNavbar("record.html");

let recognition = null;
let isRecording = false;

// Audio DSP & Web Audio State
const STORAGE_KEY_DSP = "npai_audio_dsp_settings_v1";
let dspStream = null;
let audioCtx = null;
let analyserNode = null;
let biquadFilter = null;
let animFrameId = null;

const micBtn = document.getElementById("mic-btn");
const statusEl = document.getElementById("rec-status");
const transcriptBox = document.getElementById("transcript");
const warningEl = document.getElementById("browser-warning");
const dspBadge = document.getElementById("dsp-badge");
const dspCanvas = document.getElementById("dsp-waveform-canvas");
const dspVuBar = document.getElementById("dsp-vu-bar");
const dspDbLabel = document.getElementById("dsp-db-label");

// Doubt Highlighting Mode State
let isDoubtMode = true;
const doubtToggle = document.getElementById("doubt-mode-toggle");
const doubtStatus = document.getElementById("doubt-mode-status");
const doubtCountBadge = document.getElementById("doubt-count-badge");

// Speech recognition state
let recordedBaseText = "";
let finalCommittedSpeech = "";

function cleanSpeechAttachment(existingText, incomingChunk, isSmartPunctuation = true) {
  if (!incomingChunk) return existingText || "";
  let chunk = incomingChunk.trim();
  if (!chunk) return existingText || "";

  const cfg = typeof getDspSettings === "function" ? getDspSettings() : {};

  // 1. Spoken Punctuation Commands
  if (isSmartPunctuation) {
    chunk = chunk
      .replace(/\b(new paragraph|next paragraph)\b/gi, "\n\n")
      .replace(/\b(new line|next line)\b/gi, "\n")
      .replace(/\b(question mark)\b/gi, "?")
      .replace(/\b(exclamation mark|exclamation point)\b/gi, "!")
      .replace(/\b(full stop|period)\b/gi, ".")
      .replace(/\b(comma)\b/gi, ",")
      .replace(/\b(colon)\b/gi, ":")
      .replace(/\b(semicolon)\b/gi, ";")
      .replace(/\b(open quote|start quote)\b/gi, ' "')
      .replace(/\b(close quote|end quote)\b/gi, '" ')
      .replace(/\b(open bracket|open parenthesis)\b/gi, " (")
      .replace(/\b(close bracket|close parenthesis)\b/gi, ") ");
  }

  // 2. Mumble & Whisper Repair (Live Speech)
  if (cfg.whisperEnhance !== false && typeof enhanceMumblesAndWhispersClient === "function") {
    chunk = enhanceMumblesAndWhispersClient(chunk).enhancedText;
  }

  // 3. Content-Based Academic Spelling (Live Speech)
  if (cfg.contentSpelling !== false && typeof applyContentBasedSpellingClient === "function") {
    chunk = applyContentBasedSpellingClient(chunk).correctedText;
  }

  // 4. Acronyms & Auto-Capitalization (Live Speech)
  if (cfg.autoCapitalize !== false && typeof applyAutomaticCapitalizationClient === "function") {
    chunk = applyAutomaticCapitalizationClient(chunk);
  }

  // Normalize internal spaces
  chunk = chunk.replace(/\s+([.,!?:;])/g, "$1").replace(/[ \t]+/g, " ");

  let base = existingText ? existingText.trimEnd() : "";

  if (!base) {
    return chunk.charAt(0).toUpperCase() + chunk.slice(1);
  }

  // Capitalize if preceding base ended with sentence boundary (. ? ! \n)
  const lastChar = base.slice(-1);
  if (/[.!?\n]/.test(lastChar)) {
    chunk = chunk.charAt(0).toUpperCase() + chunk.slice(1);
  }

  // Punctuation attachment collision prevention (e.g. "Hello," + ".com" -> "Hello.com" or "Hello,")
  if (/^[.,!?:;]/.test(chunk)) {
    if (/[.,!?:;]$/.test(base)) {
      base = base.slice(0, -1);
    }
    return base + chunk;
  } else {
    // Normal word attachment
    return base + " " + chunk;
  }
}

function normalizeSpeechStream(text) {
  if (!text) return "";
  return text
    .replace(/\s+([.,!?:;])/g, "$1") // no space before punct
    .replace(/([.,!?:;])(?=[a-zA-Z0-9])/g, "$1 ") // single space after punct
    .replace(/,\s*([.,!?:;])/g, "$1") // fix ",." or ",," -> "." or ","
    .replace(/\.\s*([.,!?:;])/g, "$1") // fix ".," or ".." -> "."
    .replace(/([?!])\s*[.]/g, "$1") // fix "?." or "!." -> "?" or "!"
    .replace(/[ \t]+/g, " ");
}

function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    warningEl.classList.remove("hidden");
    micBtn.disabled = true;
    return null;
  }

  const rec = new SpeechRecognition();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-US";

  rec.onresult = (event) => {
    let interimText = "";
    
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const res = event.results[i];
      const text = res[0].transcript;
      if (res.isFinal) {
        finalCommittedSpeech = cleanSpeechAttachment(finalCommittedSpeech, text, isSmartPunctuationActive);
      } else {
        interimText += text;
      }
    }

    // Build real-time display combining base, final committed, and interim live speech
    let combined = recordedBaseText;
    if (finalCommittedSpeech) {
      combined = cleanSpeechAttachment(combined, finalCommittedSpeech, isSmartPunctuationActive);
    }
    if (interimText) {
      combined = cleanSpeechAttachment(combined, interimText, isSmartPunctuationActive);
    }

    transcriptBox.value = normalizeSpeechStream(combined);
    transcriptBox.scrollTop = transcriptBox.scrollHeight;
    updateDoubtCount();
    updateWordCountAndCapacity();
  };

  rec.onerror = (e) => {
    console.warn("Speech recognition error:", e.error);
    if (e.error === "not-allowed") {
      statusEl.textContent = "Microphone access denied. Please allow mic permission and retry.";
    }
  };

  rec.onend = () => {
    if (isRecording) {
      try {
        rec.start();
      } catch (err) {
        console.warn("Speech recognition restart note:", err);
      }
    }
  };

  return rec;
}

let lectureStartTime = null;

function toggleRecording() {
  if (!recognition) recognition = setupSpeechRecognition();
  if (!recognition) return;

  if (!isRecording) {
    // Lock base text and reset speech session
    recordedBaseText = transcriptBox.value.trim();
    finalCommittedSpeech = "";
    try {
      recognition.start();
    } catch (e) {
      console.warn("Speech recognition start notice:", e);
    }
    isRecording = true;
    lectureStartTime = new Date().toISOString();
    micBtn.classList.add("recording");
    statusEl.textContent = "🎙️ Listening live... speak naturally, tap again to stop.";
    startDspAudioPipeline();
  } else {
    isRecording = false;
    try {
      recognition.stop();
    } catch (e) {}
    micBtn.classList.remove("recording");
    statusEl.textContent = "Recording stopped. Review the transcript below, then generate notes.";
    stopDspAudioPipeline();

    // Final clean formatting pass on speech completion
    if (transcriptBox.value.trim().length > 0 && isSmartPunctuationActive) {
      transcriptBox.value = applySmartPunctuationClient(transcriptBox.value);
      updateDoubtCount();
      updateWordCountAndCapacity();
    }
  }
}

// Load existing subject tags for datalist autocomplete
async function loadTagsDatalist() {
  try {
    const { tags } = await apiCall("/lectures/tags");
    const datalist = document.getElementById("existing-tags");
    if (datalist && tags) {
      datalist.innerHTML = tags.map((t) => `<option value="${t}"></option>`).join("");
    }
  } catch (e) { console.warn("Failed loading tags", e); }
}

// Handwritten Notes Upload State
let uploadedHandwrittenPages = [];

function switchMode(mode) {
  const micPanel = document.getElementById("mic-panel");
  const filePanel = document.getElementById("file-panel");
  const audioPanel = document.getElementById("audio-panel");
  const handwrittenPanel = document.getElementById("handwritten-panel");
  const tabMic = document.getElementById("tab-mic");
  const tabHandwritten = document.getElementById("tab-handwritten");
  const tabFile = document.getElementById("tab-file");
  const tabAudio = document.getElementById("tab-audio");

  micPanel.classList.add("hidden");
  filePanel.classList.add("hidden");
  audioPanel.classList.add("hidden");
  if (handwrittenPanel) handwrittenPanel.classList.add("hidden");

  tabMic.className = "btn btn-ghost";
  if (tabHandwritten) tabHandwritten.className = "btn btn-ghost";
  tabFile.className = "btn btn-ghost";
  tabAudio.className = "btn btn-ghost";

  if (mode === "handwritten") {
    if (handwrittenPanel) handwrittenPanel.classList.remove("hidden");
    if (tabHandwritten) tabHandwritten.className = "btn btn-primary";
    if (isRecording) toggleRecording();
  } else if (mode === "file") {
    filePanel.classList.remove("hidden");
    tabFile.className = "btn btn-primary";
    if (isRecording) toggleRecording();
  } else if (mode === "audio") {
    audioPanel.classList.remove("hidden");
    tabAudio.className = "btn btn-primary";
  } else {
    micPanel.classList.remove("hidden");
    tabMic.className = "btn btn-primary";
  }
}

// Handwritten upload selector in record.html
async function handleHandwrittenUploadSelect(e) {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;

  const imageFiles = files.filter(f => f.type.startsWith("image/"));
  if (imageFiles.length === 0) {
    alert("Please select image files (JPG, PNG, WEBP).");
    return;
  }

  const readPromises = imageFiles.map((file, idx) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        resolve({
          name: file.name.replace(/\.[^/.]+$/, "") || `Page ${idx + 1}`,
          dataUrl: ev.target.result
        });
      };
      reader.readAsDataURL(file);
    });
  });

  const newPages = await Promise.all(readPromises);
  uploadedHandwrittenPages.push(...newPages);

  const previewStrip = document.getElementById("handwritten-preview-strip");
  const fileInfo = document.getElementById("handwritten-file-info");
  const subjectInput = document.getElementById("subject");

  if (previewStrip) {
    previewStrip.innerHTML = uploadedHandwrittenPages.map((p, idx) => `
      <div style="position:relative; width:80px; text-align:center; background:var(--card-bg); border:1px solid var(--border); border-radius:6px; padding:4px;">
        <img src="${p.dataUrl}" style="width:100%; height:60px; object-fit:cover; border-radius:4px;" />
        <span style="font-size:0.7rem; font-weight:600;">P. ${idx + 1}</span>
      </div>
    `).join("");
  }

  if (fileInfo) {
    fileInfo.textContent = `✅ ${uploadedHandwrittenPages.length} handwritten page(s) ready for lecture creation.`;
  }

  if (!subjectInput.value.trim() && imageFiles[0]) {
    const baseName = imageFiles[0].name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    subjectInput.value = baseName.charAt(0).toUpperCase() + baseName.slice(1);
  }

  if (!transcriptBox.value.trim()) {
    transcriptBox.value = `Handwritten lecture notes covering key definitions, structured theorems, algorithms, and review formulas across ${uploadedHandwrittenPages.length} notebook pages.`;
  }
}

// Audio Player Selection
function handleAudioSelect(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  const file = files[0];

  const player = document.getElementById("audio-player");
  const playerContainer = document.getElementById("audio-player-container");
  const subjectInput = document.getElementById("subject");

  const url = URL.createObjectURL(file);
  player.src = url;
  playerContainer.style.display = "block";

  if (!subjectInput.value.trim()) {
    const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    subjectInput.value = baseName.charAt(0).toUpperCase() + baseName.slice(1);
  }
}

// Drag and drop setup for file-panel
function setupDragAndDrop() {
  const filePanel = document.getElementById("file-panel");
  if (!filePanel) return;

  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    filePanel.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
  });

  filePanel.addEventListener("drop", (e) => {
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processSelectedFile(files[0]);
    }
  });
}

function handleFileSelect(e) {
  const files = e.target.files;
  if (files && files.length > 0) {
    processSelectedFile(files[0]);
  }
}

function processSelectedFile(file) {
  const info = document.getElementById("file-info");
  const subjectInput = document.getElementById("subject");

  if (!file.name.match(/\.(txt|md|markdown)$/i)) {
    info.textContent = "⚠️ Please select a .txt or .md text document.";
    info.className = "error-msg";
    return;
  }

  const reader = new FileReader();
  reader.onload = (evt) => {
    const content = evt.target.result;
    transcriptBox.value = content;
    info.textContent = `✅ Selected "${file.name}" (${(file.size / 1024).toFixed(1)} KB)`;
    info.className = "muted";

    if (!subjectInput.value.trim()) {
      const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
      subjectInput.value = baseName.charAt(0).toUpperCase() + baseName.slice(1);
    }
    updateWordCountAndCapacity();
    updateDoubtCount();
  };
  reader.readAsText(file);
}

function clearTranscript() {
  transcriptBox.value = "";
  const info = document.getElementById("file-info");
  if (info) info.textContent = "";
  updateDoubtCount();
  updateWordCountAndCapacity();
}

async function saveLecture() {
  const msg = document.getElementById("save-msg");
  msg.textContent = "";
  msg.className = "";

  const subject = document.getElementById("subject").value.trim();
  const subjectTag = document.getElementById("subjectTag") ? document.getElementById("subjectTag").value.trim() : "";
  const teacher = document.getElementById("teacher").value.trim();
  let transcript = transcriptBox.value.trim();

  // Apply Smart Punctuation formatting before generating notes
  if (isSmartPunctuationActive && transcript.length > 5) {
    transcript = applySmartPunctuationClient(transcript);
    transcriptBox.value = transcript;
    updateWordCountAndCapacity();
  }

  if (transcript.length < 5 && uploadedHandwrittenPages.length > 0) {
    transcript = `Handwritten lecture notes on ${subject || "Lecture Topics"} covering structured notebook pages, definitions, and formulas.`;
  }

  if (transcript.length < 10) {
    msg.textContent = "Please record, upload handwritten images, or paste transcript before generating notes.";
    msg.className = "error-msg";
    return;
  }

  const btn = document.getElementById("save-btn");
  btn.disabled = true;
  btn.textContent = "Generating...";

  try {
    // Extract marked doubts from transcript for backend initialization
    const doubts = [];
    if (transcript.includes("🔴")) {
      const sentences = transcript.split(/(?<=[.?!])\s+/);
      sentences.forEach((s) => {
        if (s.includes("🔴")) {
          const clean = s.replace(/🔴/g, "").trim();
          if (clean.length > 3) {
            doubts.push({
              question: `Doubt on: "${clean}"`,
              autoSolve: true,
              resolved: false
            });
          }
        }
      });
    }

    const data = await apiCall("/lectures", "POST", { 
      subject, 
      subjectTag, 
      teacher, 
      transcript,
      doubts,
      handwrittenPages: uploadedHandwrittenPages
    });

    // Auto-record and link attendance record with newly created lecture notes
    try {
      const nowIso = new Date().toISOString();
      const inIso = lectureStartTime || new Date(Date.now() - 45 * 60000).toISOString();
      const durMinutes = Math.max(15, Math.round((new Date(nowIso) - new Date(inIso)) / 60000));

      await apiCall("/attendance/auto-record", "POST", {
        lectureId: data.lecture.id,
        subject,
        subjectTag,
        teacher,
        checkInTime: inIso,
        checkOutTime: nowIso,
        durationMinutes: durMinutes
      });
    } catch (attErr) {
      console.warn("Could not auto-sync attendance:", attErr);
    }

    window.location.href = `notes.html?id=${data.lecture.id}`;
  } catch (err) {
    msg.textContent = err.message;
    msg.className = "error-msg";
    btn.disabled = false;
    btn.textContent = "✨ Generate Smart Notes";
  }
}

// ================================================================
// 🔴 DOUBT HIGHLIGHTING MODE (SPACE-KEY MARKERS)
// ================================================================

function toggleDoubtMode(enabled) {
  isDoubtMode = Boolean(enabled);
  if (doubtStatus) {
    doubtStatus.textContent = isDoubtMode ? "ACTIVE" : "OFF";
    doubtStatus.style.color = isDoubtMode ? "#E63946" : "var(--muted)";
  }
  const bar = document.querySelector(".doubt-mode-bar");
  if (bar) {
    bar.classList.toggle("doubt-mode-active", isDoubtMode);
  }
}

function updateDoubtCount() {
  if (!transcriptBox || !doubtCountBadge) return;
  const count = (transcriptBox.value.match(/🔴/g) || []).length;
  doubtCountBadge.textContent = `${count} Doubt${count === 1 ? "" : "s"} Marked 🔴`;
  doubtCountBadge.style.display = count > 0 ? "inline-block" : "inline-block";
}

function insertDoubtMarkerAtCursor() {
  if (!transcriptBox) return;

  const marker = " 🔴 ";
  const start = transcriptBox.selectionStart;
  const end = transcriptBox.selectionEnd;
  const val = transcriptBox.value;

  if (start !== undefined && end !== undefined && start >= 0) {
    transcriptBox.value = val.substring(0, start) + marker + val.substring(end);
    transcriptBox.selectionStart = transcriptBox.selectionEnd = start + marker.length;
  } else {
    transcriptBox.value += marker;
  }

  transcriptBox.focus();
  updateDoubtCount();
  flashDoubtGlow();
}

function flashDoubtGlow() {
  if (!transcriptBox) return;
  transcriptBox.classList.add("doubt-flash");
  setTimeout(() => {
    transcriptBox.classList.remove("doubt-flash");
  }, 400);
}

// Spacebar Keydown Interceptor for Doubt Highlighting Mode
function setupDoubtHighlightingEvents() {
  if (transcriptBox) {
    transcriptBox.addEventListener("keydown", (e) => {
      // If Doubt Highlighting Mode is active and Space is pressed (without Ctrl/Alt/Meta)
      if (isDoubtMode && (e.code === "Space" || e.key === " ") && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault(); // Do not insert regular space character
        insertDoubtMarkerAtCursor();
      }
    });

    transcriptBox.addEventListener("input", () => {
      updateDoubtCount();
    });
  }

  // Global Spacebar listener during live recording
  window.addEventListener("keydown", (e) => {
    // If student presses Space while recording and focus is not on an input field
    const activeEl = document.activeElement;
    const isInput = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA");
    
    if (isRecording && isDoubtMode && (e.code === "Space" || e.key === " ") && !isInput && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      insertDoubtMarkerAtCursor();
    }
  });
}

setupDoubtHighlightingEvents();
updateDoubtCount();

// ================================================================
// AUDIO DSP & HARDWARE FILTER PIPELINE (Web Audio API)
// Features: Noise Suppression, Echo Cancellation, Auto Gain Control
// ================================================================

// Audio DSP & Web Audio State
let gainNode = null;
let whisperFilter = null;
let compressorNode = null;
let farFieldMultiplier = 3.0;

function getDspSettings() {
  const nsEl = document.getElementById("dsp-noise-suppression");
  const ecEl = document.getElementById("dsp-echo-cancellation");
  const agcEl = document.getElementById("dsp-auto-gain");
  const ffEl = document.getElementById("dsp-far-field");
  const weEl = document.getElementById("dsp-whisper-enhance");
  const ocEl = document.getElementById("dsp-overlap-cleanup");
  const csEl = document.getElementById("dsp-content-spelling");
  const acEl = document.getElementById("dsp-auto-capitalize");

  return {
    noiseSuppression: nsEl ? nsEl.checked : true,
    echoCancellation: ecEl ? ecEl.checked : true,
    autoGainControl: agcEl ? agcEl.checked : true,
    farField: ffEl ? ffEl.checked : true,
    farFieldGain: farFieldMultiplier,
    whisperEnhance: weEl ? weEl.checked : true,
    overlapCleanup: ocEl ? ocEl.checked : true,
    contentSpelling: csEl ? csEl.checked : true,
    autoCapitalize: acEl ? acEl.checked : true
  };
}

function loadDspSettings() {
  const saved = localStorage.getItem(STORAGE_KEY_DSP);
  if (saved) {
    try {
      const cfg = JSON.parse(saved);
      const nsEl = document.getElementById("dsp-noise-suppression");
      const ecEl = document.getElementById("dsp-echo-cancellation");
      const agcEl = document.getElementById("dsp-auto-gain");
      const ffEl = document.getElementById("dsp-far-field");
      const weEl = document.getElementById("dsp-whisper-enhance");
      const ocEl = document.getElementById("dsp-overlap-cleanup");
      const csEl = document.getElementById("dsp-content-spelling");
      const acEl = document.getElementById("dsp-auto-capitalize");
      const slider = document.getElementById("far-field-gain-slider");

      if (nsEl && typeof cfg.noiseSuppression === "boolean") nsEl.checked = cfg.noiseSuppression;
      if (ecEl && typeof cfg.echoCancellation === "boolean") ecEl.checked = cfg.echoCancellation;
      if (agcEl && typeof cfg.autoGainControl === "boolean") agcEl.checked = cfg.autoGainControl;
      if (ffEl && typeof cfg.farField === "boolean") ffEl.checked = cfg.farField;
      if (weEl && typeof cfg.whisperEnhance === "boolean") weEl.checked = cfg.whisperEnhance;
      if (ocEl && typeof cfg.overlapCleanup === "boolean") ocEl.checked = cfg.overlapCleanup;
      if (csEl && typeof cfg.contentSpelling === "boolean") csEl.checked = cfg.contentSpelling;
      if (acEl && typeof cfg.autoCapitalize === "boolean") acEl.checked = cfg.autoCapitalize;
      if (typeof cfg.farFieldGain === "number") {
        farFieldMultiplier = cfg.farFieldGain;
        if (slider) slider.value = farFieldMultiplier;
        updateFarFieldLabel(farFieldMultiplier);
      }
    } catch (e) {
      console.warn("Failed loading DSP settings:", e);
    }
  }
  updateDspBadge();
}

function saveDspSettings() {
  const cfg = getDspSettings();
  localStorage.setItem(STORAGE_KEY_DSP, JSON.stringify(cfg));
}

function onFarFieldGainChange(val) {
  farFieldMultiplier = parseFloat(val) || 3.0;
  updateFarFieldLabel(farFieldMultiplier);
  saveDspSettings();
  if (gainNode && isRecording) {
    const cfg = getDspSettings();
    gainNode.gain.setTargetAtTime(cfg.farField ? farFieldMultiplier : 1.0, audioCtx.currentTime, 0.05);
  }
}

function updateFarFieldLabel(val) {
  const lbl = document.getElementById("far-field-val-label");
  if (lbl) {
    const tier = val >= 3.5 ? "Back Bench" : val >= 2.5 ? "Lecture Hall" : val >= 1.5 ? "Mid Room" : "Desk";
    lbl.textContent = `${val.toFixed(1)}x (${tier})`;
  }
}

function updateDspBadge(active = false) {
  if (!dspBadge) return;
  const cfg = getDspSettings();
  const activeFeatures = [];
  if (cfg.farField) activeFeatures.push(`Far-Field ${cfg.farFieldGain}x`);
  if (cfg.whisperEnhance) activeFeatures.push("Whisper EQ");
  if (cfg.noiseSuppression) activeFeatures.push("NS");
  if (cfg.overlapCleanup) activeFeatures.push("Overlap-Filter");
  if (cfg.contentSpelling) activeFeatures.push("Tech-Spell");

  const featStr = activeFeatures.length ? activeFeatures.join(" + ") : "Bypass (Raw)";

  if (active) {
    dspBadge.textContent = `🔴 Studio DSP Active (${featStr})`;
    dspBadge.className = "dsp-status-badge active";
  } else {
    dspBadge.textContent = `🟢 Studio DSP Ready (${featStr})`;
    dspBadge.className = "dsp-status-badge ready";
  }
}

async function onDspSettingChange() {
  saveDspSettings();
  updateDspBadge(isRecording);

  if (isRecording) {
    stopDspAudioPipeline();
    await startDspAudioPipeline();
  }
}

async function startDspAudioPipeline() {
  const cfg = getDspSettings();
  updateDspBadge(true);

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.warn("getUserMedia not supported in this browser environment.");
    return;
  }

  try {
    const constraints = {
      audio: {
        noiseSuppression: cfg.noiseSuppression,
        echoCancellation: cfg.echoCancellation,
        autoGainControl: cfg.autoGainControl,
        channelCount: 1,
        sampleRate: 48000
      }
    };

    dspStream = await navigator.mediaDevices.getUserMedia(constraints);

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
      const source = audioCtx.createMediaStreamSource(dspStream);

      // 1. Far-Field Pre-Amplifier Gain Node
      gainNode = audioCtx.createGain();
      gainNode.gain.value = cfg.farField ? cfg.farFieldGain : 1.0;

      // 2. Highpass Filter (Cuts 110Hz HVAC hum and table rumbles)
      biquadFilter = audioCtx.createBiquadFilter();
      biquadFilter.type = "highpass";
      biquadFilter.frequency.value = cfg.noiseSuppression ? 110 : 30;

      // 3. Whisper & Consonant Clarity Peaking EQ Filter (~3.2 kHz boost)
      whisperFilter = audioCtx.createBiquadFilter();
      whisperFilter.type = "peaking";
      whisperFilter.frequency.value = 3200;
      whisperFilter.Q.value = 1.5;
      whisperFilter.gain.value = cfg.whisperEnhance ? 6.5 : 0.0;

      // 4. Dynamics Compressor (Normalizes far voices while preventing close distortion)
      compressorNode = audioCtx.createDynamicsCompressor();
      compressorNode.threshold.value = cfg.farField ? -42 : -28;
      compressorNode.knee.value = 30;
      compressorNode.ratio.value = cfg.farField ? 12 : 6;
      compressorNode.attack.value = 0.003;
      compressorNode.release.value = 0.25;

      // 5. Analyser for Real-Time Waveform & VU Meter
      analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 256;
      analyserNode.smoothingTimeConstant = 0.75;

      // Chain: source -> gain -> highpass -> whisperFilter -> compressor -> analyser
      source.connect(gainNode);
      gainNode.connect(biquadFilter);
      biquadFilter.connect(whisperFilter);
      whisperFilter.connect(compressorNode);
      compressorNode.connect(analyserNode);

      startVisualizerLoop();
    }
  } catch (err) {
    console.warn("Could not initialize Web Audio DSP Stream:", err);
  }
}

function stopDspAudioPipeline() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  if (dspStream) {
    dspStream.getTracks().forEach((track) => track.stop());
    dspStream = null;
  }

  if (audioCtx && audioCtx.state !== "closed") {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }

  gainNode = null;
  whisperFilter = null;
  compressorNode = null;

  // Reset visualizer graphics
  if (dspVuBar) dspVuBar.style.width = "0%";
  if (dspDbLabel) dspDbLabel.textContent = "0%";
  drawIdleVisualizer();

  updateDspBadge(false);
}

function startVisualizerLoop() {
  if (!analyserNode || !dspCanvas) return;

  const canvasCtx = dspCanvas.getContext("2d");
  const bufferLength = analyserNode.frequencyBinCount;
  const timeData = new Uint8Array(bufferLength);
  const freqData = new Uint8Array(bufferLength);

  function renderFrame() {
    if (!isRecording || !analyserNode) return;

    analyserNode.getByteTimeDomainData(timeData);
    analyserNode.getByteFrequencyData(freqData);

    // 1) Compute volume RMS for VU Level Meter
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const val = (timeData[i] - 128) / 128;
      sum += val * val;
    }
    const rms = Math.sqrt(sum / bufferLength);
    const volumePercent = Math.min(100, Math.round(rms * 280));

    if (dspVuBar) dspVuBar.style.width = `${volumePercent}%`;
    if (dspDbLabel) dspDbLabel.textContent = `${volumePercent}%`;

    // 2) Draw Smooth Oscilloscope Waveform on Canvas
    const width = dspCanvas.width;
    const height = dspCanvas.height;

    canvasCtx.clearRect(0, 0, width, height);

    // Gradient background for visualizer
    const grad = canvasCtx.createLinearGradient(0, 0, width, 0);
    grad.addColorStop(0, "#4E8FB8");
    grad.addColorStop(0.5, "#2A9D8F");
    grad.addColorStop(1, "#E8A33D");

    canvasCtx.lineWidth = 2.5;
    canvasCtx.strokeStyle = grad;
    canvasCtx.beginPath();

    const sliceWidth = width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = timeData[i] / 128.0;
      const y = (v * height) / 2;

      if (i === 0) {
        canvasCtx.moveTo(x, y);
      } else {
        canvasCtx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    canvasCtx.lineTo(width, height / 2);
    canvasCtx.stroke();

    animFrameId = requestAnimationFrame(renderFrame);
  }

  renderFrame();
}

function drawIdleVisualizer() {
  if (!dspCanvas) return;
  const ctx = dspCanvas.getContext("2d");
  const width = dspCanvas.width;
  const height = dspCanvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(78, 143, 184, 0.3)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
}

// ================================================================
// 📝 300,000-WORD STUDY NOTES CAPACITY & REAL-TIME COUNTER
// ================================================================
const MAX_WORDS_CAPACITY = 300000;
let wordCountDebounceTimer = null;

function countWordsFast(text) {
  if (!text) return 0;
  const matches = text.trim().match(/[\w\d\u00C0-\u024F\u1E00-\u1EFF]+/g);
  return matches ? matches.length : 0;
}

function updateWordCountAndCapacity() {
  if (!transcriptBox) return;
  const text = transcriptBox.value;
  const wordCount = countWordsFast(text);
  const remaining = Math.max(0, MAX_WORDS_CAPACITY - wordCount);
  const percentUsed = Math.min(100, parseFloat(((wordCount / MAX_WORDS_CAPACITY) * 100).toFixed(1)));

  // Estimated reading time (~200 words per minute for academic study notes)
  const readMinutes = Math.max(1, Math.round(wordCount / 200));
  const readTimeStr = wordCount > 0 
    ? (readMinutes >= 60 ? `~${(readMinutes / 60).toFixed(1)} hrs read` : `~${readMinutes} min read`)
    : "~0 min read";

  // DOM Elements
  const curWordsEl = document.getElementById("counter-current-words");
  const remWordsEl = document.getElementById("counter-remaining-words");
  const remPill = document.getElementById("counter-remaining-pill");
  const readTimeEl = document.getElementById("counter-reading-time");
  const progressFill = document.getElementById("capacity-progress-fill");
  const warnApproach = document.getElementById("capacity-warning-approach");
  const warnMax = document.getElementById("capacity-warning-max");
  const warnRemWords = document.getElementById("warn-remaining-words");

  if (curWordsEl) curWordsEl.textContent = wordCount.toLocaleString();
  if (remWordsEl) remWordsEl.textContent = remaining.toLocaleString();
  if (readTimeEl) readTimeEl.textContent = readTimeStr;

  if (progressFill) {
    progressFill.style.width = `${percentUsed}%`;
    if (percentUsed >= 100) {
      progressFill.style.backgroundColor = "var(--rule-red)";
    } else if (percentUsed >= 80) {
      progressFill.style.backgroundColor = "var(--accent-amber)";
    } else {
      progressFill.style.backgroundColor = "var(--sage)";
    }
  }

  if (remPill) {
    if (percentUsed >= 100) {
      remPill.style.color = "var(--rule-red)";
    } else if (percentUsed >= 80) {
      remPill.style.color = "var(--accent-amber)";
    } else {
      remPill.style.color = "var(--sage)";
    }
  }

  // Warning Alerts: Approaching (80% / 240,000+ words) & Max Limit (300,000 words)
  if (warnApproach && warnRemWords) {
    if (percentUsed >= 80 && percentUsed < 100) {
      warnApproach.classList.remove("hidden");
      warnRemWords.textContent = remaining.toLocaleString();
    } else {
      warnApproach.classList.add("hidden");
    }
  }

  if (warnMax) {
    if (wordCount >= MAX_WORDS_CAPACITY) {
      warnMax.classList.remove("hidden");
    } else {
      warnMax.classList.add("hidden");
    }
  }
}

function debouncedWordCount() {
  if (wordCountDebounceTimer) clearTimeout(wordCountDebounceTimer);
  wordCountDebounceTimer = setTimeout(updateWordCountAndCapacity, 40);
}

// Hook text box event listeners for real-time word updates
if (transcriptBox) {
  transcriptBox.addEventListener("input", () => {
    debouncedWordCount();
    updateDoubtCount();
  });
  transcriptBox.addEventListener("keyup", debouncedWordCount);
  transcriptBox.addEventListener("paste", () => {
    setTimeout(updateWordCountAndCapacity, 20);
    setTimeout(updateDoubtCount, 20);
  });
}

// ================================================================
// 🎙️ SMART PUNCTUATION & SPEECH FORMATTING ENGINE
// ================================================================
let isSmartPunctuationActive = localStorage.getItem("npai_smart_punct") !== "false";
let lastSpeechChunkTimestamp = null;

function applySmartPunctuationClient(rawText) {
  if (!rawText || typeof rawText !== "string") return "";
  let text = rawText.trim();

  // 1. Remove leading orphaned punctuation (e.g. "' .", ".", ",", "?")
  text = text.replace(/^['"`\s.,!?:;]+/, "").trim();

  // 2. Spoken Punctuation Command Replacements
  const spokenRules = [
    { pattern: /\b(new paragraph|next paragraph)\b/gi, replacement: "\n\n" },
    { pattern: /\b(new line|next line)\b/gi, replacement: "\n" },
    { pattern: /\b(question mark)\b/gi, replacement: "?" },
    { pattern: /\b(exclamation mark|exclamation point)\b/gi, replacement: "!" },
    { pattern: /\b(full stop|period)\b/gi, replacement: "." },
    { pattern: /\b(comma)\b/gi, replacement: "," },
    { pattern: /\b(semicolon)\b/gi, replacement: ";" },
    { pattern: /\b(colon)\b/gi, replacement: ":" },
    { pattern: /\b(open quote|start quote)\b/gi, replacement: ' "' },
    { pattern: /\b(close quote|end quote)\b/gi, replacement: '" ' },
    { pattern: /\b(open bracket|open parenthesis)\b/gi, replacement: " (" },
    { pattern: /\b(close bracket|close parenthesis)\b/gi, replacement: ") " },
    { pattern: /\b(dash|hyphen)\b/gi, replacement: " - " }
  ];

  spokenRules.forEach(({ pattern, replacement }) => {
    text = text.replace(pattern, replacement);
  });

  // 3. Normalize Spaces Around Punctuation & Segment Continuous Run-on Clauses
  text = text
    .replace(/\s+([.,!?:;])/g, "$1")
    .replace(/([.,!?:;])(?=[a-zA-Z0-9])/g, "$1 ")
    .replace(/([.!?])\s*([.!?])+/g, "$1")
    .replace(/,\s*,+/g, ",")
    .replace(/[ \t]+/g, " ");

  // 4. Merge accidental single-line breaks that broke sentences in half
  text = text.replace(/([^\n.!?])\n([a-z0-9])/gi, "$1 $2");

  // Segment mid-stream transition words
  const transitionWords = [
    "however", "therefore", "furthermore", "moreover", "for example",
    "for instance", "in addition", "consequently", "meanwhile",
    "on the other hand", "in contrast", "as a result", "firstly", "secondly", "finally"
  ];
  transitionWords.forEach((tw) => {
    const midRegex = new RegExp(`(?<![.!?\\n;:])\\s+\\b(${tw})\\b`, "gi");
    text = text.replace(midRegex, ". $1");
  });

  // Segment before major list intros if mid-stream
  text = text.replace(/(?<![.!?\n;:])\s+\b(the key (benefits|points|components|features|steps) are as follows|the following points|the following steps|the following list)\b/gi, ". $1");

  // Clean duplicate punctuation and spaces after segmentation
  text = text.replace(/([.!?])\s*([.!?])+/g, "$1").replace(/[ \t]+/g, " ");

  // 5. Sentence Splitting & Semantic Grammar Inference
  const paragraphs = text.split(/\n{2,}/);
  const formattedParagraphs = paragraphs.map((para) => {
    let cleanPara = para.trim();
    if (!cleanPara) return "";

    const sentenceTokens = cleanPara.split(/(?<=[.?!])\s+/);
    const processedSentences = sentenceTokens.map((sent) => {
      let s = sent.trim();
      if (!s) return "";

      // Transition Word Commas: "However", "Therefore", "For example", etc.
      transitionWords.forEach((tw) => {
        const twRegex = new RegExp(`^(${tw})(?![,])\\s+`, "i");
        s = s.replace(twRegex, (match, p1) => {
          const cap = p1.charAt(0).toUpperCase() + p1.slice(1);
          return `${cap}, `;
        });
      });

      // Colon Inference for List Intros
      s = s.replace(/\b(as follows|the following points|the following steps|the following list|consists of the following)\b(?!\s*[:])/gi, "$1:");

      // Interrogative Question Detection
      const questionStarters = /^(who|what|when|where|why|how|which|whose|whom|is|are|was|were|can|could|would|should|will|do|does|did|have|has|had)\b/i;
      if (questionStarters.test(s)) {
        if (s.endsWith(".")) {
          s = s.slice(0, -1) + "?";
        } else if (!s.endsWith("?") && !s.endsWith("!")) {
          s = s + "?";
        }
      } else if (!s.endsWith(".") && !s.endsWith("?") && !s.endsWith("!") && !s.endsWith(":")) {
        if (s.split(/\s+/).length >= 3) {
          s = s + ".";
        }
      }

      // Capitalize first character
      s = s.charAt(0).toUpperCase() + s.slice(1);

      // Proper nouns & acronyms
      s = s.replace(/\b(i)\b/g, "I");
      s = s.replace(/\b(python)\b/gi, "Python");
      s = s.replace(/\b(ai)\b/gi, "AI");
      s = s.replace(/\b(ml)\b/gi, "ML");
      s = s.replace(/\b(api)\b/gi, "API");
      s = s.replace(/\b(html)\b/gi, "HTML");
      s = s.replace(/\b(css)\b/gi, "CSS");
      s = s.replace(/\b(sql)\b/gi, "SQL");

      return s;
    });

    return processedSentences.filter(Boolean).join(" ");
  });

  return formattedParagraphs.filter(Boolean).join("\n\n");
}

function toggleSmartPunctuation(enabled) {
  isSmartPunctuationActive = !!enabled;
  localStorage.setItem("npai_smart_punct", isSmartPunctuationActive);
  const statusEl = document.getElementById("smart-punct-status");
  if (statusEl) {
    statusEl.textContent = isSmartPunctuationActive ? "ACTIVE" : "OFF";
    statusEl.style.color = isSmartPunctuationActive ? "var(--accent-teal, #2A9D8F)" : "var(--ink-soft)";
  }
}

function formatCurrentTranscript() {
  if (!transcriptBox) return;
  const original = transcriptBox.value;
  if (!original.trim()) return;

  const formatted = applySmartPunctuationClient(original);
  transcriptBox.value = formatted;
  updateWordCountAndCapacity();
  updateDoubtCount();

  // Button visual feedback
  const btns = document.querySelectorAll(".smart-punct-bar button");
  btns.forEach((btn) => {
    if (btn.textContent.includes("Auto-Punctuate")) {
      const prev = btn.textContent;
      btn.textContent = "✅ Punctuation Applied!";
      btn.style.color = "var(--sage)";
      setTimeout(() => {
        btn.textContent = prev;
        btn.style.color = "";
      }, 1500);
    }
  });
}

function openSpokenCuesModal() {
  const modal = document.getElementById("spoken-cues-modal");
  if (modal) modal.classList.remove("hidden");
}

function closeSpokenCuesModal() {
  const modal = document.getElementById("spoken-cues-modal");
  if (modal) modal.classList.add("hidden");
}

// ================================================================
// 🧠 SMART STRUCTURE RECOGNITION & ADVANCED SPEECH NLP CLIENT
// ================================================================

// 1. Overlapping Speech & Classroom Chatter Cleanup (Client)
const CHATTER_PATTERNS_CLIENT = [
  /\b(hey\s+pass\s+(me\s+)?(the\s+)?(pen|pencil|notes|book|paper))\b/gi,
  /\b(what\s+page\s+(is\s+it|are\s+we\s+on))\b/gi,
  /\b(did\s+you\s+(understand|get|hear)\s+that)\b/gi,
  /\b(can\s+you\s+hear\s+(him|her|them|the\s+teacher|the\s+sir))\b/gi,
  /\b(what\s+did\s+(he|she|the\s+prof|the\s+teacher|sir|ma'?am)\s+say)\b/gi,
  /\b(is\s+attendance\s+(taken|done|over))\b/gi,
  /\b(shh+|be\s+quiet|stop\s+talking|shut\s+up)\b/gi,
  /\b(bro\s+wait|wait\s+bro|one\s+sec|hold\s+on\s+a\s+sec)\b/gi,
  /\b(what\s+time\s+is\s+it|when\s+is\s+(this\s+class|lunch|break))\b/gi
];

function cleanOverlappingSpeechClient(text) {
  if (!text || typeof text !== "string") return { cleanedText: "", removedCount: 0 };
  let cleaned = text;
  let count = 0;

  CHATTER_PATTERNS_CLIENT.forEach((pattern) => {
    if (pattern.test(cleaned)) {
      const matches = cleaned.match(pattern);
      if (matches) count += matches.length;
      cleaned = cleaned.replace(pattern, " ");
    }
  });

  // Cross-talk echo deduplication: "today we will today we will discuss" -> "today we will discuss"
  cleaned = cleaned.replace(/\b([a-zA-Z0-9_]{2,}(?:\s+[a-zA-Z0-9_]{2,}){0,8})\s+\1\b/gi, (match, phrase) => {
    count++;
    return phrase;
  });

  // Single word repeated stutter
  cleaned = cleaned.replace(/\b([a-zA-Z]{2,})\s+\1\b/gi, (match, word) => {
    count++;
    return word;
  });

  // Clean trailing punctuation before spaces
  cleaned = cleaned.replace(/\s+([.,!?:;])/g, "$1");
  return { cleanedText: cleaned.replace(/[ \t]+/g, " ").trim(), removedCount: count };
}

// 2. Mumble & Whisper Enhancer (Client)
const MUMBLE_MAP_CLIENT = [
  { pattern: /\b([a-zA-Z]{3,})in'\b/gi, replacement: "$1ing" },
  { pattern: /\b(talkin|runnin|workin|learnin|readin|writin|computin|testin|analyzin|buildin|codin|solvin|programmin)\b/gi, 
    replacement: (m) => m + "g" },
  { pattern: /\bwhaddya\b/gi, replacement: "what do you" },
  { pattern: /\bwhatcha\b/gi, replacement: "what are you" },
  { pattern: /\bhafta\b/gi, replacement: "have to" },
  { pattern: /\btryna\b/gi, replacement: "trying to" },
  { pattern: /\boutta\b/gi, replacement: "out of" },
  { pattern: /\bspose\b/gi, replacement: "suppose" },
  { pattern: /\b'spose\b/gi, replacement: "suppose" },
  { pattern: /\bgotchu\b/gi, replacement: "understood" },
  { pattern: /\bgotcha\b/gi, replacement: "understood" },
  { pattern: /\by'know\b/gi, replacement: "you know" },
  { pattern: /\bwoulda\b/gi, replacement: "would have" },
  { pattern: /\bcoulda\b/gi, replacement: "could have" },
  { pattern: /\bshoulda\b/gi, replacement: "should have" },
  { pattern: /\bmusta\b/gi, replacement: "must have" },
  { pattern: /\bgimme\b/gi, replacement: "give me" },
  { pattern: /\blemme\b/gi, replacement: "let me" },
  { pattern: /\bwanna\b/gi, replacement: "want to" },
  { pattern: /\bgonna\b/gi, replacement: "going to" },
  { pattern: /\bkinda\b/gi, replacement: "kind of" },
  { pattern: /\bsorta\b/gi, replacement: "sort of" },
  { pattern: /\bdunno\b/gi, replacement: "do not know" },
  { pattern: /\bprolly\b/gi, replacement: "probably" },
  { pattern: /\bcuz\b/gi, replacement: "because" }
];

function enhanceMumblesAndWhispersClient(text) {
  if (!text || typeof text !== "string") return { enhancedText: "", enhancedCount: 0 };
  let enhanced = text;
  let count = 0;

  MUMBLE_MAP_CLIENT.forEach(({ pattern, replacement }) => {
    if (pattern.test(enhanced)) {
      const matches = enhanced.match(pattern);
      if (matches) count += matches.length;
      enhanced = enhanced.replace(pattern, replacement);
    }
  });

  return { enhancedText: enhanced.trim(), enhancedCount: count };
}

// 3. Content-Based Domain Academic Spelling (Client)
const CONTENT_SPELLING_CLIENT = [
  { pattern: /\b(pie\s*thon|py\s*thon)\b/gi, replacement: "Python" },
  { pattern: /\b(see\s*plus\s*plus|c\s*plus\s*plus)\b/gi, replacement: "C++" },
  { pattern: /\b(see\s*sharp|c\s*sharp)\b/gi, replacement: "C#" },
  { pattern: /\b(sequel|s\s*q\s*l)\b/gi, replacement: "SQL" },
  { pattern: /\b(no\s*sequel|no\s*sql)\b/gi, replacement: "NoSQL" },
  { pattern: /\b(new\s*pie|num\s*pie|numpai)\b/gi, replacement: "NumPy" },
  { pattern: /\b(pan\s*das)\b/gi, replacement: "Pandas" },
  { pattern: /\b(mat\s*plot\s*lib|match\s*plot\s*lib)\b/gi, replacement: "Matplotlib" },
  { pattern: /\b(tensor\s*flow)\b/gi, replacement: "TensorFlow" },
  { pattern: /\b(pie\s*torch|py\s*torch)\b/gi, replacement: "PyTorch" },
  { pattern: /\b(java\s*script)\b/gi, replacement: "JavaScript" },
  { pattern: /\b(type\s*script)\b/gi, replacement: "TypeScript" },
  { pattern: /\b(node\s*j\s*s|node\s*js)\b/gi, replacement: "Node.js" },
  { pattern: /\b(react\s*j\s*s|react\s*js)\b/gi, replacement: "React.js" },
  { pattern: /\b(git\s*hub)\b/gi, replacement: "GitHub" },
  { pattern: /\b(doc\s*ker)\b/gi, replacement: "Docker" },
  { pattern: /\b(kuberneties|koobernetes)\b/gi, replacement: "Kubernetes" },
  { pattern: /\b(post\s*grass|post\s*gres)\b/gi, replacement: "PostgreSQL" },
  { pattern: /\b(mongo\s*d\s*b|mongo\s*db)\b/gi, replacement: "MongoDB" },
  { pattern: /\b(polly\s*morphism|poly\s*morphism)\b/gi, replacement: "polymorphism" },
  { pattern: /\b(n\s*capsulation|in\s*capsulation)\b/gi, replacement: "encapsulation" },
  { pattern: /\b(in\s*heritance)\b/gi, replacement: "inheritance" },
  { pattern: /\b(ab\s*straction)\b/gi, replacement: "abstraction" },
  { pattern: /\b(a\s*synchronous)\b/gi, replacement: "asynchronous" },
  { pattern: /\b(bull\s*e\s*an|bool\s*e\s*an)\b/gi, replacement: "Boolean" },
  { pattern: /\b(re\s*cursion)\b/gi, replacement: "recursion" },
  { pattern: /\b(big\s*oh\s*notation|big\s*o\s*notation)\b/gi, replacement: "Big-O notation" },
  { pattern: /\b(dike\s*stra|dijkstra)\b/gi, replacement: "Dijkstra" },
  { pattern: /\b(deriv\s*ative)\b/gi, replacement: "derivative" },
  { pattern: /\b(integ\s*ral)\b/gi, replacement: "integral" },
  { pattern: /\b(poly\s*nomial)\b/gi, replacement: "polynomial" },
  { pattern: /\b(quad\s*ratic)\b/gi, replacement: "quadratic" },
  { pattern: /\b(i\s*can\s*value|eigen\s*value)\b/gi, replacement: "eigenvalue" },
  { pattern: /\b(i\s*can\s*vector|eigen\s*vector)\b/gi, replacement: "eigenvector" },
  { pattern: /\b(stock\s*astic|stocastic)\b/gi, replacement: "stochastic" },
  { pattern: /\b(a\s*symptom\s*tick|asymptotic)\b/gi, replacement: "asymptotic" },
  { pattern: /\b(thermo\s*dynamics)\b/gi, replacement: "thermodynamics" },
  { pattern: /\b(electro\s*magnetism)\b/gi, replacement: "electromagnetism" },
  { pattern: /\b(quantum\s*mechanics)\b/gi, replacement: "quantum mechanics" },
  { pattern: /\b(fourier\s*transform)\b/gi, replacement: "Fourier Transform" },
  { pattern: /\b(laplace\s*transform)\b/gi, replacement: "Laplace Transform" },
  { pattern: /\b(photo\s*synth\s*says|photo\s*synthesis)\b/gi, replacement: "photosynthesis" },
  { pattern: /\b(car\s*ball\s*hydrate|carbo\s*hydrate)\b/gi, replacement: "carbohydrate" },
  { pattern: /\b(mighty\s*chondria|mito\s*chondria)\b/gi, replacement: "mitochondria" },
  { pattern: /\b(chromo\s*somes)\b/gi, replacement: "chromosomes" },
  { pattern: /\b(endoplasmic\s*reticulum)\b/gi, replacement: "endoplasmic reticulum" },
  { pattern: /\b(golgi\s*apparatus)\b/gi, replacement: "Golgi apparatus" },
  { pattern: /\b(crispr|c\s*r\s*i\s*s\s*p\s*r)\b/gi, replacement: "CRISPR" },
  { pattern: /\b(polymerase\s*chain\s*reaction|p\s*c\s*r)\b/gi, replacement: "PCR" }
];

function applyContentBasedSpellingClient(text) {
  if (!text || typeof text !== "string") return { correctedText: "", correctedCount: 0 };
  let corrected = text;
  let count = 0;

  CONTENT_SPELLING_CLIENT.forEach(({ pattern, replacement }) => {
    if (pattern.test(corrected)) {
      const matches = corrected.match(pattern);
      if (matches) count += matches.length;
      corrected = corrected.replace(pattern, replacement);
    }
  });

  return { correctedText: corrected, correctedCount: count };
}

// 4. Automatic Capitalization & Acronyms (Client)
const ACRONYMS_CLIENT = [
  "AI", "ML", "DL", "NLP", "API", "HTML", "CSS", "SQL", "NoSQL", "CPU", "GPU", "TPU",
  "RAM", "ROM", "SSD", "HDD", "REST", "JSON", "XML", "HTTP", "HTTPS", "TCP", "UDP", "IP",
  "DNS", "SSH", "FTP", "UUID", "JWT", "OOP", "DOM", "URI", "URL", "GUI", "CLI", "OS",
  "SDK", "IDE", "AWS", "GCP", "BERT", "LLM", "GPT", "DNA", "RNA", "ATP", "CRISPR", "NASA"
];

const PROPER_NAMES_CLIENT = [
  "Guido van Rossum", "Alan Turing", "Ada Lovelace", "Albert Einstein", "Isaac Newton",
  "Charles Darwin", "Pythagoras", "Euclid", "Euler", "Fibonacci", "Dijkstra", "Bernoulli",
  "Gauss", "Fourier", "Laplace", "Bayes", "Boltzmann", "Planck", "Schrodinger", "Heisenberg"
];

const TECH_NAMES_CLIENT = [
  "Python", "JavaScript", "TypeScript", "Java", "C++", "C#", "Rust", "Go", "Swift",
  "Kotlin", "PHP", "Ruby", "Scala", "MATLAB", "React", "Angular", "Vue", "Next.js",
  "Express", "Django", "Flask", "FastAPI", "Spring Boot", "TensorFlow", "PyTorch",
  "NumPy", "Pandas", "Matplotlib", "Seaborn", "Scikit-learn", "Linux", "Ubuntu",
  "Windows", "macOS", "Android", "iOS", "Git", "GitHub", "Docker", "Kubernetes",
  "PostgreSQL", "MySQL", "MongoDB", "Redis", "SQLite"
];

function applyAutomaticCapitalizationClient(text) {
  if (!text || typeof text !== "string") return "";
  let formatted = text;

  // Acronyms
  ACRONYMS_CLIENT.forEach((acr) => {
    const acrRegex = new RegExp(`\\b(${acr})\\b`, "gi");
    formatted = formatted.replace(acrRegex, acr);
  });

  // Names
  PROPER_NAMES_CLIENT.forEach((name) => {
    const nameRegex = new RegExp(`\\b(${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\b`, "gi");
    formatted = formatted.replace(nameRegex, name);
  });

  // Tech Names
  TECH_NAMES_CLIENT.forEach((tech) => {
    const techRegex = new RegExp(`\\b(${tech.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\b`, "gi");
    formatted = formatted.replace(techRegex, tech);
  });

  // Standalone 'I'
  formatted = formatted
    .replace(/\b(i)\b/g, "I")
    .replace(/\b(i)'(m|ve|ll|d)\b/g, "I'$2")
    .replace(/\b(i)\s+am\b/g, "I am");

  return formatted;
}

// 5. Full Normalization Pass (Slang + Mumbles + Chatter + Spelling + Capitalization)
function normalizeSlangAndFillersClient(text) {
  if (!text || typeof text !== "string") return { cleanedText: "", slangCount: 0, spellingCount: 0 };
  let cleaned = text;
  let count = 0;

  // 1. Clean Chatter & Overlapping Speech
  const overlapRes = cleanOverlappingSpeechClient(cleaned);
  cleaned = overlapRes.cleanedText;
  count += overlapRes.removedCount;

  // 2. Mumble & Whisper Repair
  const mumbleRes = enhanceMumblesAndWhispersClient(cleaned);
  cleaned = mumbleRes.enhancedText;
  count += mumbleRes.enhancedCount;

  // 3. Technical Spelling Correction
  const spellRes = applyContentBasedSpellingClient(cleaned);
  cleaned = spellRes.correctedText;
  const spellingCount = spellRes.correctedCount;

  // 4. Fillers removal
  const fillers = [
    /\b(um+|uh+|er+|ah+)\b[\s,]*/gi,
    /\b(like\s+like|you\s+know\s+what\s+i\s+mean)\b[\s,]*/gi,
    /\b(you know|i mean|so yeah|right right|basically|literally)\b[\s,]*/gi
  ];
  fillers.forEach((fr) => {
    if (fr.test(cleaned)) {
      const matches = cleaned.match(fr);
      if (matches) count += matches.length;
      cleaned = cleaned.replace(fr, " ");
    }
  });

  // 5. Auto-Capitalization
  cleaned = applyAutomaticCapitalizationClient(cleaned);

  return { cleanedText: cleaned.replace(/[ \t]+/g, " ").trim(), slangCount: count, spellingCount };
}

function updateSmartStructureHUD() {
  if (!transcriptBox) return;
  const raw = transcriptBox.value.trim();
  if (!raw) {
    setHudPill("hud-pill-headings", "hud-count-headings", 0);
    setHudPill("hud-pill-defs", "hud-count-defs", 0);
    setHudPill("hud-pill-formulas", "hud-count-formulas", 0);
    setHudPill("hud-pill-slang", "hud-count-slang", 0);
    setHudPill("hud-pill-spelling", "hud-count-spelling", 0);
    return;
  }

  const { cleanedText, slangCount, spellingCount } = normalizeSlangAndFillersClient(raw);
  const formatted = applySmartPunctuationClient(cleanedText);
  const sentences = formatted.split(/(?<=[.?!])\s+/);

  // 1. Headings
  const headingKeywords = /^(topic|chapter|section|unit|module|overview of|introduction to|part \d|deep dive into|next we discuss|let's examine|moving on to)\b/i;
  const headings = sentences.filter((s) => headingKeywords.test(s.trim()) || (s.length < 50 && s.endsWith(":") && !s.includes(" ")));

  // 2. Definitions
  const defRegex = /^(.{2,40}?)\s+(is|means|refers to|is called|is known as)\s+(.+)$/i;
  const defs = sentences.filter((s) => defRegex.test(s.trim()));

  // 3. Formulas
  const formulas = sentences.filter((s) => /[=+\-*/^]/.test(s) && /\d/.test(s));

  // Update UI Pills
  setHudPill("hud-pill-headings", "hud-count-headings", headings.length);
  setHudPill("hud-pill-defs", "hud-count-defs", defs.length);
  setHudPill("hud-pill-formulas", "hud-count-formulas", formulas.length);
  setHudPill("hud-pill-slang", "hud-count-slang", slangCount);
  setHudPill("hud-pill-spelling", "hud-count-spelling", spellingCount);
}

function setHudPill(pillId, countId, count) {
  const countEl = document.getElementById(countId);
  const pillEl = document.getElementById(pillId);
  if (countEl) countEl.textContent = count;
  if (pillEl) pillEl.classList.toggle("active", count > 0);
}

// ---- Toolbar Action Functions ----

function cleanOverlapInTranscript() {
  if (!transcriptBox) return;
  const raw = transcriptBox.value;
  if (!raw.trim()) return;

  const { cleanedText, removedCount } = cleanOverlappingSpeechClient(raw);
  transcriptBox.value = cleanedText;
  updateWordCountAndCapacity();
  updateDoubtCount();
  updateSmartStructureHUD();

  showTemporaryBtnSuccess("Clean Chatter", `✅ Removed ${removedCount} chatter fragments!`);
}

function repairMumblesInTranscript() {
  if (!transcriptBox) return;
  const raw = transcriptBox.value;
  if (!raw.trim()) return;

  const { enhancedText, enhancedCount } = enhanceMumblesAndWhispersClient(raw);
  transcriptBox.value = enhancedText;
  updateWordCountAndCapacity();
  updateDoubtCount();
  updateSmartStructureHUD();

  showTemporaryBtnSuccess("Fix Mumbles", `🗣️ Repaired ${enhancedCount} words!`);
}

function correctSpellingInTranscript() {
  if (!transcriptBox) return;
  const raw = transcriptBox.value;
  if (!raw.trim()) return;

  const { correctedText, correctedCount } = applyContentBasedSpellingClient(raw);
  transcriptBox.value = correctedText;
  updateWordCountAndCapacity();
  updateDoubtCount();
  updateSmartStructureHUD();

  showTemporaryBtnSuccess("Fix Spelling", `📖 Corrected ${correctedCount} tech terms!`);
}

function autoCapitalizeInTranscript() {
  if (!transcriptBox) return;
  const raw = transcriptBox.value;
  if (!raw.trim()) return;

  const capitalized = applyAutomaticCapitalizationClient(raw);
  transcriptBox.value = capitalized;
  updateWordCountAndCapacity();
  updateDoubtCount();
  updateSmartStructureHUD();

  showTemporaryBtnSuccess("Auto-Capitalize", "🔠 Capitalized Acronyms & Names!");
}

function fullEnhanceTranscript() {
  if (!transcriptBox) return;
  const raw = transcriptBox.value;
  if (!raw.trim()) return;

  const { cleanedText } = normalizeSlangAndFillersClient(raw);
  const formatted = applySmartPunctuationClient(cleanedText);
  transcriptBox.value = formatted;
  updateWordCountAndCapacity();
  updateDoubtCount();
  updateSmartStructureHUD();

  showTemporaryBtnSuccess("Full Enhance", "✨ Full Speech Suite Applied!");
}

function normalizeSlangInTranscript() {
  fullEnhanceTranscript();
}

function instantSmartOrganize() {
  if (!transcriptBox) return;
  const raw = transcriptBox.value.trim();
  if (!raw) return;

  const { cleanedText } = normalizeSlangAndFillersClient(raw);
  const formatted = applySmartPunctuationClient(cleanedText);
  const sentences = formatted.split(/(?<=[.?!])\s+/);

  const paragraphs = [];
  for (let i = 0; i < sentences.length; i += 4) {
    paragraphs.push(sentences.slice(i, i + 4).join(" "));
  }

  transcriptBox.value = paragraphs.join("\n\n");
  updateWordCountAndCapacity();
  updateDoubtCount();
  updateSmartStructureHUD();

  showTemporaryBtnSuccess("Quick Organize", "⚡ Smart Organized!");
}

function showTemporaryBtnSuccess(textSubstring, successMsg) {
  const btns = document.querySelectorAll(".smart-structure-hud button");
  btns.forEach((btn) => {
    if (btn.textContent.includes(textSubstring)) {
      const prev = btn.textContent;
      btn.textContent = successMsg;
      btn.style.color = "var(--sage)";
      setTimeout(() => {
        btn.textContent = prev;
        btn.style.color = "";
      }, 1800);
    }
  });
}

function initSmartPunctuationUI() {
  const toggle = document.getElementById("smart-punct-toggle");
  if (toggle) {
    toggle.checked = isSmartPunctuationActive;
    toggleSmartPunctuation(isSmartPunctuationActive);
  }
}

// Attach debounced HUD update to transcript box
if (transcriptBox) {
  transcriptBox.addEventListener("input", () => {
    updateSmartStructureHUD();
  });
  transcriptBox.addEventListener("keyup", updateSmartStructureHUD);
  transcriptBox.addEventListener("paste", () => setTimeout(updateSmartStructureHUD, 50));
}

loadTagsDatalist();
setupDragAndDrop();
loadDspSettings();
drawIdleVisualizer();
updateWordCountAndCapacity();
initSmartPunctuationUI();
updateSmartStructureHUD();





