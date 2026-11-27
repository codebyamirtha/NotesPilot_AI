const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const { readDb } = require("../utils/db");
const { verifyToken } = require("../middleware/auth");

const FLASHCARDS_DB = path.join(__dirname, "../data/flashcards_progress.json");

function readFlashcardsProgress() {
  if (!fs.existsSync(FLASHCARDS_DB)) return {};
  try {
    return JSON.parse(fs.readFileSync(FLASHCARDS_DB, "utf-8"));
  } catch {
    return {};
  }
}

function saveFlashcardsProgress(data) {
  const dir = path.dirname(FLASHCARDS_DB);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FLASHCARDS_DB, JSON.stringify(data, null, 2));
}

// Helper to extract cards from a lecture object
function generateCardsFromLecture(lecture) {
  const cards = [];
  const notes = lecture.notes || {};
  let cardIndex = 1;

  // 1. Definition Cards
  if (notes.definitions && Array.isArray(notes.definitions)) {
    notes.definitions.forEach((d) => {
      cards.push({
        id: `card_${lecture.id}_def_${cardIndex++}`,
        type: "definition",
        tag: "📌 Definition",
        front: `What is the definition of **${d.term}**?`,
        back: d.definition,
        hint: `Key term from ${lecture.subject || "Lecture"}`
      });
    });
  }

  // 2. Formula Cards
  if (notes.formulas && Array.isArray(notes.formulas)) {
    notes.formulas.forEach((f) => {
      const parts = f.split("=");
      const prompt = parts.length > 1 ? `What is the equation for **${parts[0].trim()}**?` : `State the key formula:`;
      cards.push({
        id: `card_${lecture.id}_form_${cardIndex++}`,
        type: "formula",
        tag: "➗ Formula",
        front: prompt,
        back: f,
        hint: "Mathematical / Computational Expression"
      });
    });
  }

  // 3. Mnemonic Cards
  if (notes.mnemonics && Array.isArray(notes.mnemonics)) {
    notes.mnemonics.forEach((m) => {
      cards.push({
        id: `card_${lecture.id}_mne_${cardIndex++}`,
        type: "mnemonic",
        tag: "🧠 Memory Hook",
        front: `What does the acronym **${m.acronym}** stand for?`,
        back: `**${m.phrase}**\n\n💡 Tip: ${m.tip}`,
        hint: `Mnemonic phrase for ${lecture.subject}`
      });
    });
  }

  // 4. Highlight Concept Cards
  if (notes.highlights && Array.isArray(notes.highlights)) {
    notes.highlights.slice(0, 5).forEach((h) => {
      cards.push({
        id: `card_${lecture.id}_high_${cardIndex++}`,
        type: "concept",
        tag: "⭐ Key Concept",
        front: `Explain the key concept: "${h.slice(0, 60)}..."`,
        back: h,
        hint: "Exam highlight"
      });
    });
  }

  // 5. Practical Example Cards
  if (notes.examples && Array.isArray(notes.examples)) {
    notes.examples.slice(0, 4).forEach((ex) => {
      cards.push({
        id: `card_${lecture.id}_ex_${cardIndex++}`,
        type: "example",
        tag: "💡 Example",
        front: `Give a practical example of the concept discussed in **${lecture.subject || "this lecture"}**:`,
        back: ex,
        hint: "Real-world application"
      });
    });
  }

  // Fallback card if empty
  if (cards.length === 0) {
    cards.push({
      id: `card_${lecture.id}_summary`,
      type: "summary",
      tag: "📝 Summary",
      front: `What was the core summary of **${lecture.subject || "this lecture"}**?`,
      back: notes.summaryShort || "Core lecture concepts and structured notes.",
      hint: "Lecture takeaway"
    });
  }

  return cards;
}

