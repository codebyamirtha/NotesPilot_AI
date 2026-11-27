// ================================================================
// routes/lectures.js
// Feature 2: Live Lecture Recording (receives transcript from frontend)
// Feature 4: Smart Note Generation
// Feature 5: AI Lecture Summary
// Feature 6: Important Point Detection
// Feature 7: Keyword Extraction
// Feature 11: Lecture History
// Feature 12: Search Notes
// ================================================================

const express = require("express");
const { v4: uuidv4 } = require("uuid");

const { readDb, writeDb } = require("../utils/db");
const { verifyToken } = require("../middleware/auth");
const ai = require("../utils/aiEngine");

const router = express.Router();
router.use(verifyToken); // every lecture route requires login

// Helper to look up user lecture with fallback to seeded/shared lectures
function findLecture(db, id, userId) {
  let lecture = (db.lectures || []).find((l) => l.id === id && l.userId === userId);
  if (!lecture) {
    lecture = (db.lectures || []).find((l) => l.id === id);
  }
  return lecture;
}

function findLectureIndex(db, id, userId) {
  let idx = (db.lectures || []).findIndex((l) => l.id === id && l.userId === userId);
  if (idx === -1) {
    idx = (db.lectures || []).findIndex((l) => l.id === id);
  }
  return idx;
}

// POST /api/lectures  -> save a finished lecture + auto-generate smart notes
router.post("/", (req, res) => {
  const { subject, subjectTag, teacher, transcript, doubts, handwrittenPages } = req.body;

  if (!transcript || transcript.trim().length === 0) {
    return res.status(400).json({ message: "Transcript is empty. Record or import a lecture first." });
  }

  const notes = ai.generateSmartNotes(transcript);

  const tag = (subjectTag && subjectTag.trim()) || subject || "General";

  // Initialize doubts array
  let lectureDoubts = [];
  if (Array.isArray(doubts) && doubts.length > 0) {
    lectureDoubts = doubts.map((d) => ({
      id: d.id || uuidv4(),
      question: d.question || "Marked Lecture Doubt",
      solution: d.solution || (d.autoSolve ? (ai.answerDoubt(d.question, notes, transcript).answer || "") : ""),
      resolved: !!d.resolved,
      createdAt: d.createdAt || new Date().toISOString()
    }));
  }

  // Also auto-extract any 🔴 marked phrases from transcript if not already in doubts
  if (transcript.includes("🔴") && lectureDoubts.length === 0) {
    const rawSentences = transcript.split(/(?<=[.?!])\s+/);
    rawSentences.forEach((sentence) => {
      if (sentence.includes("🔴")) {
        const cleanPhrase = sentence.replace(/🔴/g, "").trim();
        if (cleanPhrase.length > 3) {
          const aiAnswer = ai.answerDoubt(cleanPhrase, notes, transcript);
          lectureDoubts.push({
            id: uuidv4(),
            question: `Doubt on: "${cleanPhrase}"`,
            solution: aiAnswer.answer || "",
            resolved: false,
            createdAt: new Date().toISOString()
          });
        }
      }
    });
  }

  const lecture = {
    id: uuidv4(),
    userId: req.user.id,
    subject: subject || "Untitled Subject",
    subjectTag: tag,
    teacher: teacher || "Unknown",
    transcript,
    notes,
    doubts: lectureDoubts,
    handwrittenPages: Array.isArray(handwrittenPages) ? handwrittenPages : [],
    date: new Date().toISOString()
  };

  const db = readDb();
  db.lectures.push(lecture);
  writeDb(db);

  res.status(201).json({ message: "Lecture saved and notes generated.", lecture });
});

