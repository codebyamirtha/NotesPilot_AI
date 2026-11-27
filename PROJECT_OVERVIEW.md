# 📚 NotesPilot AI – Complete Project Overview & File Directory

**NotesPilot AI** is an intelligent classroom learning assistant web application. It converts live speech or uploaded lecture documents (`.txt`, `.md`) into structured notes, 1-minute & 5-minute summaries, key definitions, math formulas, auto-generated practice quizzes, a 24/7 OpenAI-powered AI Academic Supporter, subject-tagged organization, and AI visual weekly study timetables.

Everything runs **100% offline, dependency-light, and requires zero paid API keys or external services**.

---

## 📂 Complete File Structure

```
Notes Pilot AI/
├── README.md                          # Quickstart guide & installation instructions
├── PROJECT_OVERVIEW.md                # Full project architecture & directory guide
├── backend/
│   ├── server.js                      # Express app entry point & route registration
│   ├── package.json                   # Backend dependencies (express, cors, bcryptjs, jsonwebtoken, uuid)
│   ├── data/
│   │   └── db.json                    # File-based JSON database (users, lectures, quizzes, planners, timetables)
│   ├── middleware/
│   │   └── auth.js                    # JWT token verification middleware
│   ├── utils/
│   │   ├── db.js                      # Helper module for reading/writing db.json
│   │   └── aiEngine.js                # Offline AI engine (notes, exam paper, mnemonics, doubt solver)
│   └── routes/
│       ├── auth.js                    # POST /api/auth/register, POST /api/auth/login
│       ├── lectures.js                # POST /api/lectures, GET /api/lectures, POST /:id/ask, GET /:id/exam-paper
│       ├── quiz.js                    # GET /api/quiz/:lectureId
│       ├── supporter.js               # POST /api/supporter/chat (OpenAI Platform integration & offline tutor)
│       ├── stats.js                   # GET /api/stats (dashboard metrics)
│       └── planner.js                 # GET /api/planner, POST /api/planner/generate, GET/POST /api/planner/timetable
└── frontend/
    ├── index.html                     # Login & Registration page
    ├── dashboard.html                 # Analytics dashboard & quick actions
    ├── record.html                    # 🎙️ Live speech recording, Audio DSP & 🎵 audio file player
    ├── notes.html                     # 📒 Smart notes viewer (Cornell, TTS Audio, Cheat Sheet, Doubt Solver, Exam Paper)
    ├── planner.html                   # 📅 Weekly Timetable Grid & AI Study Planner
    ├── quiz.html                      # 🧠 Practice Quiz interface
    ├── supporter.html                 # 🤖 Student Supporter (OpenAI-powered AI Tutor Chat Box)
    ├── focus.html                     # ⏱️ Pomodoro focus timer, mind map & 🌲 Semester Skill Tree
    ├── css/
    │   └── style.css                  # Notebook paper theme stylesheet & dark mode
    └── js/
        ├── app.js                     # Shared utilities: API wrapper, session auth, theme toggle, TTS helpers
        ├── auth.js                    # Login & signup form logic
        ├── dashboard.js               # Fetches & renders user study analytics
        ├── record.js                  # Speech recorder, Audio DSP visualizer & audio player
        ├── notes.js                   # Notes renderer, Cornell toggle, TTS, Cheat Sheet, Chat Q&A, Exam Paper
        ├── planner.js                 # Interactive weekly timetable grid & study plan generator
        ├── quiz.js                    # Quiz game loop & score tracking
        ├── supporter.js               # Student Supporter chat, OpenAI key config & speech readout
        └── focus.js                   # Timer countdown, streak counter, mind map & Semester Skill Tree
```

---

## 🧱 Architectural Components

### 1. Database Layer (`backend/data/db.json` & `backend/utils/db.js`)
- Stores collections in a local JSON file: `users`, `lectures`, `quizzes`, `planners`, `timetables`.
- Zero database setup overhead (no MongoDB / PostgreSQL installation required).

### 2. Rule-Based AI Engine (`backend/utils/aiEngine.js`) & OpenAI Integration
- **Smart Note Structuring**: Groups sentences into logical topic sections.
- **Summary Generation & Audio Notes**: Produces 1-minute and 5-minute summaries playable via SpeechSynthesis.
- **Definition & Formula Extraction**: Regex-based detection of `X is Y`, definitions, and mathematical equations.
- **Mnemonics & Acronym Forge**: Generates memorable associative acronyms and memory hooks.
- **Mock University Exam Paper Generator**: Generates 3-tier examination papers (Section A: 2 Marks, Section B: 5 Marks, Section C: 10 Marks) with model answers and grading rubrics.
- **Student Supporter & Doubt Answering**: Context-aware AI academic mentor connected to the OpenAI platform (GPT-4o/GPT-3.5) with full offline heuristics fallback.
- **Practice Quizzes**: Automatically constructs MCQs, True/False, and Fill-in-the-blanks.

