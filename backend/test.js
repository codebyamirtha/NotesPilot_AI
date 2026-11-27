// ================================================================
// backend/test.js - Comprehensive automated test suite for NotesPilot AI
// Run with: npm test (from backend/) or node backend/test.js
// ================================================================

const fs = require("fs");
const path = require("path");
const http = require("http");

const backendDir = __dirname;
const workspaceRoot = path.join(__dirname, "..");
const frontendDir = path.join(workspaceRoot, "frontend");

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const errors = [];

function assert(condition, message, errorDetail = null) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${message}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${message}`);
    if (errorDetail) console.error(`    Detail:`, errorDetail);
    errors.push({ test: message, detail: errorDetail });
  }
}

async function runTests() {
  console.log("====================================================");
  console.log("🧪 Running NotesPilot AI Automated Test Suite");
  console.log("====================================================\n");

  // ---------------------------------------------------------------
  // 1. FRONTEND ASSETS & DOM INTEGRITY
  // ---------------------------------------------------------------
  console.log("--- [1] Checking Frontend Assets & Script References ---");
  const htmlFiles = fs.readdirSync(frontendDir).filter((f) => f.endsWith(".html"));
  for (const htmlFile of htmlFiles) {
    const htmlPath = path.join(frontendDir, htmlFile);
    const content = fs.readFileSync(htmlPath, "utf-8");

    // Check script src
    const scriptRegex = /<script\s+[^>]*src=["']([^"']+)["']/gi;
    let match;
    while ((match = scriptRegex.exec(content)) !== null) {
      const src = match[1];
      if (src.startsWith("http://") || src.startsWith("https://")) continue;
      const resolved = path.join(frontendDir, src);
      assert(fs.existsSync(resolved), `[${htmlFile}] script exists: ${src}`, `Missing file: ${resolved}`);
    }

    // Check link css href
    const cssRegex = /<link\s+[^>]*href=["']([^"']+)["']/gi;
    while ((match = cssRegex.exec(content)) !== null) {
      const href = match[1];
      if (href.startsWith("http://") || href.startsWith("https://")) continue;
      const resolved = path.join(frontendDir, href);
      assert(fs.existsSync(resolved), `[${htmlFile}] CSS exists: ${href}`, `Missing file: ${resolved}`);
    }
  }

  // ---------------------------------------------------------------
  // 2. AI ENGINE UNIT & ROBUSTNESS TESTS
  // ---------------------------------------------------------------
  console.log("\n--- [2] Testing AI Engine Core & Edge-Case Robustness ---");
  const ai = require(path.join(backendDir, "utils", "aiEngine.js"));

  try {
    const sentences = ai.splitSentences("Hello world. This is a test! Does it work? Yes.");
    assert(Array.isArray(sentences) && sentences.length >= 3, "ai.splitSentences parses sentences");
  } catch (e) {
    assert(false, "ai.splitSentences threw error", e.message);
  }

  try {
    const emptySentences = ai.splitSentences("");
    assert(Array.isArray(emptySentences) && emptySentences.length === 0, "ai.splitSentences handles empty input");
  } catch (e) {
    assert(false, "ai.splitSentences empty threw error", e.message);
  }

  try {
    const keywords = ai.extractKeywords("Photosynthesis is used by plants. Photosynthesis produces oxygen.");
    assert(Array.isArray(keywords) && keywords.includes("photosynthesis"), "ai.extractKeywords identifies frequency");
  } catch (e) {
    assert(false, "ai.extractKeywords threw error", e.message);
  }

  try {
    const defs = ai.extractDefinitions(["A compiler is a program that translates code."]);
    assert(Array.isArray(defs) && defs.length === 1 && defs[0].term === "A compiler", "ai.extractDefinitions detects terms");
  } catch (e) {
    assert(false, "ai.extractDefinitions threw error", e.message);
  }

  try {
    const sampleTranscript = "Operating systems manage hardware. A process is an executing program. CPU scheduling is important for exam. E = mc2 with 10. Memory is crucial. In conclusion, OS coordinates resources.";
    const notes = ai.generateSmartNotes(sampleTranscript);
    assert(notes && typeof notes === "object", "ai.generateSmartNotes returns structured note object");
    assert(typeof notes.summaryShort === "string", "notes.summaryShort is string");
    assert(typeof notes.summaryDetailed === "string", "notes.summaryDetailed is string");
    assert(Array.isArray(notes.sections), "notes.sections is array");
    assert(Array.isArray(notes.keywords), "notes.keywords is array");
  } catch (e) {
    assert(false, "ai.generateSmartNotes threw error", e.message);
  }

  try {
    // Test exam paper with partial/empty notes to verify crash resilience
    const paperFromEmpty = ai.generateExamPaper({}, "Empty Notes Test");
    assert(paperFromEmpty && Array.isArray(paperFromEmpty.sectionA), "ai.generateExamPaper safely handles empty notes object");
    assert(paperFromEmpty.sectionA.length === 5, "generateExamPaper generates 5 Section A questions with fallbacks");
    assert(paperFromEmpty.sectionB.length === 3, "generateExamPaper generates 3 Section B questions with fallbacks");
    assert(paperFromEmpty.sectionC.length === 2, "generateExamPaper generates 2 Section C questions with fallbacks");
  } catch (e) {
    assert(false, "ai.generateExamPaper empty notes resilience test threw error", e.message);
  }

  try {
    const quiz = ai.generateQuiz({}, "Python is an interpreted language. A dictionary stores key value pairs.", "Python 101", 5);
    assert(Array.isArray(quiz) && quiz.length > 0, "ai.generateQuiz returns questions");
    assert(quiz[0].question && quiz[0].answer, "quiz question contains text and answer");
  } catch (e) {
    assert(false, "ai.generateQuiz threw error", e.message);
  }

  try {
    const doubt = ai.answerDoubt("What is a compiler?", { definitions: [{ term: "compiler", definition: "A compiler translates code." }] }, "A compiler translates code.");
    assert(doubt && doubt.answer && !doubt.answer.includes("undefined"), "ai.answerDoubt returns valid answers");
  } catch (e) {
    assert(false, "ai.answerDoubt threw error", e.message);
  }

  // ---------------------------------------------------------------
  // 3. BACKEND API INTEGRATION TESTS
  // ---------------------------------------------------------------
  console.log("\n--- [3] Starting Backend API Server & Running Route Tests ---");

  const express = require("express");
  const cors = require("cors");
  const bodyParser = require("body-parser");

  const { ensureDbExists, readDb, writeDb } = require(path.join(backendDir, "utils", "db.js"));
  ensureDbExists();

  const authRoutes = require(path.join(backendDir, "routes", "auth.js"));
  const lectureRoutes = require(path.join(backendDir, "routes", "lectures.js"));
  const quizRoutes = require(path.join(backendDir, "routes", "quiz.js"));
  const supporterRoutes = require(path.join(backendDir, "routes", "supporter.js"));
  const statsRoutes = require(path.join(backendDir, "routes", "stats.js"));
  const plannerRoutes = require(path.join(backendDir, "routes", "planner.js"));
  const attendanceRoutes = require(path.join(backendDir, "routes", "attendance.js"));
  const flashcardsRoutes = require(path.join(backendDir, "routes", "flashcards.js"));

  const app = express();
  app.use(cors());
  app.use(bodyParser.json({ limit: "50mb" }));
  app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

  app.use("/api/auth", authRoutes);
  app.use("/api/lectures", lectureRoutes);
  app.use("/api/quiz", quizRoutes);
  app.use("/api/supporter", supporterRoutes);
  app.use("/api/stats", statsRoutes);
  app.use("/api/planner", plannerRoutes);
  app.use("/api/attendance", attendanceRoutes);
  app.use("/api/flashcards", flashcardsRoutes);
  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  const TEST_PORT = 5088;
  const server = app.listen(TEST_PORT);

  function makeRequest(method, endpoint, body = null, token = null) {
    return new Promise((resolve, reject) => {
      const postData = body ? JSON.stringify(body) : null;
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (postData) headers["Content-Length"] = Buffer.byteLength(postData);

      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: TEST_PORT,
          path: endpoint,
          method,
          headers
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            let json = {};
            try { json = JSON.parse(data); } catch (e) { json = { raw: data }; }
            resolve({ status: res.statusCode, data: json });
          });
        }
      );
      req.on("error", reject);
      if (postData) req.write(postData);
      req.end();
    });
  }

  let testUserId = null;
  let testLectureId = null;

  try {
    // Health check
    const health = await makeRequest("GET", "/api/health");
    assert(health.status === 200 && health.data.status === "ok", "GET /api/health responds 200 OK");

    // Auth register
    const testEmail = `tester_${Date.now()}@example.com`;
    const regRes = await makeRequest("POST", "/api/auth/register", {
      name: "Unit Tester",
      email: testEmail,
      password: "SecretPassword123!",
      role: "student"
    });
    assert(regRes.status === 201, "POST /api/auth/register registers account (201)");

    // Auth duplicate register
    const dupRes = await makeRequest("POST", "/api/auth/register", {
      name: "Duplicate User",
      email: testEmail,
      password: "SecretPassword123!"
    });
    assert(dupRes.status === 409, "POST /api/auth/register rejects duplicate email (409)");

    // Auth login
    const loginRes = await makeRequest("POST", "/api/auth/login", {
      email: testEmail,
      password: "SecretPassword123!"
    });
    assert(loginRes.status === 200 && loginRes.data.token, "POST /api/auth/login logs in & returns JWT (200)");
    const token = loginRes.data.token;
    testUserId = loginRes.data.user.id;

    // Lectures create
    const createLecRes = await makeRequest("POST", "/api/lectures", {
      subject: "Discrete Mathematics",
      subjectTag: "MATH201",
      teacher: "Dr. Euler",
      transcript: "Graph theory is the study of graphs. A tree is an undirected acyclic graph. Important: remember Euler's formula V - E + F = 2.",
      doubts: [{ question: "What is an acyclic graph?", solution: "A graph with no cycles.", resolved: false }]
    }, token);
    assert(createLecRes.status === 201 && createLecRes.data.lecture, "POST /api/lectures generates notes and doubts (201)");
    testLectureId = createLecRes.data.lecture.id;

    // Lectures get
    const getLecsRes = await makeRequest("GET", "/api/lectures", null, token);
    assert(getLecsRes.status === 200 && Array.isArray(getLecsRes.data.lectures), "GET /api/lectures returns lecture list (200)");

    // Lectures ask doubt
    const askRes = await makeRequest("POST", `/api/lectures/${testLectureId}/ask`, { query: "What is a tree?" }, token);
    assert(askRes.status === 200 && askRes.data.answer, "POST /api/lectures/:id/ask returns answer (200)");

    // Lectures exam paper
    const examRes = await makeRequest("GET", `/api/lectures/${testLectureId}/exam-paper`, null, token);
    assert(examRes.status === 200 && examRes.data.examPaper && examRes.data.examPaper.sectionA, "GET /api/lectures/:id/exam-paper returns exam paper (200)");

    // Lectures add doubt
    const addDoubtRes = await makeRequest("POST", `/api/lectures/${testLectureId}/doubts`, {
      question: "What is Euler's formula?",
      autoSolve: true
    }, token);
    assert(addDoubtRes.status === 201 && addDoubtRes.data.doubt, "POST /api/lectures/:id/doubts adds doubt (201)");
    const doubtId = addDoubtRes.data.doubt.id;

    // Lectures toggle doubt
    const toggleDoubtRes = await makeRequest("PATCH", `/api/lectures/doubts/${doubtId}/toggle`, {}, token);
    assert(toggleDoubtRes.status === 200 && toggleDoubtRes.data.doubt.resolved === true, "PATCH /api/lectures/doubts/:doubtId/toggle toggles resolution");

    // Quiz generation
    const genQuizRes = await makeRequest("POST", "/api/quiz/generate", { lectureId: testLectureId, count: 5 }, token);
    assert(genQuizRes.status === 201 && genQuizRes.data.quiz, "POST /api/quiz/generate creates practice quiz (201)");
    const quizId = genQuizRes.data.quiz.id;

    // Quiz submit
    const submitQuizRes = await makeRequest("POST", `/api/quiz/${quizId}/submit`, { answers: { 0: "True" } }, token);
    assert(submitQuizRes.status === 200 && submitQuizRes.data.score, "POST /api/quiz/:id/submit grades answers (200)");

    // Stats analytics
    const statsRes = await makeRequest("GET", "/api/stats", null, token);
    assert(statsRes.status === 200 && statsRes.data.lecturesCompleted !== undefined, "GET /api/stats returns learning analytics (200)");

    // Planner timetable slot
    const addSlotRes = await makeRequest("POST", "/api/planner/timetable", {
      day: "tuesday",
      startTime: "14:00",
      endTime: "15:30",
      subject: "Discrete Mathematics",
      topic: "Graph Theory Review"
    }, token);
    assert(addSlotRes.status === 201 && addSlotRes.data.slot, "POST /api/planner/timetable adds session slot (201)");

    // Attendance check-in
    const checkInRes = await makeRequest("POST", "/api/attendance/check-in", {
      subject: "Discrete Mathematics",
      teacher: "Dr. Euler",
      method: "manual"
    }, token);
    assert(checkInRes.status === 201 && checkInRes.data.record, "POST /api/attendance/check-in checks in user (201)");
    const attRecord = checkInRes.data.record;

    // Attendance check-out
    const checkOutRes = await makeRequest("POST", "/api/attendance/check-out", {
      recordId: attRecord.id
    }, token);
    assert(checkOutRes.status === 200 && checkOutRes.data.record.checkOutTime, "POST /api/attendance/check-out closes session (200)");

    // Attendance summary
    const attSumRes = await makeRequest("GET", "/api/attendance/summary", null, token);
    assert(attSumRes.status === 200 && attSumRes.data.overallPercentage !== undefined, "GET /api/attendance/summary returns analytics (200)");

    // Flashcards all
    const fcAllRes = await makeRequest("GET", "/api/flashcards/all", null, token);
    assert(fcAllRes.status === 200 && Array.isArray(fcAllRes.data.decks), "GET /api/flashcards/all returns decks (200)");

    // Supporter offline chat
    const supRes = await makeRequest("POST", "/api/supporter/chat", {
      message: "Explain graph theory in simple terms."
    }, token);
    assert(supRes.status === 200 && supRes.data.reply, "POST /api/supporter/chat returns tutor response (200)");

    // Clean up test data
    const db = readDb();
    db.users = (db.users || []).filter((u) => u.email !== testEmail);
    if (testLectureId) {
      db.lectures = (db.lectures || []).filter((l) => l.id !== testLectureId);
      db.quizzes = (db.quizzes || []).filter((q) => q.lectureId !== testLectureId);
    }
    db.timetables = (db.timetables || []).filter((t) => t.userId !== testUserId);
    db.attendance = (db.attendance || []).filter((a) => a.userId !== testUserId);
    writeDb(db);

  } catch (err) {
    assert(false, "API test execution failed", err.stack || err.message);
  } finally {
    server.close();
  }

  // ---------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------
  console.log("\n====================================================");
  console.log(`📊 Test Summary: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
  console.log("====================================================");

  if (failedTests > 0) {
    console.log("\n❌ Failures:");
    errors.forEach((e, i) => console.log(`  ${i + 1}. ${e.test} - ${e.detail || ""}`));
  } else {
    console.log("\n🎉 ALL TESTS PASSED! Project is 100% verified and operational.");
  }

  return { total: totalTests, passed: passedTests, failed: failedTests };
}

runTests().then((res) => {
  process.exit(res.failed > 0 ? 1 : 0);
}).catch((err) => {
  console.error("Test crash:", err);
  process.exit(1);
});