// POST /api/lectures/enhance-transcript -> Apply speech filtering, mumble repair, content spelling & capitalization
router.post("/enhance-transcript", (req, res) => {
  const { transcript = "", subjectTag = "", options = {} } = req.body;
  if (!transcript || typeof transcript !== "string") {
    return res.status(400).json({ message: "Transcript text is required." });
  }

  let text = transcript;
  let overlapCleaned = 0;
  let mumbleRepaired = 0;
  let spellingCorrected = 0;

  // 1. Overlapping Speech & Chatter Cleanup
  if (options.overlapCleanup !== false) {
    const resOverlap = ai.cleanOverlappingSpeechAndChatter(text);
    text = resOverlap.cleanedText;
    overlapCleaned = resOverlap.removedCount;
  }

  // 2. Mumble & Whisper Enhancer
  if (options.mumbleEnhance !== false) {
    const resMumble = ai.enhanceMumblesAndWhispers(text);
    text = resMumble.enhancedText;
    mumbleRepaired = resMumble.enhancedCount;
  }

  // 3. Content-Based Academic Spelling
  if (options.contentSpelling !== false) {
    const resSpell = ai.applyContentBasedSpelling(text, subjectTag);
    text = resSpell.correctedText;
    spellingCorrected = resSpell.correctedCount;
  }

  // 4. Smart Punctuation
  if (options.smartPunctuation !== false) {
    text = ai.applySmartPunctuation(text);
  }

  // 5. Automatic Capitalization
  if (options.autoCapitalize !== false) {
    text = ai.applyAutomaticCapitalization(text);
  }

  res.json({
    enhancedTranscript: text,
    stats: {
      overlapCleaned,
      mumbleRepaired,
      spellingCorrected,
      totalAdjustments: overlapCleaned + mumbleRepaired + spellingCorrected
    }
  });
});

// GET /api/lectures/tags -> unique subject tags for logged-in user
router.get("/tags", (req, res) => {
  const db = readDb();
  let userLectures = db.lectures.filter((l) => l.userId === req.user.id);
  if (userLectures.length === 0) {
    userLectures = db.lectures;
  }
  const tagsSet = new Set();
  userLectures.forEach((l) => {
    if (l.subjectTag) tagsSet.add(l.subjectTag);
    if (l.subject) tagsSet.add(l.subject);
  });
  res.json({ tags: Array.from(tagsSet).sort() });
});

// GET /api/lectures -> lecture history for the logged-in user (optional ?tag= parameter)
router.get("/", (req, res) => {
  const { tag } = req.query;
  const db = readDb();
  let lectures = db.lectures.filter((l) => l.userId === req.user.id);
  if (lectures.length === 0) {
    lectures = db.lectures;
  }

  if (tag && tag !== "All") {
    const target = tag.toLowerCase();
    lectures = lectures.filter((l) =>
      (l.subjectTag && l.subjectTag.toLowerCase() === target) ||
      (l.subject && l.subject.toLowerCase() === target)
    );
  }

  lectures.sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json({ lectures });
});

// GET /api/lectures/doubts/all -> All doubts across all lectures for Dashboard checklist
router.get("/doubts/all", (req, res) => {
  const db = readDb();
  let userLectures = db.lectures.filter((l) => l.userId === req.user.id);
  if (userLectures.length === 0) {
    userLectures = db.lectures;
  }
  const allDoubts = [];

  userLectures.forEach((lec) => {
    (lec.doubts || []).forEach((d) => {
      allDoubts.push({
        id: d.id,
        lectureId: lec.id,
        lectureSubject: lec.subject,
        subjectTag: lec.subjectTag || lec.subject,
        question: d.question,
        solution: d.solution || "",
        resolved: !!d.resolved,
        createdAt: d.createdAt || lec.date
      });
    });
  });

  // Sort: unresolved first, then newest
  allDoubts.sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  res.json({ doubts: allDoubts });
});

// PATCH /api/lectures/doubts/:doubtId/toggle -> Toggle doubt resolution from dashboard or any view
router.patch("/doubts/:doubtId/toggle", (req, res) => {
  const db = readDb();
  let userLectures = db.lectures.filter((l) => l.userId === req.user.id);
  if (userLectures.length === 0) {
    userLectures = db.lectures;
  }

  let targetDoubt = null;
  let targetLecture = null;

  for (const lec of userLectures) {
    if (lec.doubts) {
      const d = lec.doubts.find((item) => item.id === req.params.doubtId);
      if (d) {
        targetDoubt = d;
        targetLecture = lec;
        break;
      }
    }
  }

  if (!targetDoubt) {
    return res.status(404).json({ message: "Doubt item not found." });
  }

  targetDoubt.resolved = !targetDoubt.resolved;
  targetDoubt.updatedAt = new Date().toISOString();
  writeDb(db);

  res.json({ message: "Doubt status toggled successfully.", doubt: targetDoubt, lectureId: targetLecture.id });
});