### 3. API Routes Summary

| Endpoint | Method | Description |
|---|---|---|
| `/api/auth/register` | POST | Register new user account |
| `/api/auth/login` | POST | Authenticate user & issue JWT token |
| `/api/lectures` | POST | Save transcript & generate structured smart notes |
| `/api/lectures` | GET | Retrieve user lecture history (supports `?tag=...`) |
| `/api/lectures/tags` | GET | Retrieve distinct subject tags for logged-in user |
| `/api/lectures/:id` | GET | Retrieve full notes for a single lecture |
| `/api/lectures/:id` | PUT | Edit/Update note content or regenerate AI structures |
| `/api/lectures/:id` | DELETE | Delete lecture note & clean up related quizzes |
| `/api/lectures/:id/ask` | POST | "Chat with Your Notes" semantic doubt solver |
| `/api/lectures/:id/doubts` | POST | Add question/doubt with manual or instant AI solution to notepad |
| `/api/lectures/:id/doubts/:doubtId` | PATCH | Update doubt question, solution notepad, or toggle resolved checkbox |
| `/api/lectures/:id/doubts/:doubtId` | DELETE | Delete doubt item from lecture notepad |
| `/api/lectures/doubts/all` | GET | Fetch all doubts across all lectures for Dashboard checklist |
| `/api/lectures/doubts/:doubtId/toggle` | PATCH | Toggle doubt resolution status from dashboard or any view |
| `/api/lectures/:id/exam-paper` | GET | Auto-generate University-format Mock Exam Paper & Rubric |
| `/api/lectures/search/:query` | GET | Full-text search across transcripts & notes |
| `/api/planner` | GET | Fetch active exam study plan |
| `/api/planner/generate` | POST | Generate multi-day exam schedule |
| `/api/planner/tasks/:taskId` | PATCH | Toggle completion status of daily study task |
| `/api/planner/timetable` | GET | Fetch user's weekly timetable, subject colors & commitment stats |
| `/api/planner/timetable` | POST | Create a new weekly study session block |
| `/api/planner/timetable/:id` | PUT | Update study session details (day, time, subject, topic, color) |
| `/api/planner/timetable/:id/toggle` | PATCH | Toggle study session completion status |
| `/api/planner/timetable/:id` | DELETE | Remove study session from weekly timetable |
| `/api/planner/timetable/auto-generate` | POST | Auto-populate balanced weekly timetable from recorded subjects |
| `/api/planner/timetable/clear/all` | DELETE | Clear all weekly timetable slots |
| `/api/quiz/generate` | POST | Auto-generate customized multi-type practice quiz (5/10/15 Qs) |
| `/api/quiz/:id` | GET | Retrieve saved quiz and user answer history |
| `/api/quiz/:id/submit` | POST | Grade user quiz answers and return AI explanations |
| `/api/lectures/enhance-transcript` | POST | Apply audio NLP suite: chatter clean, mumble repair, domain spelling & capitalization |
| `/api/supporter/chat` | POST | Send prompt to Student Supporter (OpenAI API / Offline Tutor) |
| `/api/supporter/status` | GET | Check OpenAI model support & connection status |
| `/api/stats` | GET | Fetch user study dashboard analytics (including pending doubts) |

---

## 🎨 Key Features & User Flow

