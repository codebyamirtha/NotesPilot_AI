// ================================================================
// routes/supporter.js
// Feature: Student Supporter - AI Academic Tutor powered by OpenAI
// ================================================================

const express = require("express");
const https = require("https");
const { readDb } = require("../utils/db");
const { verifyToken } = require("../middleware/auth");
const ai = require("../utils/aiEngine");

const router = express.Router();
router.use(verifyToken);

// Helper function to call OpenAI Chat Completions API
function callOpenAI(apiKey, model, messages) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: model || "gpt-4o-mini",
      messages,
      temperature: 0.7,
      max_tokens: 1200
    });

    const options = {
      hostname: "api.openai.com",
      port: 443,
      path: "/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey.trim()}`,
        "Content-Length": Buffer.byteLength(postData)
      },
      timeout: 30000
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const content = parsed.choices && parsed.choices[0] && parsed.choices[0].message
              ? parsed.choices[0].message.content
              : "I couldn't generate a response. Please try again.";
            resolve({ success: true, content, model: parsed.model || model, usage: parsed.usage });
          } else {
            const errMessage = parsed.error ? parsed.error.message : `OpenAI API error (${res.statusCode})`;
            reject(new Error(errMessage));
          }
        } catch (err) {
          reject(new Error(`Failed to parse OpenAI response: ${err.message}`));
        }
      });
    });

    req.on("error", (err) => {
      reject(new Error(`Network error connecting to OpenAI: ${err.message}`));
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request to OpenAI timed out (30s limit). Please try again."));
    });

    req.write(postData);
    req.end();
  });
}

// Generate an intelligent offline response when OpenAI API key is unavailable
function generateOfflineSupporterResponse(message, lectureNotes, subjectName) {
  const msgLower = message.toLowerCase();

  // If we have specific lecture context
  if (lectureNotes) {
    const doubtResult = ai.answerDoubt(message, lectureNotes);
    if (doubtResult.confidence !== "Low" && doubtResult.answer) {
      let response = `### 📚 Answer from your notes on **${subjectName || "Lecture"}**:\n\n${doubtResult.answer}\n\n`;
      if (doubtResult.sources && doubtResult.sources.length > 0) {
        response += `**Relevant Section:** _"${doubtResult.sources[0]}"_\n\n`;
      }
      return response + `\n\n> 💡 *Tip: You can add an OpenAI API key in the settings above to ask open-ended questions beyond this specific note.*`;
    }
  }

  // Heuristic responses for common academic prompts
  if (msgLower.includes("study plan") || msgLower.includes("schedule") || msgLower.includes("exam")) {
    return `### 🎯 Actionable Study Strategy & Exam Prep Plan\n\n` +
      `Here is a structured academic action plan to maximize your retention:\n\n` +
      `1. **Active Recall & Spaced Review (40 mins)**\n` +
      `   - Test yourself on core definitions and formulas before re-reading notes.\n` +
      `   - Highlight areas where you hesitate and review those specific sections.\n\n` +
      `2. **Problem Solving & Application (30 mins)**\n` +
      `   - Solve 3-5 practice problems or past exam questions.\n` +
      `   - Generate a Mock Exam Paper from your **My Notes** page.\n\n` +
      `3. **Teach-Back / Feynman Technique (15 mins)**\n` +
      `   - Explain the hardest concept aloud in plain language as if teaching a peer.\n\n` +
      `4. **Rest & Memory Consolidation (10 mins)**\n` +
      `   - Step away from screens for mental recovery.\n\n` +
      `> 💡 *Connect your OpenAI API key in the top settings to get a personalized day-by-day plan customized to your exact syllabus!*`;
  }

  if (msgLower.includes("eli5") || msgLower.includes("simply") || msgLower.includes("simple") || msgLower.includes("explain")) {
    return `### 💡 Concept Simplification Guide (ELI5)\n\n` +
      `When mastering difficult topics, remember the 3-layer breakdown:\n\n` +
      `- **The Real-World Analogy**: Think of complex systems like everyday mechanisms (e.g. a CPU is like a fast chef, RAM is the kitchen counter, and Hard Drive is the pantry storage).\n` +
      `- **The Core Purpose**: What problem does this concept solve?\n` +
      `- **The Key Mechanism**: How does information or data flow through it?\n\n` +
      `Feel free to paste the exact paragraph or concept you want broken down!\n\n` +
      `> 🤖 *Powered by NotesPilot Offline Assistant. Enter an OpenAI API key above for live GPT-4o explanations on any topic.*`;
  }

  if (msgLower.includes("stress") || msgLower.includes("anxiety") || msgLower.includes("motivation") || msgLower.includes("tired")) {
    return `### 🧘 Student Wellness & Focus Boost\n\n` +
      `Academic pressure is real, and it is completely normal to feel overwhelmed at times. Here are 3 quick resets:\n\n` +
      `1. **The 2-Minute Box Breathing**: Inhale for 4 seconds, hold for 4, exhale for 4, hold for 4. Lowers cortisol immediately.\n` +
      `2. **Shrink the Mountain**: Don't think about the whole semester. Pick just ONE 15-minute task right now.\n` +
      `3. **Use the Focus Timer**: Check out the **Focus & Skill Tree** page for structured Pomodoro sessions.\n\n` +
      `You've got this! One step at a time. 🌟`;
  }

  return `### 🤖 Student Supporter Academic Assistant\n\n` +
    `Hello! I'm your 24/7 academic companion in NotesPilot AI. I can help you with:\n\n` +
    `- **Concept Clarifications & Analogies**: Breaking down tough theory into intuitive explanations.\n` +
    `- **Exam Preparation & Practice Questions**: Creating mock tests and grading criteria.\n` +
    `- **Study Strategy & Time Management**: Structuring your revision schedules.\n` +
    `- **Lecture Q&A**: Answering doubts directly from your uploaded classroom notes.\n\n` +
    `To activate live **GPT-4o / GPT-3.5** intelligence for open-ended queries, click **⚙️ OpenAI Key Settings** at the top right of this chat.\n\n` +
    `What subject or topic are you working on today?`;
}

