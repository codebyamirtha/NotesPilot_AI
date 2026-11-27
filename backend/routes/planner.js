// ================================================================
// routes/planner.js
// Feature: AI Study Planner & Visual Weekly Timetable Generator
// ================================================================

const express = require("express");
const { v4: uuidv4 } = require("uuid");

const { readDb, writeDb } = require("../utils/db");
const { verifyToken } = require("../middleware/auth");
const ai = require("../utils/aiEngine");

const router = express.Router();
router.use(verifyToken);

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

function calculateDurationHours(start, end) {
  if (!start || !end) return 1;
  const [sH, sM] = start.split(":").map(Number);
  const [eH, eM] = end.split(":").map(Number);
  const diff = (eH * 60 + eM) - (sH * 60 + sM);
  return diff > 0 ? parseFloat((diff / 60).toFixed(1)) : 1;
}

// ----------------------------------------------------------------
// TIMETABLE ENDPOINTS
// ----------------------------------------------------------------

// GET /api/planner/timetable -> get user's visual weekly timetable & stats
router.get("/timetable", (req, res) => {
  const db = readDb();
  const timetable = (db.timetables || []).filter((t) => t.userId === req.user.id);
  let userLectures = (db.lectures || []).filter((l) => l.userId === req.user.id);
  if (userLectures.length === 0) {
    userLectures = db.lectures || [];
  }

  // Extract distinct subjects from lectures & timetable
  const subjectSet = new Set();
  userLectures.forEach((l) => { if (l.subject) subjectSet.add(l.subject.trim()); });
  timetable.forEach((t) => { if (t.subject) subjectSet.add(t.subject.trim()); });

  const subjectList = Array.from(subjectSet);
  const subjectColorMap = {};
  subjectList.forEach((sub, idx) => {
    subjectColorMap[sub] = PRESET_COLORS[idx % PRESET_COLORS.length];
  });

  // Calculate statistics
  let totalHours = 0;
  let completedHours = 0;
  const subjectHours = {};

  timetable.forEach((slot) => {
    const dur = calculateDurationHours(slot.startTime, slot.endTime);
    totalHours += dur;
    if (slot.completed) completedHours += dur;
    subjectHours[slot.subject] = (subjectHours[slot.subject] || 0) + dur;
  });

  const subjectBreakdown = Object.keys(subjectHours).map((sub) => ({
    subject: sub,
    hours: parseFloat(subjectHours[sub].toFixed(1)),
    percentage: totalHours > 0 ? Math.round((subjectHours[sub] / totalHours) * 100) : 0,
    color: subjectColorMap[sub] || PRESET_COLORS[0]
  }));

  res.json({
    timetable,
    subjects: subjectList.map((s) => ({ name: s, color: subjectColorMap[s] })),
    lectures: userLectures.map((l) => ({ id: l.id, subject: l.subject, teacher: l.teacher })),
    stats: {
      totalSessions: timetable.length,
      totalHours: parseFloat(totalHours.toFixed(1)),
      completedHours: parseFloat(completedHours.toFixed(1)),
      completedPercentage: totalHours > 0 ? Math.round((completedHours / totalHours) * 100) : 0,
      subjectBreakdown
    }
  });
});

// POST /api/planner/timetable -> create a new timetable slot
router.post("/timetable", (req, res) => {
  const { day, startTime, endTime, subject, topic, color, lectureId, notes } = req.body;

  if (!day || !startTime || !endTime || !subject) {
    return res.status(400).json({ message: "Day, start time, end time, and subject are required." });
  }

  const db = readDb();
  if (!db.timetables) db.timetables = [];

  const existingSubjectSlots = db.timetables.filter(
    (t) => t.userId === req.user.id && t.subject && t.subject.toLowerCase() === subject.trim().toLowerCase()
  );
  const assignedColor = color || (existingSubjectSlots[0] ? existingSubjectSlots[0].color : PRESET_COLORS[db.timetables.length % PRESET_COLORS.length]);

  const newSlot = {
    id: uuidv4(),
    userId: req.user.id,
    day: day.toLowerCase(),
    startTime,
    endTime,
    subject: subject.trim(),
    topic: topic ? topic.trim() : "",
    color: assignedColor,
    lectureId: lectureId || null,
    notes: notes ? notes.trim() : "",
    completed: false,
    createdAt: new Date().toISOString()
  };

  db.timetables.push(newSlot);
  writeDb(db);

  res.status(201).json({ message: "Study session added to timetable.", slot: newSlot });
});

