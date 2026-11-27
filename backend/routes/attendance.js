// ================================================================
// routes/attendance.js - Feature: Smart Attendance Management System
// Automatic Check-in/out, Subject-wise Analytics, Calendar,
// QR Sessions, Low Attendance Alerts, Projection Calculator & Teacher View
// ================================================================

const express = require("express");
const { v4: uuidv4 } = require("uuid");

const { readDb, writeDb } = require("../utils/db");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();
router.use(verifyToken);

// Standard day names
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Helper: Format date string YYYY-MM-DD
function getLocalDateString(dateObj = new Date()) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Helper: Calculate duration between two ISO timestamp strings
function calculateDuration(checkInIso, checkOutIso) {
  if (!checkInIso || !checkOutIso) return { minutes: 0, hours: 0 };
  const inMs = new Date(checkInIso).getTime();
  const outMs = new Date(checkOutIso).getTime();
  const diffMs = Math.max(0, outMs - inMs);
  const minutes = Math.round(diffMs / 60000);
  const hours = parseFloat((minutes / 60).toFixed(2));
  return { minutes, hours };
}

// Helper: Determine attendance status based on scheduled vs actual check-in & duration
function evaluateStatus(checkInIso, scheduledStartTime, durationMinutes, scheduledDurationMinutes = 60) {
  if (!checkInIso) return "absent";

  const checkInDate = new Date(checkInIso);
  let isLate = false;

  if (scheduledStartTime) {
    const [schedH, schedM] = scheduledStartTime.split(":").map(Number);
    const schedDate = new Date(checkInDate);
    schedDate.setHours(schedH, schedM, 0, 0);

    // If student joins > 10 minutes after scheduled class start
    const lateThresholdMs = 10 * 60 * 1000;
    if (checkInDate.getTime() - schedDate.getTime() > lateThresholdMs) {
      isLate = true;
    }
  }

  // If attended less than 50% of expected class time (and class has ended/checked out)
  if (scheduledDurationMinutes > 0 && durationMinutes > 0) {
    if (durationMinutes < scheduledDurationMinutes * 0.5) {
      return "partial";
    }
  }

  return isLate ? "late" : "present";
}