// GET /api/flashcards/deck/:lectureId - Get deck for specific lecture
router.get("/deck/:lectureId", verifyToken, (req, res) => {
  const db = readDb();
  let lecture = (db.lectures || []).find((l) => l.id === req.params.lectureId && l.userId === req.user.id);
  if (!lecture) {
    lecture = (db.lectures || []).find((l) => l.id === req.params.lectureId);
  }

  if (!lecture) {
    return res.status(404).json({ error: "Lecture not found" });
  }

  const cards = generateCardsFromLecture(lecture);
  const progressDb = readFlashcardsProgress();
  const userProgress = progressDb[req.user.id] || {};

  // Attach user SRS state to each card
  const cardsWithState = cards.map((c) => {
    const state = userProgress[c.id] || {
      box: 1,
      reviews: 0,
      nextReviewDate: null,
      lastReviewed: null,
      mastery: 0
    };
    return { ...c, ...state };
  });

  return res.json({
    lectureId: lecture.id,
    subject: lecture.subject,
    teacher: lecture.teacher,
    date: lecture.date,
    totalCards: cardsWithState.length,
    cards: cardsWithState
  });
});

// GET /api/flashcards/all - Get all decks for user
router.get("/all", verifyToken, (req, res) => {
  const db = readDb();
  let lectures = (db.lectures || []).filter((l) => l.userId === req.user.id);
  if (lectures.length === 0) {
    lectures = db.lectures || [];
  }
  const progressDb = readFlashcardsProgress();
  const userProgress = progressDb[req.user.id] || {};

  const decks = lectures.map((lecture) => {
    const cards = generateCardsFromLecture(lecture);
    let masteredCount = 0;
    let dueCount = 0;
    const now = new Date();

    cards.forEach((c) => {
      const state = userProgress[c.id];
      if (state) {
        if (state.box >= 4) masteredCount++;
        if (!state.nextReviewDate || new Date(state.nextReviewDate) <= now) {
          dueCount++;
        }
      } else {
        dueCount++; // New unreviewed card
      }
    });

    return {
      lectureId: lecture.id,
      subject: lecture.subject,
      teacher: lecture.teacher,
      date: lecture.date,
      totalCards: cards.length,
      masteredCount,
      dueCount,
      masteryPercent: cards.length > 0 ? Math.round((masteredCount / cards.length) * 100) : 0
    };
  });

  return res.json({ decks });
});

// POST /api/flashcards/review - Submit card rating (1: Again, 2: Hard, 3: Good, 4: Easy)
router.post("/review", verifyToken, (req, res) => {
  const { cardId, rating } = req.body;
  if (!cardId || typeof rating !== "number") {
    return res.status(400).json({ error: "Missing cardId or rating (1-4)" });
  }

  const progressDb = readFlashcardsProgress();
  if (!progressDb[req.user.id]) progressDb[req.user.id] = {};

  const current = progressDb[req.user.id][cardId] || {
    box: 1,
    reviews: 0,
    nextReviewDate: null,
    lastReviewed: null,
    mastery: 0
  };

  let nextBox = current.box;
  let intervalMinutes = 1;

  if (rating === 1) {
    // Again: reset to Box 1
    nextBox = 1;
    intervalMinutes = 1;
  } else if (rating === 2) {
    // Hard: keep same box or Box 1
    nextBox = Math.max(1, current.box);
    intervalMinutes = 10;
  } else if (rating === 3) {
    // Good: advance 1 box
    nextBox = Math.min(5, current.box + 1);
    const intervals = [1, 10, 1440, 4320, 10080]; // 1m, 10m, 1d, 3d, 7d
    intervalMinutes = intervals[nextBox - 1] || 1440;
  } else if (rating === 4) {
    // Easy: advance 2 boxes
    nextBox = Math.min(5, current.box + 2);
    const intervals = [1, 10, 1440, 5760, 20160]; // 1m, 10m, 1d, 4d, 14d
    intervalMinutes = intervals[nextBox - 1] || 5760;
  }

  const nextDate = new Date(Date.now() + intervalMinutes * 60 * 1000).toISOString();
  const mastery = Math.round((nextBox / 5) * 100);

  const updated = {
    box: nextBox,
    reviews: (current.reviews || 0) + 1,
    lastReviewed: new Date().toISOString(),
    nextReviewDate: nextDate,
    mastery
  };

  progressDb[req.user.id][cardId] = updated;
  saveFlashcardsProgress(progressDb);

  return res.json({ success: true, cardId, updated });
});

module.exports = router;