// PUT /api/planner/timetable/:id -> update a timetable slot
router.put("/timetable/:id", (req, res) => {
  const { id } = req.params;
  const { day, startTime, endTime, subject, topic, color, lectureId, notes, completed } = req.body;

  const db = readDb();
  if (!db.timetables) db.timetables = [];

  const slotIndex = db.timetables.findIndex((t) => t.id === id && t.userId === req.user.id);
  if (slotIndex === -1) {
    return res.status(404).json({ message: "Timetable session not found." });
  }

  const slot = db.timetables[slotIndex];
  if (day !== undefined) slot.day = day.toLowerCase();
  if (startTime !== undefined) slot.startTime = startTime;
  if (endTime !== undefined) slot.endTime = endTime;
  if (subject !== undefined) slot.subject = subject.trim();
  if (topic !== undefined) slot.topic = topic.trim();
  if (color !== undefined) slot.color = color;
  if (lectureId !== undefined) slot.lectureId = lectureId;
  if (notes !== undefined) slot.notes = notes.trim();
  if (completed !== undefined) slot.completed = Boolean(completed);

  writeDb(db);
  res.json({ message: "Study session updated.", slot });
});

// PATCH /api/planner/timetable/:id/toggle -> quick toggle session completion
router.patch("/timetable/:id/toggle", (req, res) => {
  const { id } = req.params;
  const db = readDb();
  if (!db.timetables) db.timetables = [];

  const slot = db.timetables.find((t) => t.id === id && t.userId === req.user.id);
  if (!slot) {
    return res.status(404).json({ message: "Timetable session not found." });
  }

  slot.completed = req.body.completed !== undefined ? Boolean(req.body.completed) : !slot.completed;
  writeDb(db);

  res.json({ message: "Session completion toggled.", slot });
});

// DELETE /api/planner/timetable/:id -> delete a single timetable session
router.delete("/timetable/:id", (req, res) => {
  const { id } = req.params;
  const db = readDb();
  if (!db.timetables) db.timetables = [];

  const initialLen = db.timetables.length;
  db.timetables = db.timetables.filter((t) => !(t.id === id && t.userId === req.user.id));

  if (db.timetables.length === initialLen) {
    return res.status(404).json({ message: "Timetable session not found." });
  }

  writeDb(db);
  res.json({ message: "Session deleted from timetable." });
});

// DELETE /api/planner/timetable/clear -> remove all timetable slots for user
router.delete("/timetable/clear/all", (req, res) => {
  const db = readDb();
  if (!db.timetables) db.timetables = [];

  db.timetables = db.timetables.filter((t) => t.userId !== req.user.id);
  writeDb(db);

  res.json({ message: "Timetable cleared successfully." });
});