// GET /api/supporter/status -> check if OpenAI is configured
router.get("/status", (req, res) => {
  const hasEnvKey = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().startsWith("sk-"));
  res.json({
    hasServerKey: hasEnvKey,
    defaultModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
    availableModels: [
      { id: "gpt-4o-mini", name: "GPT-4o Mini (Fast, Intelligent & Cost-Effective)", recommended: true },
      { id: "gpt-4o", name: "GPT-4o (State-of-the-Art Academic Reasoning)" },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo (Legacy Fast Model)" },
      { id: "offline", name: "Offline Smart Assistant (Zero API Key Needed)" }
    ]
  });
});

// POST /api/supporter/chat -> send message to Student Supporter
router.post("/chat", async (req, res) => {
  const { message, history = [], lectureId, apiKey: clientApiKey, model = "gpt-4o-mini" } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ message: "A message is required." });
  }

  const db = readDb();
  let lectureContext = "";
  let lectureSubject = "";
  let lectureNotes = null;

  if (lectureId) {
    const lecture = (db.lectures || []).find((l) => l.id === lectureId && l.userId === req.user.id);
    if (lecture) {
      lectureSubject = lecture.subject;
      lectureNotes = lecture.notes;
      lectureContext = `\n--- SPECIFIC LECTURE NOTES CONTEXT ---\n` +
        `Subject: ${lecture.subject}\n` +
        `Teacher: ${lecture.teacher || "N/A"}\n` +
        `Summary: ${lecture.notes ? lecture.notes.summaryShort || lecture.notes.summary5min : ""}\n` +
        `Key Keywords: ${(lecture.notes && lecture.notes.keywords) ? lecture.notes.keywords.join(", ") : ""}\n` +
        `Transcript Snippet: ${(lecture.transcript || "").slice(0, 1500)}\n` +
        `--- END LECTURE CONTEXT ---\n`;
    }
  }

  const effectiveApiKey = (clientApiKey && clientApiKey.trim()) || process.env.OPENAI_API_KEY;

  // If user selected offline mode explicitly or no API key is provided
  if (model === "offline" || !effectiveApiKey || !effectiveApiKey.startsWith("sk-")) {
    const offlineReply = generateOfflineSupporterResponse(message, lectureNotes, lectureSubject);
    return res.json({
      reply: offlineReply,
      source: "offline",
      model: "Offline Smart Assistant",
      hasKey: false
    });
  }

  // Construct system prompt and message array for OpenAI API
  const systemPrompt = `You are "Student Supporter", an empathetic, pedagogical, and brilliant AI academic companion and tutor in the NotesPilot AI application.
Your goal is to help students learn deeply, understand complicated concepts with ease, prepare for university/college exams, write better essays, debug code, and stay motivated.

Guidelines:
1. If lecture context is provided below, reference it directly to align with what the student was taught in class.
2. Structure your answers with clean, beautiful Markdown (use bold headers, bullet lists, math equations in LaTeX or clear notation, code blocks with language tags).
3. Use encouraging, patient, and engaging language.
4. When explaining complex ideas, start with an intuitive real-world analogy before diving into technical details.
5. Offer follow-up questions or 1-2 practical practice challenges to verify the student's understanding.
${lectureContext}`;

  const formattedMessages = [
    { role: "system", content: systemPrompt }
  ];

  // Append recent chat history (limit last 8 messages for token economy)
  const recentHistory = Array.isArray(history) ? history.slice(-8) : [];
  recentHistory.forEach((msg) => {
    if (msg.role === "user" || msg.role === "assistant") {
      formattedMessages.push({ role: msg.role, content: String(msg.content) });
    }
  });

  // Append current user message
  formattedMessages.push({ role: "user", content: message.trim() });

  try {
    const aiResponse = await callOpenAI(effectiveApiKey, model, formattedMessages);
    return res.json({
      reply: aiResponse.content,
      source: "openai",
      model: aiResponse.model,
      usage: aiResponse.usage,
      hasKey: true
    });
  } catch (err) {
    console.error("OpenAI API call error:", err.message);
    // Fallback to offline engine with explanation
    const fallbackReply = generateOfflineSupporterResponse(message, lectureNotes, lectureSubject);
    const combinedReply = `> ⚠️ **Notice**: OpenAI request failed (${err.message}). Showing response from Offline Assistant.\n\n` + fallbackReply;

    return res.json({
      reply: combinedReply,
      source: "fallback",
      error: err.message,
      model: "Offline Smart Assistant (Fallback)",
      hasKey: true
    });
  }
});

module.exports = router;