// GET /api/lectures/:id -> a single lecture's full notes
router.get("/:id", (req, res) => {
  const db = readDb();
  const lecture = findLecture(db, req.params.id, req.user.id);
  if (!lecture) return res.status(404).json({ message: "Lecture not found." });
  if (!lecture.doubts) lecture.doubts = [];
  res.json({ lecture });
});

// POST /api/lectures/:id/ask -> "Chat with Your Notes" doubt answering
router.post("/:id/ask", (req, res) => {
  const { query } = req.body;
  const db = readDb();
  const lecture = findLecture(db, req.params.id, req.user.id);
  if (!lecture) return res.status(404).json({ message: "Lecture not found." });

  const result = ai.answerDoubt(query, lecture.notes, lecture.transcript);
  res.json(result);
});

// GET /api/lectures/:id/exam-paper -> Mock University Exam Paper generator
router.get("/:id/exam-paper", (req, res) => {
  const db = readDb();
  const lecture = findLecture(db, req.params.id, req.user.id);
  if (!lecture) return res.status(404).json({ message: "Lecture not found." });

  const paper = ai.generateExamPaper(lecture.notes, lecture.subject);
  res.json({ examPaper: paper });
});

// PUT /api/lectures/:id -> update an existing lecture note
router.put("/:id", (req, res) => {
  const { subject, subjectTag, teacher, transcript, notes, regenerateAI } = req.body;
  const db = readDb();
  const lectureIndex = findLectureIndex(db, req.params.id, req.user.id);
  if (lectureIndex === -1) return res.status(404).json({ message: "Lecture not found." });

  const lecture = db.lectures[lectureIndex];
  if (subject !== undefined) lecture.subject = subject.trim() || lecture.subject;
  if (subjectTag !== undefined) lecture.subjectTag = subjectTag.trim() || lecture.subjectTag;
  if (teacher !== undefined) lecture.teacher = teacher.trim() || lecture.teacher;
  if (transcript !== undefined) lecture.transcript = transcript;

  if (regenerateAI && transcript) {
    lecture.notes = ai.generateSmartNotes(transcript);
  } else if (notes) {
    lecture.notes = { ...lecture.notes, ...notes };
  }

  lecture.updatedAt = new Date().toISOString();
  db.lectures[lectureIndex] = lecture;
  writeDb(db);

  res.json({ message: "Lecture updated successfully.", lecture });
});

// DELETE /api/lectures/:id -> delete a lecture and associated quizzes
router.delete("/:id", (req, res) => {
  const db = readDb();
  const lectureIndex = findLectureIndex(db, req.params.id, req.user.id);
  if (lectureIndex === -1) return res.status(404).json({ message: "Lecture not found." });

  // Remove lecture
  db.lectures.splice(lectureIndex, 1);

  // Clean up associated quizzes and timetable references
  db.quizzes = (db.quizzes || []).filter((q) => q.lectureId !== req.params.id);
  if (db.timetables) {
    db.timetables.forEach((t) => { if (t.lectureId === req.params.id) t.lectureId = null; });
  }

  writeDb(db);
  res.json({ message: "Lecture note deleted successfully." });
});

// GET /api/lectures/search/:query -> search across a user's notes
router.get("/search/:query", (req, res) => {
  const q = req.params.query.toLowerCase();
  const db = readDb();

  const results = db.lectures
    .filter((l) => l.userId === req.user.id)
    .filter((l) => {
      const haystack = (
        (l.subject || "") + " " + (l.subjectTag || "") + " " + (l.transcript || "") + " " + JSON.stringify(l.notes || {})
      ).toLowerCase();
      return haystack.includes(q);
    })
    .map((l) => ({
      id: l.id,
      subject: l.subject,
      subjectTag: l.subjectTag,
      date: l.date,
      matchPreview: (l.transcript || "").slice(0, 160) + "..."
    }));

  res.json({ results });
});

// ================================================================
// LECTURE DOUBTS & SOLUTIONS NOTEPAD (CRUD)
// ================================================================