// ----------------------------------------------------------------
// 1. STUDENT CHECK-IN
// POST /api/attendance/check-in
// ----------------------------------------------------------------
router.post("/check-in", (req, res) => {
  try {
    const {
      subject,
      subjectTag,
      teacher,
      sessionId,
      sessionCode,
      lectureId,
      scheduledStartTime,
      scheduledDurationMinutes,
      method // "auto" | "qr" | "code" | "manual"
    } = req.body;

    const db = readDb();
    const userId = req.user.id;
    const now = new Date();
    const dateStr = getLocalDateString(now);
    const dayOfWeek = DAYS[now.getDay()];

    let finalSubject = subject ? subject.trim() : "General";
    let finalTeacher = teacher ? teacher.trim() : "Class Instructor";
    let finalTag = subjectTag ? subjectTag.trim() : finalSubject;
    let targetSession = null;

    // If sessionCode or sessionId provided, lookup active teacher session
    if (sessionCode || sessionId) {
      targetSession = (db.attendanceSessions || []).find((s) => {
        if (sessionId && s.id === sessionId) return true;
        if (sessionCode && s.code && s.code.toUpperCase() === sessionCode.trim().toUpperCase()) return true;
        return false;
      });

      if (targetSession) {
        finalSubject = targetSession.subject || finalSubject;
        finalTeacher = targetSession.teacherName || targetSession.teacher || finalTeacher;
        finalTag = targetSession.subjectTag || finalTag;
      }
    }

    // 🔒 DUPLICATE PREVENTION:
    // Check if student is already checked in for this session or subject on the same date
    const existing = (db.attendance || []).find((rec) => {
      if (rec.userId !== userId) return false;
      if (rec.date !== dateStr) return false;

      // Duplicate match on sessionId
      if (targetSession && rec.sessionId === targetSession.id) return true;
      if (sessionId && rec.sessionId === sessionId) return true;

      // Duplicate match on lectureId
      if (lectureId && rec.lectureId === lectureId) return true;

      // Duplicate match on subject & close timeframe (within same class slot)
      if (rec.subject && rec.subject.toLowerCase() === finalSubject.toLowerCase() && !rec.checkOutTime) {
        const elapsedMinutes = (now.getTime() - new Date(rec.checkInTime).getTime()) / 60000;
        if (elapsedMinutes > 180) {
          rec.checkOutTime = new Date(new Date(rec.checkInTime).getTime() + 60 * 60000).toISOString();
          rec.durationMinutes = 60;
          rec.durationHours = 1;
          return false;
        }
        return true;
      }
      return false;
    });

    if (existing) {
      return res.status(200).json({
        message: `Already checked in for ${existing.subject} at ${new Date(existing.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
        isDuplicate: true,
        record: existing
      });
    }

    // Calculate initial status
    const initialStatus = evaluateStatus(
      now.toISOString(),
      scheduledStartTime || (targetSession ? targetSession.startTime : null),
      0,
      scheduledDurationMinutes || (targetSession ? targetSession.durationMinutes : 60)
    );

    const newRecord = {
      id: uuidv4(),
      userId,
      userName: req.user.name || "Student",
      userEmail: req.user.email || "",
      sessionId: targetSession ? targetSession.id : (sessionId || null),
      sessionCode: targetSession ? targetSession.code : (sessionCode || null),
      lectureId: lectureId || null,
      subject: finalSubject,
      subjectTag: finalTag,
      teacher: finalTeacher,
      date: dateStr,
      dayOfWeek,
      checkInTime: now.toISOString(),
      checkOutTime: null,
      durationMinutes: 0,
      durationHours: 0,
      scheduledDurationMinutes: scheduledDurationMinutes || (targetSession ? targetSession.durationMinutes : 60),
      status: initialStatus, // "present" | "late" | "partial" | "absent"
      method: method || "manual",
      notesAvailable: Boolean(lectureId),
      quizTaken: false,
      remarks: initialStatus === "late" ? "Arrived after class started" : "Checked in on time",
      createdAt: now.toISOString()
    };

    db.attendance.push(newRecord);
    writeDb(db);

    res.status(201).json({
      message: `Checked in successfully for ${finalSubject}!`,
      isDuplicate: false,
      record: newRecord
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to mark check-in.", error: err.message });
  }
});

// ----------------------------------------------------------------
// 2. STUDENT CHECK-OUT
// POST /api/attendance/check-out
// ----------------------------------------------------------------
router.post("/check-out", (req, res) => {
  try {
    const { attendanceId, recordId, lectureId, sessionId } = req.body;
    const targetId = attendanceId || recordId;
    const db = readDb();
    const userId = req.user.id;
    const now = new Date();

    let record = null;
    if (targetId) {
      record = (db.attendance || []).find((r) => r.id === targetId && r.userId === userId);
    } else if (lectureId) {
      record = (db.attendance || []).find((r) => r.lectureId === lectureId && r.userId === userId);
    } else if (sessionId) {
      record = (db.attendance || []).find((r) => r.sessionId === sessionId && r.userId === userId && !r.checkOutTime);
    } else {
      // Find most recent unclosed check-in for current user
      record = (db.attendance || [])
        .filter((r) => r.userId === userId && !r.checkOutTime)
        .sort((a, b) => new Date(b.checkInTime) - new Date(a.checkInTime))[0];
    }

    if (!record) {
      return res.status(404).json({ message: "No active check-in record found to check out from." });
    }

    record.checkOutTime = now.toISOString();
    const dur = calculateDuration(record.checkInTime, record.checkOutTime);
    record.durationMinutes = dur.minutes;
    record.durationHours = dur.hours;

    // Check if partial (e.g. attended < 50% of expected duration)
    const expectedMinutes = record.scheduledDurationMinutes || 60;
    if (dur.minutes < expectedMinutes * 0.5 && record.status !== "absent") {
      record.status = "partial";
      record.remarks = `Partial attendance (${dur.minutes}m / ${expectedMinutes}m attended)`;
    }

    writeDb(db);

    res.json({
      message: `Checked out successfully. Attended ${dur.minutes} mins (${dur.hours} hrs).`,
      record
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to check out.", error: err.message });
  }
});

// ----------------------------------------------------------------
// 3. AUTO-RECORD ATTENDANCE WITH LECTURE
// POST /api/attendance/auto-record
// (Invoked when starting / finishing lecture recordings in record.html)
// ----------------------------------------------------------------
router.post("/auto-record", (req, res) => {
  try {
    const {
      lectureId,
      subject,
      subjectTag,
      teacher,
      durationMinutes,
      checkInTime,
      checkOutTime
    } = req.body;

    const db = readDb();
    const userId = req.user.id;
    const now = new Date();
    const dateStr = getLocalDateString(now);
    const dayOfWeek = DAYS[now.getDay()];

    const inIso = checkInTime || new Date(now.getTime() - (durationMinutes || 45) * 60000).toISOString();
    const outIso = checkOutTime || now.toISOString();
    const dur = calculateDuration(inIso, outIso);
    const finalMinutes = durationMinutes || dur.minutes || 45;
    const finalHours = parseFloat((finalMinutes / 60).toFixed(2));

    // Check if duplicate for this lectureId
    const existingIndex = (db.attendance || []).findIndex((r) => r.lectureId && r.lectureId === lectureId && r.userId === userId);

    const recordData = {
      id: existingIndex >= 0 ? db.attendance[existingIndex].id : uuidv4(),
      userId,
      userName: req.user.name || "Student",
      userEmail: req.user.email || "",
      lectureId: lectureId || null,
      sessionId: null,
      sessionCode: null,
      subject: subject || "General",
      subjectTag: subjectTag || subject || "General",
      teacher: teacher || "Instructor",
      date: dateStr,
      dayOfWeek,
      checkInTime: inIso,
      checkOutTime: outIso,
      durationMinutes: finalMinutes,
      durationHours: finalHours,
      scheduledDurationMinutes: 60,
      status: finalMinutes >= 30 ? "present" : "partial",
      method: "auto",
      notesAvailable: true,
      quizTaken: false,
      remarks: "Automatically recorded from live lecture session",
      createdAt: now.toISOString()
    };

    if (existingIndex >= 0) {
      db.attendance[existingIndex] = { ...db.attendance[existingIndex], ...recordData };
    } else {
      db.attendance.push(recordData);
    }

    writeDb(db);
    res.json({ message: "Attendance synced with lecture.", record: recordData });
  } catch (err) {
    res.status(500).json({ message: "Auto-record failed.", error: err.message });
  }
});

// ----------------------------------------------------------------
// 4. ATTENDANCE SUMMARY & PROJECTION STATS
// GET /api/attendance/summary and GET /api/attendance/analytics
// ----------------------------------------------------------------
const handleAttendanceSummary = (req, res) => {
  try {
    const db = readDb();
    const userId = req.user.id;
    const records = (db.attendance || []).filter((r) => r.userId === userId);

    let totalClasses = records.length;
    let presentCount = 0;
    let lateCount = 0;
    let partialCount = 0;
    let absentCount = 0;
    let totalMinutes = 0;

    const subjectStats = {};
    const monthlyStats = {};

    records.forEach((r) => {
      const status = r.status || "present";
      if (status === "present") presentCount++;
      else if (status === "late") lateCount++;
      else if (status === "partial") partialCount++;
      else if (status === "absent") absentCount++;

      totalMinutes += (r.durationMinutes || 0);

      // Subject breakdown
      const sub = r.subject || "General";
      if (!subjectStats[sub]) {
        subjectStats[sub] = {
          subject: sub,
          subjectTag: r.subjectTag || sub,
          total: 0,
          attended: 0,
          present: 0,
          late: 0,
          partial: 0,
          absent: 0,
          minutes: 0,
          hours: 0,
          percentage: 0
        };
      }
      subjectStats[sub].total++;
      subjectStats[sub].minutes += (r.durationMinutes || 0);

      if (status === "present") {
        subjectStats[sub].present++;
        subjectStats[sub].attended += 1;
      } else if (status === "late") {
        subjectStats[sub].late++;
        subjectStats[sub].attended += 1; // late counts as attended
      } else if (status === "partial") {
        subjectStats[sub].partial++;
        subjectStats[sub].attended += 0.5; // partial gives 0.5 weight
      } else if (status === "absent") {
        subjectStats[sub].absent++;
      }

      // Monthly breakdown (YYYY-MM)
      const monthKey = (r.date || "").substring(0, 7) || getLocalDateString().substring(0, 7);
      if (!monthlyStats[monthKey]) {
        monthlyStats[monthKey] = {
          monthKey,
          total: 0,
          attended: 0,
          minutes: 0,
          hours: 0,
          percentage: 0
        };
      }
      monthlyStats[monthKey].total++;
      monthlyStats[monthKey].minutes += (r.durationMinutes || 0);
      if (status === "present" || status === "late") {
        monthlyStats[monthKey].attended += 1;
      } else if (status === "partial") {
        monthlyStats[monthKey].attended += 0.5;
      }
    });

    // Effective attended count (Present = 1, Late = 1, Partial = 0.5)
    const effectiveAttended = presentCount + lateCount + (partialCount * 0.5);
    const overallPercentage = totalClasses > 0 ? Math.round((effectiveAttended / totalClasses) * 100) : 100;
    const totalHours = parseFloat((totalMinutes / 60).toFixed(1));

    // Calculate subject-level percentages
    const subjectList = Object.values(subjectStats).map((s) => {
      s.hours = parseFloat((s.minutes / 60).toFixed(1));
      s.percentage = s.total > 0 ? Math.round((s.attended / s.total) * 100) : 100;
      s.isLow = s.percentage < 75;
      return s;
    });

    // Calculate monthly percentages
    const monthlyList = Object.values(monthlyStats)
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
      .map((m) => {
        m.hours = parseFloat((m.minutes / 60).toFixed(1));
        m.percentage = m.total > 0 ? Math.round((m.attended / m.total) * 100) : 100;
        return m;
      });

    // Low attendance warning flag
    const REQUIRED_THRESHOLD = 75;
    const isLowOverall = totalClasses > 0 && overallPercentage < REQUIRED_THRESHOLD;
    const lowSubjects = subjectList.filter((s) => s.isLow);

    // 🎯 ATTENDANCE PROJECTION CALCULATOR
    // If < 75%: How many consecutive classes needed to reach 75%, 80%, 85%?
    // Formula: (effectiveAttended + x) / (totalClasses + x) >= target
    // => x >= (target * totalClasses - effectiveAttended) / (1 - target)
    function calculateClassesNeeded(targetPercent) {
      const target = targetPercent / 100;
      if (totalClasses === 0) return 0;
      if (overallPercentage >= targetPercent) return 0;
      const numerator = (target * totalClasses) - effectiveAttended;
      const denominator = 1 - target;
      if (denominator <= 0) return 0;
      return Math.max(0, Math.ceil(numerator / denominator));
    }

    // If >= 75%: How many classes can be safely skipped while staying >= 75%?
    // Formula: effectiveAttended / (totalClasses + y) >= target => y <= (effectiveAttended / target) - totalClasses
    function calculateSafeSkips(targetPercent = 75) {
      const target = targetPercent / 100;
      if (totalClasses === 0 || overallPercentage < targetPercent) return 0;
      const maxTotal = effectiveAttended / target;
      return Math.max(0, Math.floor(maxTotal - totalClasses));
    }

    const projections = {
      target75: calculateClassesNeeded(75),
      target80: calculateClassesNeeded(80),
      target85: calculateClassesNeeded(85),
      safeSkips75: calculateSafeSkips(75),
      currentStatus: overallPercentage >= 75 ? "Safe" : "Shortage Warning"
    };

    res.json({
      totalClasses,
      attendedClasses: effectiveAttended,
      presentCount,
      lateCount,
      partialCount,
      absentCount,
      totalMinutes,
      totalHours,
      overallPercentage,
      requiredThreshold: REQUIRED_THRESHOLD,
      isLowOverall,
      lowSubjects,
      subjects: subjectList,
      monthly: monthlyList,
      projections,
      analytics: {
        totalClasses,
        attendedClasses: effectiveAttended,
        overallPercentage,
        totalHours
      }
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to compute attendance summary.", error: err.message });
  }
};

router.get("/summary", handleAttendanceSummary);
router.get("/analytics", handleAttendanceSummary);

// ----------------------------------------------------------------
// 5. ATTENDANCE HISTORY WITH FILTERS
// GET /api/attendance/history
// ----------------------------------------------------------------
router.get("/history", (req, res) => {
  try {
    const { subject, status, month, search } = req.query;
    const db = readDb();
    const userId = req.user.id;

    let records = (db.attendance || []).filter((r) => r.userId === userId);

    if (subject && subject !== "all") {
      records = records.filter((r) => (r.subject && r.subject.toLowerCase() === subject.toLowerCase()) || (r.subjectTag && r.subjectTag.toLowerCase() === subject.toLowerCase()));
    }
    if (status && status !== "all") {
      records = records.filter((r) => r.status === status);
    }
    if (month && month !== "all") {
      records = records.filter((r) => r.date && r.date.startsWith(month));
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      records = records.filter((r) =>
        (r.subject && r.subject.toLowerCase().includes(q)) ||
        (r.teacher && r.teacher.toLowerCase().includes(q)) ||
        (r.dayOfWeek && r.dayOfWeek.toLowerCase().includes(q)) ||
        (r.remarks && r.remarks.toLowerCase().includes(q))
      );
    }

    // Sort latest date first
    records.sort((a, b) => new Date(b.date + "T" + (b.checkInTime ? b.checkInTime.substring(11, 19) : "00:00:00")) - new Date(a.date + "T" + (a.checkInTime ? a.checkInTime.substring(11, 19) : "00:00:00")));

    // Populate notes & quiz status info if available
    const enriched = records.map((r) => {
      let linkedLecture = null;
      if (r.lectureId) {
        linkedLecture = (db.lectures || []).find((l) => l.id === r.lectureId);
      }
      return {
        ...r,
        notesAvailable: Boolean(linkedLecture || r.lectureId),
        lectureSubject: linkedLecture ? linkedLecture.subject : r.subject
      };
    });

    res.json({ records: enriched });
  } catch (err) {
    res.status(500).json({ message: "Failed to load history.", error: err.message });
  }
});

// ----------------------------------------------------------------
// 6. CALENDAR DATA AGGREGATION
// GET /api/attendance/calendar?year=2026&month=8
// ----------------------------------------------------------------
router.get("/calendar", (req, res) => {
  try {
    const { year, month } = req.query;
    const db = readDb();
    const userId = req.user.id;

    const currentYear = year ? parseInt(year) : new Date().getFullYear();
    const currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;
    const monthPrefix = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;

    const records = (db.attendance || []).filter((r) => r.userId === userId && r.date && r.date.startsWith(monthPrefix));

    // Group records by day of month (YYYY-MM-DD)
    const dayMap = {};
    records.forEach((r) => {
      if (!dayMap[r.date]) {
        dayMap[r.date] = {
          date: r.date,
          dayOfWeek: r.dayOfWeek,
          records: [],
          present: 0,
          late: 0,
          partial: 0,
          absent: 0,
          totalMinutes: 0,
          primaryStatus: "present"
        };
      }
      dayMap[r.date].records.push(r);
      const st = r.status || "present";
      dayMap[r.date][st] = (dayMap[r.date][st] || 0) + 1;
      dayMap[r.date].totalMinutes += (r.durationMinutes || 0);
    });

    // Determine overall daily color indicator
    Object.values(dayMap).forEach((d) => {
      if (d.absent > 0 && d.present === 0 && d.late === 0) d.primaryStatus = "absent";
      else if (d.partial > 0 && d.present === 0) d.primaryStatus = "partial";
      else if (d.late > 0) d.primaryStatus = "late";
      else d.primaryStatus = "present";
    });

    res.json({
      year: currentYear,
      month: currentMonth,
      monthPrefix,
      days: dayMap
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load calendar data.", error: err.message });
  }
});

// ----------------------------------------------------------------
// 7. TEACHER / ADMIN: CREATE LECTURE SESSION WITH QR CODE
// POST /api/attendance/teacher/session
// ----------------------------------------------------------------
router.post("/teacher/session", (req, res) => {
  try {
    const { subject, subjectTag, startTime, endTime, durationMinutes } = req.body;
    const db = readDb();

    // Generate readable 6-digit session PIN (e.g. NP-4821)
    const randomPin = Math.floor(1000 + Math.random() * 9000);
    const sessionCode = `NP-${randomPin}`;
    const now = new Date();
    const dateStr = getLocalDateString(now);
    const dayOfWeek = DAYS[now.getDay()];

    const newSession = {
      id: uuidv4(),
      code: sessionCode,
      creatorId: req.user.id,
      teacherName: req.user.name || "Teacher",
      teacherEmail: req.user.email,
      subject: subject || "Lecture Session",
      subjectTag: subjectTag || subject || "General",
      date: dateStr,
      dayOfWeek,
      startTime: startTime || now.toTimeString().substring(0, 5),
      endTime: endTime || "11:00",
      durationMinutes: durationMinutes || 60,
      isActive: true,
      qrToken: `NOTESPILOT_ATTENDANCE_${sessionCode}_${Date.now()}`,
      createdAt: now.toISOString()
    };

    db.attendanceSessions.push(newSession);
    writeDb(db);

    res.status(201).json({
      message: `Active session created with PIN ${sessionCode}`,
      session: newSession
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to create session.", error: err.message });
  }
});

// GET /api/attendance/teacher/sessions -> List sessions created by teacher
router.get("/teacher/sessions", (req, res) => {
  try {
    const db = readDb();
    const sessions = (db.attendanceSessions || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ message: "Failed to list sessions.", error: err.message });
  }
});

// ----------------------------------------------------------------
// 8. TEACHER / ADMIN: VIEW CLASS ATTENDANCE ROSTER
// GET /api/attendance/teacher/roster
// ----------------------------------------------------------------
router.get("/teacher/roster", (req, res) => {
  try {
    const { sessionId, subject, date } = req.query;
    const db = readDb();

    let records = db.attendance || [];

    if (sessionId) {
      records = records.filter((r) => r.sessionId === sessionId);
    }
    if (subject && subject !== "all") {
      records = records.filter((r) => r.subject && r.subject.toLowerCase() === subject.toLowerCase());
    }
    if (date) {
      records = records.filter((r) => r.date === date);
    }

    const allUsers = (db.users || []).filter((u) => u.role !== "teacher");

    // Map roster items
    const roster = records.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.userName || "Student",
      userEmail: r.userEmail || "",
      subject: r.subject,
      date: r.date,
      dayOfWeek: r.dayOfWeek,
      checkInTime: r.checkInTime,
      checkOutTime: r.checkOutTime,
      durationMinutes: r.durationMinutes,
      status: r.status,
      method: r.method,
      remarks: r.remarks
    }));

    res.json({
      totalRecorded: records.length,
      totalStudentsEnrolled: allUsers.length,
      roster
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load teacher roster.", error: err.message });
  }
});

// ----------------------------------------------------------------
// 9. TEACHER: MANUAL OVERRIDE STATUS / ADD REMARKS
// PATCH /api/attendance/teacher/override/:id
// ----------------------------------------------------------------
router.patch("/teacher/override/:id", (req, res) => {
  try {
    const { status, remarks, durationMinutes } = req.body;
    const db = readDb();
    const index = (db.attendance || []).findIndex((r) => r.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ message: "Attendance record not found." });
    }

    if (status) db.attendance[index].status = status;
    if (remarks !== undefined) db.attendance[index].remarks = remarks;
    if (durationMinutes !== undefined) {
      db.attendance[index].durationMinutes = durationMinutes;
      db.attendance[index].durationHours = parseFloat((durationMinutes / 60).toFixed(2));
    }

    writeDb(db);
    res.json({ message: "Attendance status updated.", record: db.attendance[index] });
  } catch (err) {
    res.status(500).json({ message: "Failed to update record.", error: err.message });
  }
});

// ----------------------------------------------------------------
// 10. EXPORT ATTENDANCE TO CSV
// GET /api/attendance/export-csv
// ----------------------------------------------------------------
router.get("/export-csv", (req, res) => {
  try {
    const db = readDb();
    const userId = req.user.id;
    const isTeacher = req.user.role === "teacher";

    let records = db.attendance || [];
    if (!isTeacher) {
      records = records.filter((r) => r.userId === userId);
    }

    const headers = [
      "Record ID",
      "Student Name",
      "Email",
      "Subject",
      "Subject Tag",
      "Teacher",
      "Date",
      "Day",
      "Check-In Time",
      "Check-Out Time",
      "Duration (Mins)",
      "Duration (Hours)",
      "Status",
      "Method",
      "Remarks"
    ];

    const rows = records.map((r) => [
      `"${r.id}"`,
      `"${r.userName || ""}"`,
      `"${r.userEmail || ""}"`,
      `"${r.subject || ""}"`,
      `"${r.subjectTag || ""}"`,
      `"${r.teacher || ""}"`,
      `"${r.date || ""}"`,
      `"${r.dayOfWeek || ""}"`,
      `"${r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString() : ""}"`,
      `"${r.checkOutTime ? new Date(r.checkOutTime).toLocaleTimeString() : ""}"`,
      r.durationMinutes || 0,
      r.durationHours || 0,
      `"${r.status || "present"}"`,
      `"${r.method || "auto"}"`,
      `"${(r.remarks || "").replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=NotesPilot_Attendance_${getLocalDateString()}.csv`);
    res.status(200).send(csvContent);
  } catch (err) {
    res.status(500).json({ message: "Failed to export CSV.", error: err.message });
  }
});

module.exports = router;
