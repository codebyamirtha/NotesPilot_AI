// ================================================================
// routes/quiz.js - Feature 9: Quiz Generator (MCQ / True-False / Fill in blank)
// ================================================================

const express = require("express");
const { v4: uuidv4 } = require("uuid");

const { readDb, writeDb } = require("../utils/db");
const { verifyToken } = require("../middleware/auth");
const ai = require("../utils/aiEngine");

const router = express.Router();
router.use(verifyToken);

// POST /api/quiz/generate  { lectureId, count }
router.post("/generate", (req, res) => {
  try {
    const { lectureId, count = 10 } = req.body;
    const db = readDb();
    if (!db.quizzes) db.quizzes = [];

    let lecture = db.lectures.find((l) => l.id === lectureId && l.userId === req.user.id);
    if (!lecture) {
      lecture = db.lectures.find((l) => l.id === lectureId);
    }
    if (!lecture) {
      return res.status(404).json({ message: "Lecture not found. Please select a valid lecture." });
    }

    const questions = ai.generateQuiz(
      lecture.notes || {},
      lecture.transcript || "",
      lecture.subject || "Lecture",
      Number(count) || 10
    );

    const quiz = {
      id: uuidv4(),
      userId: req.user.id,
      lectureId,
      subject: lecture.subject || "Lecture",
      questions,
      createdAt: new Date().toISOString()
    };

    db.quizzes.push(quiz);
    writeDb(db);

    res.status(201).json({ quiz });
  } catch (err) {
    console.error("Quiz generation error:", err);
    res.status(500).json({ message: "Failed to generate quiz: " + err.message });
  }
});

// GET /api/quiz/:id (or lectureId)
router.get("/:id", (req, res) => {
  const db = readDb();
  if (!db.quizzes) db.quizzes = [];
  let quiz = db.quizzes.find((q) => q.id === req.params.id && q.userId === req.user.id);
  if (!quiz) {
    quiz = db.quizzes.find((q) => q.id === req.params.id);
  }
  // Check if param is lectureId
  if (!quiz) {
    quiz = db.quizzes.find((q) => q.lectureId === req.params.id);
  }
  if (!quiz) return res.status(404).json({ message: "Quiz not found." });
  res.json({ quiz });
});

// GET /api/quiz/lecture/:lectureId
router.get("/lecture/:lectureId", (req, res) => {
  const db = readDb();
  if (!db.quizzes) db.quizzes = [];
  let quizzes = db.quizzes
    .filter((q) => q.lectureId === req.params.lectureId && (q.userId === req.user.id || !q.userId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  if (quizzes.length === 0) {
    quizzes = db.quizzes
      .filter((q) => q.lectureId === req.params.lectureId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  res.json({ quizzes });
});

// POST /api/quiz/:id/submit  { answers: { questionIndex: answer } }
router.post("/:id/submit", (req, res) => {
  try {
    const db = readDb();
    if (!db.quizzes) db.quizzes = [];
    let quiz = db.quizzes.find((q) => q.id === req.params.id && q.userId === req.user.id);
    if (!quiz) {
      quiz = db.quizzes.find((q) => q.id === req.params.id);
    }
    if (!quiz) return res.status(404).json({ message: "Quiz not found." });

    const answers = req.body.answers || {};
    let correct = 0;
    const results = [];

    quiz.questions.forEach((q, idx) => {
      const given = (answers[idx] !== undefined && answers[idx] !== null)
        ? answers[idx].toString().trim()
        : "";
      const expected = (q.answer || "").toString().trim();

      // Normalize comparison (case-insensitive & whitespace trimmed)
      const cleanGiven = given.toLowerCase().replace(/[^a-z0-9]/g, "");
      const cleanExpected = expected.toLowerCase().replace(/[^a-z0-9]/g, "");

      const isCorrect = cleanGiven.length > 0 && cleanGiven === cleanExpected;
      if (isCorrect) correct++;

      results.push({
        questionIndex: idx,
        questionId: q.id,
        type: q.type,
        question: q.question,
        options: q.options || [],
        userAnswer: given || "(No answer given)",
        correctAnswer: expected,
        isCorrect,
        explanation: q.explanation || `The correct answer is ${expected}.`
      });
    });

    const total = quiz.questions.length;
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;

    const score = {
      total,
      correct,
      percentage
    };

    quiz.lastSubmission = {
      score,
      results,
      submittedAt: new Date().toISOString()
    };
    writeDb(db);

    res.json({ score, results });
  } catch (err) {
    console.error("Quiz submit error:", err);
    res.status(500).json({ message: "Failed to submit quiz: " + err.message });
  }
});

module.exports = router;