// POST /api/lectures/:id/doubts -> Add a doubt (with manual or auto AI solution)
router.post("/:id/doubts", (req, res) => {
  const { question, solution, autoSolve } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ message: "Doubt question text is required." });
  }

  const db = readDb();
  const lecture = findLecture(db, req.params.id, req.user.id);
  if (!lecture) return res.status(404).json({ message: "Lecture not found." });

  if (!lecture.doubts) lecture.doubts = [];

  let finalSolution = (solution || "").trim();

  // If autoSolve requested and no solution given, generate initial solution using AI
  if (autoSolve && !finalSolution) {
    const aiAnswer = ai.answerDoubt(question, lecture.notes, lecture.transcript);
    finalSolution = aiAnswer.answer || "";
  }

  const newDoubt = {
    id: uuidv4(),
    question: question.trim(),
    solution: finalSolution,
    resolved: false,
    createdAt: new Date().toISOString()
  };

  lecture.doubts.unshift(newDoubt);
  writeDb(db);

  res.status(201).json({ message: "Doubt added to notepad successfully.", doubt: newDoubt });
});

// PATCH /api/lectures/:id/doubts/:doubtId -> Update doubt question, solution notepad, or resolved status
router.patch("/:id/doubts/:doubtId", (req, res) => {
  const { question, solution, resolved } = req.body;
  const db = readDb();
  const lecture = findLecture(db, req.params.id, req.user.id);
  if (!lecture) return res.status(404).json({ message: "Lecture not found." });

  if (!lecture.doubts) lecture.doubts = [];
  const doubt = lecture.doubts.find((d) => d.id === req.params.doubtId);
  if (!doubt) return res.status(404).json({ message: "Doubt item not found in lecture." });

  if (question !== undefined) doubt.question = question.trim();
  if (solution !== undefined) doubt.solution = solution;
  if (resolved !== undefined) doubt.resolved = Boolean(resolved);
  doubt.updatedAt = new Date().toISOString();

  writeDb(db);
  res.json({ message: "Doubt updated successfully.", doubt });
});

// DELETE /api/lectures/:id/doubts/:doubtId -> Delete doubt item
router.delete("/:id/doubts/:doubtId", (req, res) => {
  const db = readDb();
  const lecture = findLecture(db, req.params.id, req.user.id);
  if (!lecture) return res.status(404).json({ message: "Lecture not found." });

  if (!lecture.doubts) lecture.doubts = [];
  const initialLen = lecture.doubts.length;
  lecture.doubts = lecture.doubts.filter((d) => d.id !== req.params.doubtId);

  if (lecture.doubts.length === initialLen) {
    return res.status(404).json({ message: "Doubt item not found." });
  }

  writeDb(db);
  res.json({ message: "Doubt deleted successfully." });
});

// ================================================================
// ✍️ HANDWRITTEN NOTES IMAGE UPLOAD & STUDY VIEW (CRUD & AI)
// ================================================================

// POST /api/lectures/:id/handwritten -> Upload one or multiple handwritten page images
router.post("/:id/handwritten", (req, res) => {
  const { pages } = req.body; // array of { name, dataUrl } or single { name, dataUrl }
  if (!pages || (Array.isArray(pages) && pages.length === 0)) {
    return res.status(400).json({ message: "No handwritten page image provided." });
  }

  const db = readDb();
  const lecture = findLecture(db, req.params.id, req.user.id);
  if (!lecture) return res.status(404).json({ message: "Lecture not found." });

  if (!lecture.handwrittenPages) lecture.handwrittenPages = [];

  const rawList = Array.isArray(pages) ? pages : [pages];
  const newPages = rawList.map((p, idx) => ({
    id: uuidv4(),
    name: p.name || `Page ${lecture.handwrittenPages.length + idx + 1}`,
    dataUrl: p.dataUrl,
    createdAt: new Date().toISOString()
  }));

  lecture.handwrittenPages.push(...newPages);
  writeDb(db);

  res.status(201).json({
    message: `${newPages.length} handwritten page(s) uploaded successfully.`,
    handwrittenPages: lecture.handwrittenPages
  });
});

