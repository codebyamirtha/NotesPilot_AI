// ================================================================
// server.js - NotesPilot AI backend entry point
// Run with:  npm install   then   npm start
// Server runs at http://localhost:5000
// ================================================================

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");

const { ensureDbExists } = require("./utils/db");

const authRoutes = require("./routes/auth");
const lectureRoutes = require("./routes/lectures");
const quizRoutes = require("./routes/quiz");
const supporterRoutes = require("./routes/supporter");
const statsRoutes = require("./routes/stats");
const plannerRoutes = require("./routes/planner");
const attendanceRoutes = require("./routes/attendance");
const flashcardsRoutes = require("./routes/flashcards");

const app = express();
const PORT = process.env.PORT || 5000;

// Make sure data/db.json exists before anything else runs
ensureDbExists();

// ---- Middleware ----
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

// ---- Serve the frontend (plain HTML/CSS/JS) as static files ----
app.use(express.static(path.join(__dirname, "..", "frontend")));

// ---- API routes, one file per feature ----
app.use("/api/auth", authRoutes);
app.use("/api/lectures", lectureRoutes);
app.use("/api/quiz", quizRoutes);
app.use("/api/supporter", supporterRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/planner", plannerRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/flashcards", flashcardsRoutes);

// Simple health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "NotesPilot AI server is running." });
});

// Fallback 404 for unknown API routes
app.use("/api", (req, res) => {
  res.status(404).json({ message: "API route not found." });
});

app.listen(PORT, () => {
  console.log(`\n✅ NotesPilot AI server running at http://localhost:${PORT}`);
  console.log(`   Open http://localhost:${PORT} in your browser to use the app.\n`);
});