// POST /api/planner/timetable/auto-generate -> intelligently populate weekly timetable from existing subjects
router.post("/timetable/auto-generate", (req, res) => {
  const db = readDb();
  if (!db.timetables) db.timetables = [];

  let userLectures = (db.lectures || []).filter((l) => l.userId === req.user.id);
  if (userLectures.length === 0) {
    userLectures = db.lectures || [];
  }

  let subjects = [];
  if (userLectures.length > 0) {
    const map = new Map();
    userLectures.forEach((l) => {
      const sub = l.subject ? l.subject.trim() : "General Studies";
      if (!map.has(sub)) {
        map.set(sub, { subject: sub, lectureId: l.id, topics: (l.notes && l.notes.keywords) || [] });
      }
    });
    subjects = Array.from(map.values());
  } else {
    subjects = [
      { subject: "Data Structures & Algorithms", topics: ["Trees & Graphs", "Dynamic Programming", "Sorting"] },
      { subject: "Operating Systems", topics: ["Process Scheduling", "Virtual Memory", "Deadlocks"] },
      { subject: "Database Systems", topics: ["SQL Queries", "Normalization", "Indexing"] },
      { subject: "Computer Networks", topics: ["TCP/IP Model", "Routing Algorithms", "HTTP Protocols"] }
    ];
  }

  // Define ideal standard daily time blocks across the week
  const scheduleTemplate = [
    { day: "monday", startTime: "09:00", endTime: "10:30" },
    { day: "monday", startTime: "16:00", endTime: "17:30" },
    { day: "tuesday", startTime: "10:00", endTime: "11:30" },
    { day: "tuesday", startTime: "15:00", endTime: "16:30" },
    { day: "wednesday", startTime: "09:00", endTime: "10:30" },
    { day: "wednesday", startTime: "17:00", endTime: "18:30" },
    { day: "thursday", startTime: "11:00", endTime: "12:30" },
    { day: "thursday", startTime: "16:00", endTime: "17:30" },
    { day: "friday", startTime: "09:30", endTime: "11:00" },
    { day: "friday", startTime: "14:30", endTime: "16:00" },
    { day: "saturday", startTime: "10:00", endTime: "12:00" },
    { day: "sunday", startTime: "17:00", endTime: "19:00" }
  ];

  // Clear previous timetable for clean auto-generation
  db.timetables = db.timetables.filter((t) => t.userId !== req.user.id);

  const newSlots = scheduleTemplate.map((slot, index) => {
    const subObj = subjects[index % subjects.length];
    const color = PRESET_COLORS[(index % subjects.length) % PRESET_COLORS.length];
    const topic = subObj.topics && subObj.topics.length > 0 
      ? `Deep Review: ${subObj.topics[index % subObj.topics.length]}`
      : "Lecture Review & Practice Problems";

    return {
      id: uuidv4(),
      userId: req.user.id,
      day: slot.day,
      startTime: slot.startTime,
      endTime: slot.endTime,
      subject: subObj.subject,
      topic,
      color,
      lectureId: subObj.lectureId || null,
      notes: "Auto-scheduled study block for continuous learning.",
      completed: false,
      createdAt: new Date().toISOString()
    };
  });

  db.timetables.push(...newSlots);
  writeDb(db);

  res.status(201).json({
    message: "Weekly timetable auto-generated successfully!",
    timetable: newSlots
  });
});

// ----------------------------------------------------------------
// AI EXAM SPRINT PLANNER ENDPOINTS
// ----------------------------------------------------------------

// GET /api/planner -> get active study plan for user
router.get("/", (req, res) => {
  const db = readDb();
  const userPlans = (db.planners || [])
    .filter((p) => p.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const activePlan = userPlans[0] || null;
  res.json({ plan: activePlan });
});

// POST /api/planner/generate -> create/generate new study plan
router.post("/generate", (req, res) => {
  const { targetDate, hoursPerDay } = req.body;

  if (!targetDate) {
    return res.status(400).json({ message: "Exam target date is required." });
  }

  const db = readDb();
  let userLectures = db.lectures.filter((l) => l.userId === req.user.id);
  if (userLectures.length === 0) {
    userLectures = db.lectures || [];
  }

  const planDetails = ai.generateStudyPlan(userLectures, targetDate, hoursPerDay);

  const newPlan = {
    id: uuidv4(),
    userId: req.user.id,
    createdAt: new Date().toISOString(),
    ...planDetails
  };

  db.planners = (db.planners || []).filter((p) => p.userId !== req.user.id);
  db.planners.push(newPlan);
  writeDb(db);

  res.status(201).json({ message: "Study plan generated successfully.", plan: newPlan });
});

// PATCH /api/planner/tasks/:taskId -> toggle task completed status
router.patch("/tasks/:taskId", (req, res) => {
  const { taskId } = req.params;
  const { completed } = req.body;

  const db = readDb();
  const plan = (db.planners || []).find((p) => p.userId === req.user.id);

  if (!plan) {
    return res.status(404).json({ message: "No active study plan found." });
  }

  let foundTask = null;
  (plan.days || []).forEach((day) => {
    (day.tasks || []).forEach((task) => {
      if (task.id === taskId) {
        task.completed = typeof completed === "boolean" ? completed : !task.completed;
        foundTask = task;
      }
    });
  });

  if (!foundTask) {
    return res.status(404).json({ message: "Task not found." });
  }

  writeDb(db);
  res.json({ message: "Task status updated.", task: foundTask, plan });
});

module.exports = router;