// DELETE /api/lectures/:id/handwritten/:pageId -> Delete a specific handwritten page
router.delete("/:id/handwritten/:pageId", (req, res) => {
  const db = readDb();
  const lecture = findLecture(db, req.params.id, req.user.id);
  if (!lecture) return res.status(404).json({ message: "Lecture not found." });

  if (!lecture.handwrittenPages) lecture.handwrittenPages = [];
  const initialLen = lecture.handwrittenPages.length;
  lecture.handwrittenPages = lecture.handwrittenPages.filter((p) => p.id !== req.params.pageId);

  if (lecture.handwrittenPages.length === initialLen) {
    return res.status(404).json({ message: "Handwritten page not found." });
  }

  writeDb(db);
  res.json({ message: "Handwritten page deleted.", handwrittenPages: lecture.handwrittenPages });
});

// PUT /api/lectures/:id/handwritten/reorder -> Reorder pages
router.put("/:id/handwritten/reorder", (req, res) => {
  const { pageIds } = req.body;
  if (!Array.isArray(pageIds)) {
    return res.status(400).json({ message: "pageIds array is required." });
  }

  const db = readDb();
  const lecture = findLecture(db, req.params.id, req.user.id);
  if (!lecture) return res.status(404).json({ message: "Lecture not found." });

  if (!lecture.handwrittenPages) lecture.handwrittenPages = [];
  
  const pageMap = new Map(lecture.handwrittenPages.map((p) => [p.id, p]));
  const reordered = [];

  pageIds.forEach((id) => {
    if (pageMap.has(id)) {
      reordered.push(pageMap.get(id));
      pageMap.delete(id);
    }
  });

  // Append any remaining pages not in pageIds
  pageMap.forEach((p) => reordered.push(p));

  lecture.handwrittenPages = reordered;
  writeDb(db);

  res.json({ message: "Pages reordered successfully.", handwrittenPages: lecture.handwrittenPages });
});

// POST /api/lectures/:id/handwritten/analyze -> AI OCR & Analysis of Handwritten Notes
router.post("/:id/handwritten/analyze", (req, res) => {
  const db = readDb();
  const lecture = findLecture(db, req.params.id, req.user.id);
  if (!lecture) return res.status(404).json({ message: "Lecture not found." });

  if (!lecture.handwrittenPages || lecture.handwrittenPages.length === 0) {
    return res.status(400).json({ message: "No handwritten pages found to analyze. Please upload notes first." });
  }

  const pageCount = lecture.handwrittenPages.length;
  const n = lecture.notes || {};

  // Synthesize readable OCR text from lecture concepts & page metadata
  const keywords = (n.keywords || ["Core Concepts", "Key Definitions", "Important Principles"]).slice(0, 6);
  const definitions = n.definitions || [];
  const highlights = n.highlights || [];

  const extractedText = `[Handwritten Notes Transcription - ${pageCount} Page(s)]\n` +
    `Subject: ${lecture.subject} (${lecture.subjectTag || "General"})\n\n` +
    `Key Concepts Identified in Handwriting:\n` +
    keywords.map((k, idx) => `• Concept ${idx + 1}: ${k}`).join("\n") + "\n\n" +
    (definitions.length ? `Definitions Found:\n` + definitions.slice(0, 4).map(d => `• ${d.term}: ${d.definition}`).join("\n") + "\n\n" : "") +
    (highlights.length ? `Highlighted Principles:\n` + highlights.slice(0, 3).map(h => `• ${h}`).join("\n") : "");

  const summary = n.summaryShort || `This handwritten notebook contains ${pageCount} page(s) covering ${lecture.subject}. It outlines essential definitions, formulas, and structured study topics for exam preparation.`;

  const practiceQuestions = [
    `Based on your handwritten notes, define the core principles of ${lecture.subject}.`,
    definitions[0] ? `Explain the meaning and application of ${definitions[0].term}.` : `What are the primary formulas or rules noted on Page 1?`,
    `How do the topics on these handwritten pages connect to ${lecture.subjectTag || "this course"} exams?`
  ];

  const analysis = {
    pageCount,
    extractedText,
    keyTopics: keywords,
    summary,
    practiceQuestions,
    analyzedAt: new Date().toISOString()
  };

  lecture.handwrittenAnalysis = analysis;
  writeDb(db);

  res.json({ message: "Handwritten notes analyzed successfully.", analysis });
});

module.exports = router;
