// ================================================================
// routes/stats.js - Feature 16: Dashboard / Learning Analytics
// ================================================================

const express = require("express");
const { readDb } = require("../utils/db");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();
router.use(verifyToken);

// GET /api/stats -> summary numbers for the dashboard
router.get("/", (req, res) => {
  const db = readDb();
  const userId = req.user.id;
  let lectures = (db.lectures || []).filter((l) => l.userId === userId);
  if (lectures.length === 0) {
    lectures = db.lectures || [];
  }
  const quizzes = (db.quizzes || []).filter((q) => q.userId === userId);
  const studySessions = (db.timetables || []).filter((t) => t.userId === userId);

  // Rough "study minutes" estimate: ~1 minute of lecture per 130 transcript words
  const totalWords = lectures.reduce(
    (sum, l) => sum + ((l && l.transcript) || "").split(/\s+/).filter(Boolean).length,
    0
  );
  const estimatedMinutes = Math.round(totalWords / 130);

  // Most frequent keywords across all lectures = "strong/weak topic" signal
  const keywordFreq = {};
  lectures.forEach((l) => {
    ((l && l.notes && l.notes.keywords) || []).forEach((k) => {
      keywordFreq[k] = (keywordFreq[k] || 0) + 1;
    });
  });
  const topTopics = Object.entries(keywordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([topic, count]) => ({ topic, count }));

  // Calculate doubt resolution stats across all lectures
  let totalDoubts = 0;
  let pendingDoubts = 0;
  let resolvedDoubts = 0;

  lectures.forEach((l) => {
    (l.doubts || []).forEach((d) => {
      totalDoubts++;
      if (d.resolved) resolvedDoubts++;
      else pendingDoubts++;
    });
  });

  // Attendance Analytics
  const attendanceRecords = (db.attendance || []).filter((r) => r.userId === userId);
  let totalAttendanceClasses = attendanceRecords.length;
  let presentAttendance = 0;
  let lateAttendance = 0;
  let partialAttendance = 0;
  let absentAttendance = 0;
  let attendanceMinutes = 0;

  const subjectAttendanceMap = {};

  attendanceRecords.forEach((r) => {
    const st = r.status || "present";
    if (st === "present") presentAttendance++;
    else if (st === "late") lateAttendance++;
    else if (st === "partial") partialAttendance++;
    else if (st === "absent") absentAttendance++;

    attendanceMinutes += (r.durationMinutes || 0);

    const sub = r.subject || "General";
    if (!subjectAttendanceMap[sub]) {
      subjectAttendanceMap[sub] = { total: 0, attended: 0 };
    }
    subjectAttendanceMap[sub].total++;
    if (st === "present" || st === "late") subjectAttendanceMap[sub].attended += 1;
    else if (st === "partial") subjectAttendanceMap[sub].attended += 0.5;
  });

  const effectiveAttended = presentAttendance + lateAttendance + (partialAttendance * 0.5);
  const attendancePercentage = totalAttendanceClasses > 0 ? Math.round((effectiveAttended / totalAttendanceClasses) * 100) : 100;
  const totalLearningHours = parseFloat(((estimatedMinutes + attendanceMinutes) / 60).toFixed(1));
  const isLowAttendance = totalAttendanceClasses > 0 && attendancePercentage < 75;

  const lowAttendanceSubjects = Object.keys(subjectAttendanceMap)
    .filter((sub) => {
      const s = subjectAttendanceMap[sub];
      return s.total > 0 && Math.round((s.attended / s.total) * 100) < 75;
    })
    .map((sub) => ({
      subject: sub,
      percentage: Math.round((subjectAttendanceMap[sub].attended / subjectAttendanceMap[sub].total) * 100)
    }));

  res.json({
    lecturesCompleted: lectures.length,
    estimatedStudyMinutes: estimatedMinutes,
    quizzesTaken: quizzes.length,
    studySessionsScheduled: studySessions.length,
    totalDoubts,
    pendingDoubts,
    resolvedDoubts,
    topTopics,
    attendance: {
      percentage: attendancePercentage,
      totalClasses: totalAttendanceClasses,
      attendedClasses: effectiveAttended,
      learningHours: totalLearningHours,
      isLow: isLowAttendance,
      lowSubjects: lowAttendanceSubjects
    }
  });
});

module.exports = router;