1. **Authentication**: Users register/login on `index.html`. JWT token stored in browser `localStorage`.
2. **Lecture Input, Far-Field Audio DSP & Speech Intelligence**:
   - **Speech Recording**: Real-time live transcription with Google Chrome Web Speech API.
   - **📡 Far-Field Listening (Back-Bench Boost)**: Web Audio API `GainNode` (1.0x to 4.0x multiplier) + `DynamicsCompressorNode` for distant lecturer voice amplification in large lecture halls.
   - **🛡️ Overlapping Speech & Chatter Cleanup**: Filters out classroom side-whispers, cross-talk, and deduplicates acoustic mic echo repeats.
   - **🗣️ Mumble and Whisper Recognition**: High-shelf speech peaking filter at 3.2 kHz paired with phonetic reconstruction of slurred word endings (*-in'* $\rightarrow$ *-ing*) and mumbled contractions (*"whaddya"*, *"tryna"*, *"dunno"*).
   - **📖 Content-Based Academic Spelling**: Multi-domain phonetic dictionaries correcting STEM, CS, Mathematics, and Biology technical terms (*"pie thon"* $\rightarrow$ `Python`, *"sequel"* $\rightarrow$ `SQL`, *"photo synth says"* $\rightarrow$ `photosynthesis`).
   - **🔠 Automatic Capitalization & Acronyms**: Multi-layer proper noun, pioneer name, acronym (`AI`, `ML`, `SQL`, `API`, `CRISPR`), and sentence boundary capitalization.
   - **✍️ Handwritten Notes Upload & Study Mode**: Direct upload of multiple handwritten notebook photos (`.jpg`, `.jpeg`, `.png`, `.webp`) organized by Subject and Lecture.
   - **🔴 Doubt Highlighting Mode (Space-Key Red Markers)**: Press the `Space` key anytime during speech recording or typing to place a persistent red doubt marker (`🔴`) at the current word without inserting extra spaces. Multiple markers are preserved and can be clicked to view, auto-solve, or jump to its solution in the notes notepad.
   - **🎛️ Audio Quality DSP & Hardware Filters**: Real-time **Noise Suppression**, **Echo Cancellation (AEC)**, and **Automatic Gain Control (AGC)** with live Web Audio waveform visualizer and VU volume meter.
   - **🎵 Audio File Player**: Upload `.mp3`, `.wav`, or `.m4a` files.
   - **Subject Tagging**: Assign course codes (`CS101`, `Biology`, `Math`) for categorized organization.
3. **Smart Notes, Doubts & Handwritten Study Mode**:
   - **My Study Notes Mode Switcher**: 1-click dual mode toggle between **📄 Normal Notes** (typed & AI structured) and **✍️ Handwritten Notes** (personal notebook images).
   - **✍️ Handwritten Study Viewer**: Clean high-res study mode with **Zoom In/Out**, **Page Navigation (Previous / Next / Page X of Y)**, **Page Reordering & Deletion**, **Contrast Enhancement / Night Invert Filter**, and **Fullscreen**.
   - **🔍 AI Analysis of Handwritten Notes**: 1-click OCR & conceptual synthesis that extracts readable text, identifies core topics, writes a concise summary, and generates possible exam questions **without modifying the original handwritten images**.
   - **📐 Cornell Notes View**: 1-click toggle for classic 3-column layout (Cues/Keywords, Main Notes, Bottom Summary).
   - **💡 Doubts & Solutions Notepad**: Dedicated problem notepad for every lecture with resolution checkboxes (`[ ] Resolved`), editable solution textareas, and 1-click **⚡ Auto-Solve with AI**.
   - **📌 Centralized Dashboard Doubts Checklist**: Live interactive checklist on `dashboard.html` consolidating all unresolved lecture doubts with filter pills and direct lecture links.
   - **🤖 Responsive AI Assistant & Synthesizer**: Instant 1-click note transformations including **⚡ 3-Bullet Takeaways**, **💡 ELI5 Simple Explanations**, **🎯 3 Flash Quiz Questions**, and **➗ Formula Cheatsheets**.
   - **🔊 Text-to-Speech Audio Notes**: Listen to 1-minute and 5-minute summaries aloud like a mini-podcast.
   - **📄 1-Page Exam Cheat Sheet**: Printable ultra-dense layout combining formulas, keywords, and definitions on one sheet.
   - **🎯 Mock University Exam Paper**: Complete examination paper with Section A, B, C questions and scoring rubrics.
   - **📦 Multi-Format Exporting**: 1-click exports to **PDF (.pdf)**, **Word Document (.doc)**, **Plain Text (.txt)**, **Visual Note Snapshot Image (.png)**, **Markdown (.md)**, and **Printable View**.
   - **💬 Chat with Your Notes**: Offline AI Q&A assistant with 1-click `📌 Pin to Doubts Notepad`.
4. **AI Academic Mentorship & Practice**:
   - **🤖 Student Supporter** (`supporter.html`): 24/7 AI tutor chat box connected to OpenAI platform (GPT-4o/GPT-3.5) with full lecture context integration.
   - **🧠 Enhanced Practice Quizzes** (`quiz.html`): Auto-generated multi-type assessments (MCQs, True/False, and Fill-in-the-Blank) with customizable question counts (5, 10, 15 Qs), live score progress tracker, and detailed question-by-question AI explanations.
5. **Focus & Skill Tree**:
   - **⏱️ Pomodoro Timer & Streaks** (`focus.html`): 25/5/15 minute study intervals and daily streak tracking.
   - **🌲 Semester Skill Tree & Knowledge Graph**: Visual map of course progression and prerequisite connections across all lectures.

---

## ▶️ Running the Project

1. **Open terminal in `backend/`**:
   ```bash
   cd backend
   npm install
   ```
2. **Start the server**:
   ```bash
   npm start
   ```
3. **Open Browser**: Navigate to `http://localhost:5000`.

