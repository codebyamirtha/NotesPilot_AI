# 📚 NotesPilot AI – Intelligent Classroom Learning Assistant

An AI-powered web app that listens to a lecture, turns speech into text, and
automatically organizes it into structured notes, summaries, keywords, practice quizzes,
and an OpenAI-powered Student Supporter AI tutor — so students can focus on understanding class instead of
writing everything down.

This build uses **only basic, dependency-light code** so it runs cleanly in
VS Code with no paid API keys required.

---

## 🧱 Tech Stack (kept intentionally simple)

| Layer          | Technology                                              |
|-----------------|----------------------------------------------------------|
| Frontend        | Plain HTML5, CSS3, JavaScript (no build step needed)     |
| Speech-to-Text  | Browser's built-in Web Speech API (free, Chrome-based)   |
| Backend         | Node.js + Express                                        |
| Database        | A local JSON file (`backend/data/db.json`) — no MongoDB install needed |
| Auth            | JWT + bcrypt password hashing                             |
| "AI" engine     | Rule-based text processing in `backend/utils/aiEngine.js` — works fully offline, no API key |
| PDF Export      | jsPDF (loaded via CDN in the browser)                     |

> Want smarter, real GPT/Gemini-powered notes later? Everything already calls
> the functions in `backend/utils/aiEngine.js` — just fill in
> `upgradeWithRealAI()` at the bottom of that file with your API key. The rest
> of the app doesn't need to change.

---

## 📂 Folder Structure

```
notes-pilot-ai/
├── backend/
│   ├── server.js              # Express app entry point
│   ├── package.json
│   ├── data/db.json           # auto-created JSON "database"
│   ├── middleware/auth.js     # JWT verification
│   ├── routes/
│   │   ├── auth.js            # Feature: Login / Register
│   │   ├── lectures.js        # Feature: Recording, Notes, History, Search
│   │   ├── quiz.js            # Feature: Quiz Generator
│   │   ├── supporter.js       # Feature: Student Supporter (OpenAI API / Offline Tutor)
│   │   ├── planner.js         # Feature: Weekly Timetable & Study Planner
│   │   └── stats.js           # Feature: Dashboard analytics
│   └── utils/
│       ├── db.js              # tiny file-based database helper
│       └── aiEngine.js        # the "AI" - note structuring, summaries, quiz logic
└── frontend/
    ├── index.html              # Login / Register
    ├── dashboard.html          # Stats + quick actions
    ├── record.html             # Live recording + speech-to-text
    ├── notes.html               # Smart notes viewer + search + PDF export
    ├── planner.html             # Weekly Timetable & Study Planner
    ├── quiz.html                # AI quiz
    ├── supporter.html           # 🤖 Student Supporter (AI Tutor Chat Box)
    ├── focus.html               # ⭐ Extra feature: Pomodoro focus timer + mind map
    ├── css/style.css
    └── js/  (one file per feature, matching the routes above)
```

---

## ▶️ How to Run in VS Code

1. **Open the `notes-pilot-ai` folder in VS Code.**

2. **Open a terminal** (`` Ctrl+` ``) and install backend dependencies:
   ```bash
   cd backend
   npm install
   ```

3. **Start the server:**
   ```bash
   npm start
   ```
   You should see:
   ```
   ✅ NotesPilot AI server running at http://localhost:5000
   ```

4. **Open your browser** at `http://localhost:5000` — the Express server
   also serves the frontend, so you don't need a separate live-server.

5. **Register an account**, then log in and try:
   - 🎙️ **Record Lecture** — allow microphone access in **Google Chrome**
     for live speech-to-text with studio DSP filters (**Noise Suppression**, **Echo Cancellation**, and **Auto Gain Control**) and real-time audio waveform visualizer.
   - 📒 **My Notes** — view AI-structured notes, summaries, keywords, and
     export to PDF.
   - 🧠 **Quiz** and 🤖 **Student Supporter** — practice quizzes and 24/7 AI tutoring linked with OpenAI platform.
   - ⏱️ **Focus Timer** — bonus Pomodoro timer with a streak tracker and a
     visual mind map of your lecture keywords.

---

## ⭐ Extra Enhancement Feature (beyond the original brief)

**Focus Timer + Study Streak + AI Mind Map** (`focus.html`) — a Pomodoro-style
25/5/15 minute timer that tracks a daily study streak in the browser, plus a
canvas-based mind map that visually connects a lecture's AI-extracted
keywords around its subject. This combines productivity tooling with the
existing AI notes data, going beyond the core note-taking feature set.

---

## 🔒 Notes on the "AI"

To guarantee the project **runs without errors and without any external
account**, core notes and quiz processing is done with **rule-based JavaScript** in
`backend/utils/aiEngine.js` — with optional live **OpenAI Platform (GPT-4o)** tutoring in the **Student Supporter**.
It reads naturally as AI-generated structure because it detects patterns
real lecture speech tends to follow (definitions, trigger words like
"important"/"remember", numeric formulas, keyword frequency).

If you want to connect real OpenAI or Gemini models for your final
submission, see the `upgradeWithRealAI()` function at the bottom of
`aiEngine.js` for where to plug it in.

---

## 🛠️ Troubleshooting

- **"npm install" fails** → check your internet connection; this only needs
  5 small packages (express, cors, body-parser, bcryptjs, jsonwebtoken, uuid).
- **Microphone not working** → use Google Chrome and allow mic permission
  when prompted; the Web Speech API isn't supported in all browsers.
- **Port 5000 already in use** → run `PORT=5050 npm start` instead, then
  open `http://localhost:5050`.
