// ================================================================
// aiEngine.js - The "brain" of NotesPilot AI
// ----------------------------------------------------------------
// This works completely offline using rule-based text processing,
// so the project runs with ZERO error and ZERO API key out of the box.
//
// If you later want real GPT / Gemini powered notes, plug your key
// into upgradeWithRealAI() at the bottom of this file - every other
// part of the app already calls the functions below, so nothing else
// needs to change.
// ================================================================

const IMPORTANT_TRIGGERS = [
  "important", "remember", "note that", "exam", "viva",
  "interview", "must know", "keep in mind", "key point"
];

const STOPWORDS = new Set([
  "the", "is", "a", "an", "and", "or", "of", "to", "in", "on", "for",
  "with", "that", "this", "it", "as", "are", "was", "were", "be",
  "by", "at", "from", "so", "we", "you", "i", "they", "he", "she",
  "but", "if", "then", "than", "which", "will", "can", "not"
]);

// Split raw transcript into clean sentences (handles massive 300k word notes efficiently)
function splitSentences(text) {
  if (!text) return [];
  // Clean newlines and consecutive whitespace
  const normalized = text.replace(/\r\n/g, "\n").replace(/\s+/g, " ");
  // Efficient sentence splitting with safety
  const rawSentences = normalized.split(/(?<=[.?!])\s+/);
  return rawSentences
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
}

// Pull out the most frequent meaningful words as keywords
function extractKeywords(text, limit = 15) {
  if (!text) return [];
  // For massive 300k word texts, sample up to 100,000 words for lightning fast frequency indexing
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .slice(0, 100000)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));

  const freq = {};
  words.forEach((w) => (freq[w] = (freq[w] || 0) + 1));

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

// Detect sentences that look like definitions: "X is Y" / "X means Y" / "X refers to Y"
function extractDefinitions(sentences) {
  const defRegex = /^(.{2,40}?)\s+(is|means|refers to|is called|is known as)\s+(.+)$/i;
  const defs = [];
  // Limit search space if handling tens of thousands of sentences
  const searchSample = sentences.length > 3000 ? sentences.slice(0, 3000) : sentences;
  for (const s of searchSample) {
    if (defs.length >= 30) break;
    const match = s.match(defRegex);
    if (match) {
      defs.push({ term: match[1].trim(), definition: s.trim() });
    }
  }
  return defs;
}

// Detect simple formulas / equations (contains = or common math symbols)
function extractFormulas(sentences) {
  const searchSample = sentences.length > 3000 ? sentences.slice(0, 3000) : sentences;
  return searchSample.filter((s) => /[=+\-*/^]/.test(s) && /\d/.test(s)).slice(0, 25);
}

// Flag sentences that contain "important", "remember", "exam" etc.
function extractHighlights(sentences) {
  const searchSample = sentences.length > 4000 ? sentences.slice(0, 4000) : sentences;
  return searchSample.filter((s) =>
    IMPORTANT_TRIGGERS.some((trigger) => s.toLowerCase().includes(trigger))
  ).slice(0, 35);
}

// Group sentences into headed sections (dynamically scaled for up to 300k words)
function buildStructuredNotes(sentences, keywords) {
  if (sentences.length === 0) return [];
  // Target between 8 and 50 well-structured sections regardless of total text length
  const targetSections = Math.min(50, Math.max(6, Math.ceil(sentences.length / 40)));
  const CHUNK = Math.max(4, Math.ceil(sentences.length / targetSections));
  
  const sections = [];
  for (let i = 0; i < sentences.length; i += CHUNK) {
    const chunk = sentences.slice(i, i + CHUNK);
    if (chunk.length === 0) continue;

    // Heading = the keyword that appears most inside this chunk, else "Topic N"
    const chunkText = chunk.slice(0, 8).join(" ").toLowerCase();
    const headingWord = keywords.find((k) => chunkText.includes(k));
    const heading = headingWord
      ? headingWord.charAt(0).toUpperCase() + headingWord.slice(1)
      : `Topic Section ${sections.length + 1}`;

    sections.push({
      heading,
      bullets: chunk
    });
  }
  return sections;
}

// Extractive summary: picks the most "information dense" sentences (optimized for 300k words)
function generateSummary(sentences, mode = "short") {
  if (sentences.length === 0) return "";
  const targetCount = mode === "detailed" ? Math.min(25, Math.ceil(sentences.length * 0.15))
    : mode === "5min" ? Math.min(10, sentences.length)
    : Math.min(4, sentences.length); // "short" / 1-min summary

  // For massive documents, sample evenly across beginning, middle and end
  const sample = sentences.length > 500 
    ? [...sentences.slice(0, 100), ...sentences.slice(Math.floor(sentences.length/2) - 50, Math.floor(sentences.length/2) + 50), ...sentences.slice(-100)]
    : sentences;

  const keywords = extractKeywords(sample.join(" "), 10);
  const keywordSet = new Set(keywords);

  const scored = sample.map((s, idx) => {
    const sWords = s.toLowerCase().split(" ");
    let matchCount = 0;
    for (const w of sWords) {
      if (keywordSet.has(w)) matchCount++;
    }
    const score = sWords.length + matchCount * 4;
    return { s, idx, score };
  });

  const top = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, targetCount)
    .sort((a, b) => a.idx - b.idx); // restore original order

  return top.map((t) => t.s).join(" ");
}

// Generate catchy mnemonics & acronym memory cues for lists and key terms
function generateMnemonics(sentences, definitions, keywords) {
  const mnemonics = [];
  
  // 1. Mnemonics from extracted definitions or keywords (grouped 3-5 items)
  const terms = definitions.length >= 3 
    ? definitions.map(d => d.term) 
    : keywords.slice(0, 8).map(k => k.charAt(0).toUpperCase() + k.slice(1));

  if (terms.length >= 3) {
    const chunk = terms.slice(0, Math.min(5, terms.length));
    const letters = chunk.map(t => t.charAt(0).toUpperCase()).join("");
    
    // Funny / memorable word associative dictionary
    const wordBank = {
      A: "Awesome", B: "Brilliant", C: "Clever", D: "Dynamic", E: "Epic",
      F: "Fantastic", G: "Giant", H: "Heroic", I: "Insightful", J: "Jumpy",
      K: "Kinetic", L: "Logical", M: "Master", N: "Nimble", O: "Optimal",
      P: "Power", Q: "Quick", R: "Rapid", S: "Smart", T: "Turbo",
      U: "Ultra", V: "Vivid", W: "Wise", X: "Xtreme", Y: "Yielding", Z: "Zealous"
    };

    const phraseWords = letters.split("").map(l => wordBank[l] || "Key");
    const phrase = phraseWords.join(" ") + " (" + chunk.join(" → ") + ")";

    mnemonics.push({
      acronym: letters,
      phrase,
      targetConcepts: chunk,
      tip: `Remember "${letters}" to quickly recall: ${chunk.join(", ")}.`
    });
  }

  // 2. Rhyme / pattern mnemonic for key definitions
  definitions.slice(0, 3).forEach((d) => {
    mnemonics.push({
      acronym: d.term.slice(0, 4).toUpperCase(),
      phrase: `Think: "${d.term}" connects to ${d.definition.slice(0, 50)}...`,
      targetConcepts: [d.term],
      tip: `Memory Hook: Connect "${d.term}" with its core trigger: "${d.definition.split(" ").slice(0, 6).join(" ")}"`
    });
  });

  return mnemonics;
}

// Generate an ELI5 (Explain Like I'm 5) simplified breakdown for confusion spots
function generateEli5(snippet, subject = "General") {
  if (!snippet || typeof snippet !== "string") return null;
  const clean = snippet.trim();
  const sentences = splitSentences(clean);
  const keywords = extractKeywords(clean);

  const mainConcept = keywords[0] ? (keywords[0].charAt(0).toUpperCase() + keywords[0].slice(1)) : subject;
  
  return {
    originalText: clean,
    concept: mainConcept,
    eli5Summary: `In plain words: Think of ${mainConcept} like a real-world tool that solves a specific job. Instead of overcomplicating it, focus on how inputs go in and results come out without worrying about dense jargon.`,
    analogy: `💡 Real-World Analogy: Imagine ${mainConcept} is like a recipe in a kitchen—you follow the steps in order to get the guaranteed final dish.`,
    prerequisite: `Before diving deeper, make sure you understand the foundational basics of ${keywords[1] || subject}.`
  };
}

// Generate Mock University-Format Exam Question Paper with Rubric
function generateExamPaper(notes, subject = "Lecture Examination") {
  const safeNotes = notes || {};
  const definitions = Array.isArray(safeNotes.definitions) ? safeNotes.definitions : [];
  const sections = Array.isArray(safeNotes.sections) ? safeNotes.sections : [];
  const formulas = Array.isArray(safeNotes.formulas) ? safeNotes.formulas : [];
  const highlights = Array.isArray(safeNotes.highlights) ? safeNotes.highlights : [];
  const keywords = Array.isArray(safeNotes.keywords) ? safeNotes.keywords : [];

  // Section A: 2 Marks Each (5 Questions = 10 Marks)
  const sectionA = [];
  definitions.slice(0, 3).forEach((d, i) => {
    if (d && d.term) {
      sectionA.push({
        id: `A${sectionA.length + 1}`,
        question: `Define "${d.term}" and state its primary significance.`,
        marks: 2,
        modelAnswer: d.definition || d.term,
        rubric: "1 Mark for exact definition; 1 Mark for practical application."
      });
    }
  });

  if (formulas.length > 0) {
    sectionA.push({
      id: `A${sectionA.length + 1}`,
      question: `State the mathematical formula or expression for: "${formulas[0]}".`,
      marks: 2,
      modelAnswer: formulas[0],
      rubric: "1 Mark for correct notation; 1 Mark for defining terms."
    });
  }

  let kwIdx = 0;
  while (sectionA.length < 5 && kwIdx < keywords.length) {
    const kw = keywords[kwIdx];
    if (kw && typeof kw === "string") {
      sectionA.push({
        id: `A${sectionA.length + 1}`,
        question: `What is meant by the key term "${kw.charAt(0).toUpperCase() + kw.slice(1)}"?`,
        marks: 2,
        modelAnswer: `"${kw}" is a foundational concept in ${subject} representing a core operational mechanism.`,
        rubric: "2 Marks for clear explanation in 2-3 sentences."
      });
    }
    kwIdx++;
  }

  while (sectionA.length < 5) {
    sectionA.push({
      id: `A${sectionA.length + 1}`,
      question: `Explain the primary objective and scope of ${subject}.`,
      marks: 2,
      modelAnswer: `${subject} focuses on systematic understanding, core theoretical principles, and practical application.`,
      rubric: "2 Marks for concise conceptual summary."
    });
  }

  // Section B: 5 Marks Each (3 Questions = 15 Marks)
  const sectionB = [];
  sections.slice(0, 3).forEach((s, i) => {
    const heading = s.heading || `Topic ${i + 1}`;
    const bullets = Array.isArray(s.bullets) ? s.bullets : [];
    const bulletList = bullets.slice(0, 2).map(b => "• " + b).join("\n") || `• Core principle of ${heading}`;
    sectionB.push({
      id: `B${sectionB.length + 1}`,
      question: `Explain the fundamental concepts of "${heading}" with reference to the following points:\n${bulletList}`,
      marks: 5,
      modelAnswer: `Detailed explanation covering: ${bullets.join(". ") || heading}`,
      rubric: "2 Marks for conceptual clarity; 2 Marks for point breakdown; 1 Mark for structured presentation."
    });
  });

  while (sectionB.length < 3) {
    const fallbackTopic = keywords[sectionB.length] || `Core Principle ${sectionB.length + 1}`;
    sectionB.push({
      id: `B${sectionB.length + 1}`,
      question: `Discuss the structural importance and real-world implementation of "${fallbackTopic}" in ${subject}.`,
      marks: 5,
      modelAnswer: `Analytical discussion of ${fallbackTopic} and its operational role in modern systems.`,
      rubric: "2 Marks for conceptual understanding; 2 Marks for implementation; 1 Mark for practical examples."
    });
  }

  // Section C: 10 Marks Each (2 Questions = 20 Marks)
  const sectionC = [];
  if (sections.length > 0) {
    const s1 = sections[0];
    const s1Heading = s1.heading || subject;
    const s1Bullets = Array.isArray(s1.bullets) ? s1.bullets : [];
    sectionC.push({
      id: "C1",
      question: `Critically analyze "${s1Heading}" in detail. Discuss its background, core mechanisms, real-world applications, and potential challenges.`,
      marks: 10,
      modelAnswer: `Comprehensive essay response integrating: ${s1Bullets.join(" ")}. Highlights: ${highlights.join(" ")}`,
      rubric: "3 Marks for introduction & definition; 4 Marks for mechanism & working; 3 Marks for real-world example & critical analysis."
    });
  } else {
    sectionC.push({
      id: "C1",
      question: `Provide a comprehensive analysis of the foundational principles of ${subject}. Discuss core mechanisms and architecture.`,
      marks: 10,
      modelAnswer: `In-depth analysis of ${subject} principles and methodologies.`,
      rubric: "3 Marks for background; 4 Marks for technical analysis; 3 Marks for modern application."
    });
  }

  if (sections.length > 1) {
    const s2 = sections[1];
    const s2Heading = s2.heading || "Advanced Concepts";
    const s2Bullets = Array.isArray(s2.bullets) ? s2.bullets : [];
    sectionC.push({
      id: "C2",
      question: `Provide an end-to-end breakdown of "${s2Heading}". How does it interact with other components of ${subject}?`,
      marks: 10,
      modelAnswer: `Structured breakdown: ${s2Bullets.join(" ")}`,
      rubric: "4 Marks for workflow steps; 3 Marks for inter-concept relationships; 3 Marks for conclusion."
    });
  } else {
    sectionC.push({
      id: "C2",
      question: `Synthesize the major takeaways of ${subject}. Highlight key definitions, formulas, and critical exam review points.`,
      marks: 10,
      modelAnswer: `Synthesis of all lecture sections and highlights.`,
      rubric: "4 Marks for comprehensive scope; 3 Marks for formula accuracy; 3 Marks for synthesis."
    });
  }

  const totalMarks = (sectionA.length * 2) + (sectionB.length * 5) + (sectionC.length * 10);

  return {
    subject,
    examTitle: `${subject} - Comprehensive Examination Paper`,
    totalMarks,
    duration: "90 Minutes",
    instructions: [
      "Answer all questions in Section A (2 Marks each).",
      "Answer any 3 questions in Section B (5 Marks each).",
      "Answer all questions in Section C (10 Marks each)."
    ],
    sections: {
      sectionA: { title: "Section A: Short Definitions & Concepts", marksPerQuestion: 2, questions: sectionA },
      sectionB: { title: "Section B: Conceptual & Analytical Questions", marksPerQuestion: 5, questions: sectionB },
      sectionC: { title: "Section C: Long Essay & Problem Solving", marksPerQuestion: 10, questions: sectionC }
    },
    sectionA,
    sectionB,
    sectionC
  };
}

// "Chat with Your Notes" - Semantic context doubt answering
function answerDoubt(query, notes = {}, transcript = "") {
  // Support both (query, notes) and legacy (notes, query) signatures
  if (typeof query === "object" && typeof notes === "string") {
    const temp = query;
    query = notes;
    notes = temp || {};
  }

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return { answer: "Please ask a question about your lecture notes.", sources: [] };
  }

  const safeNotes = notes || {};
  const definitions = safeNotes.definitions || [];
  const formulas = safeNotes.formulas || [];
  const sections = safeNotes.sections || [];

  const queryTerms = query.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w));
  
  if (queryTerms.length === 0) {
    return {
      answer: "I couldn't detect specific lecture keywords in your question. Try asking about a specific term, formula, or concept from this class!",
      sources: []
    };
  }

  // 1. Check definitions
  const matchedDef = definitions.find(d => 
    d && d.term && (queryTerms.some(t => d.term.toLowerCase().includes(t) || (d.definition && d.definition.toLowerCase().includes(t))))
  );

  if (matchedDef) {
    return {
      answer: `According to your lecture notes, **${matchedDef.term}** is defined as:\n\n> "${matchedDef.definition}"`,
      sources: [`Definition: ${matchedDef.term}`],
      confidence: "High"
    };
  }

  // 2. Check formulas
  if (query.toLowerCase().includes("formula") || query.toLowerCase().includes("equation")) {
    if (formulas && formulas.length > 0) {
      return {
        answer: `Here are the formulas recorded in this lecture:\n\n` + formulas.map(f => `- \`${f}\``).join("\n"),
        sources: ["Extracted Formulas"],
        confidence: "High"
      };
    }
  }

  // 3. Score lecture sections
  let bestSection = null;
  let highestScore = 0;

  sections.forEach(sec => {
    let score = 0;
    const secText = ((sec.heading || "") + " " + ((sec.bullets || []).join(" "))).toLowerCase();
    queryTerms.forEach(t => {
      if (secText.includes(t)) score += 3;
    });
    if (score > highestScore) {
      highestScore = score;
      bestSection = sec;
    }
  });

  if (bestSection && highestScore > 0) {
    return {
      answer: `In the topic **${bestSection.heading}**, the lecture explains:\n\n` + 
        (bestSection.bullets || []).map(b => `• ${b}`).join("\n\n"),
      sources: [`Topic Section: ${bestSection.heading}`],
      confidence: "High"
    };
  }

  // 4. Fallback search on raw transcript sentences
  const sentences = splitSentences(transcript);
  const matchedSentences = sentences.filter(s => {
    const sLower = s.toLowerCase();
    return queryTerms.some(t => sLower.includes(t));
  });

  if (matchedSentences.length > 0) {
    return {
      answer: `Here is what was mentioned in the lecture regarding your question:\n\n` +
        matchedSentences.slice(0, 3).map(s => `> "${s}"`).join("\n\n"),
      sources: ["Lecture Transcript"],
      confidence: "Medium"
    };
  }

  return {
    answer: `I searched your lecture notes for "${queryTerms.join(", ")}", but couldn't find a direct match. Check the **1-Minute Summary** or the **Keywords** list in your notes to review related topics.`,
    sources: [],
    confidence: "Low"
  };
}



// ================================================================
// 🎙️ SMART PUNCTUATION & SPEECH FORMATTING ENGINE
// ================================================================
function applySmartPunctuation(rawText) {
  if (!rawText || typeof rawText !== "string") return "";
  let text = rawText.trim();

  // 1. Remove leading orphaned punctuation (e.g. "' .", ".", ",", "?")
  text = text.replace(/^['"`\s.,!?:;]+/, "").trim();

  // 2. Spoken Punctuation Command Replacements (case-insensitive)
  const spokenRules = [
    { pattern: /\b(new paragraph|next paragraph)\b/gi, replacement: "\n\n" },
    { pattern: /\b(new line|next line)\b/gi, replacement: "\n" },
    { pattern: /\b(question mark)\b/gi, replacement: "?" },
    { pattern: /\b(exclamation mark|exclamation point)\b/gi, replacement: "!" },
    { pattern: /\b(full stop|period)\b/gi, replacement: "." },
    { pattern: /\b(comma)\b/gi, replacement: "," },
    { pattern: /\b(semicolon)\b/gi, replacement: ";" },
    { pattern: /\b(colon)\b/gi, replacement: ":" },
    { pattern: /\b(open quote|start quote)\b/gi, replacement: ' "' },
    { pattern: /\b(close quote|end quote)\b/gi, replacement: '" ' },
    { pattern: /\b(open bracket|open parenthesis)\b/gi, replacement: " (" },
    { pattern: /\b(close bracket|close parenthesis)\b/gi, replacement: ") " },
    { pattern: /\b(dash|hyphen)\b/gi, replacement: " - " }
  ];

  spokenRules.forEach(({ pattern, replacement }) => {
    text = text.replace(pattern, replacement);
  });

  // 3. Normalize Spaces Around Punctuation & Segment Continuous Run-on Clauses
  text = text
    .replace(/\s+([.,!?:;])/g, "$1") // Remove space before punctuation: "word ." -> "word."
    .replace(/([.,!?:;])(?=[a-zA-Z0-9])/g, "$1 ") // Ensure space after punctuation: "word.Next" -> "word. Next"
    .replace(/([.!?])\s*([.!?])+/g, "$1") // Avoid duplicate punctuation: "..", "?." -> "."
    .replace(/,\s*,+/g, ",") // Avoid duplicate commas
    .replace(/[ \t]+/g, " "); // Normalize consecutive spaces

  // 4. Merge accidental single-line breaks that broke sentences in half
  text = text.replace(/([^\n.!?])\n([a-z0-9])/gi, "$1 $2");

  // Segment mid-stream transition words: "... computing however traditional ..." -> "... computing. However, traditional ..."
  const transitionWords = [
    "however", "therefore", "furthermore", "moreover", "for example",
    "for instance", "in addition", "consequently", "meanwhile",
    "on the other hand", "in contrast", "as a result", "firstly", "secondly", "finally"
  ];
  transitionWords.forEach((tw) => {
    const midRegex = new RegExp(`(?<![.!?\\n;:])\\s+\\b(${tw})\\b`, "gi");
    text = text.replace(midRegex, ". $1");
  });

  // Segment before major list intros if mid-stream
  text = text.replace(/(?<![.!?\n;:])\s+\b(the key (benefits|points|components|features|steps) are as follows|the following points|the following steps|the following list)\b/gi, ". $1");

  // Clean duplicate punctuation and spaces after segmentation
  text = text.replace(/([.!?])\s*([.!?])+/g, "$1").replace(/[ \t]+/g, " ");

  // 5. Sentence Splitting & Semantic Grammar Inference
  const paragraphs = text.split(/\n{2,}/);
  const formattedParagraphs = paragraphs.map((para) => {
    let cleanPara = para.trim();
    if (!cleanPara) return "";

    // Split paragraph into raw clauses/sentences
    const sentenceTokens = cleanPara.split(/(?<=[.?!])\s+/);
    const processedSentences = sentenceTokens.map((sent) => {
      let s = sent.trim();
      if (!s) return "";

      // A) Transition Word Commas: "However", "Therefore", "For example", etc.
      transitionWords.forEach((tw) => {
        const twRegex = new RegExp(`^(${tw})(?![,])\\s+`, "i");
        s = s.replace(twRegex, (match, p1) => {
          const cap = p1.charAt(0).toUpperCase() + p1.slice(1);
          return `${cap}, `;
        });
      });

      // B) Colon Inference for List Intros: "as follows", "such as following", "the following steps"
      s = s.replace(/\b(as follows|the following points|the following steps|the following list|consists of the following)\b(?!\s*[:])/gi, "$1:");

      // C) Interrogative Question Detection: Sentences starting with question words
      const questionStarters = /^(who|what|when|where|why|how|which|whose|whom|is|are|was|were|can|could|would|should|will|do|does|did|have|has|had)\b/i;
      if (questionStarters.test(s)) {
        if (s.endsWith(".")) {
          s = s.slice(0, -1) + "?";
        } else if (!s.endsWith("?") && !s.endsWith("!")) {
          s = s + "?";
        }
      } else if (!s.endsWith(".") && !s.endsWith("?") && !s.endsWith("!") && !s.endsWith(":")) {
        // Add closing period if sentence has at least 3 words and no trailing punctuation
        if (s.split(/\s+/).length >= 3) {
          s = s + ".";
        }
      }

      // D) Sentence Auto-Capitalization (First character upper case)
      s = s.charAt(0).toUpperCase() + s.slice(1);

      // E) Pronoun 'I' and Proper Acronyms
      s = s.replace(/\b(i)\b/g, "I");
      s = s.replace(/\b(python)\b/gi, "Python");
      s = s.replace(/\b(ai)\b/gi, "AI");
      s = s.replace(/\b(ml)\b/gi, "ML");
      s = s.replace(/\b(api)\b/gi, "API");
      s = s.replace(/\b(html)\b/gi, "HTML");
      s = s.replace(/\b(css)\b/gi, "CSS");
      s = s.replace(/\b(sql)\b/gi, "SQL");

      return s;
    });

    return processedSentences.filter(Boolean).join(" ");
  });

  return formattedParagraphs.filter(Boolean).join("\n\n");
}

// ================================================================
// 🗣️ SLANG & CONVERSATIONAL FILLER NORMALIZATION ENGINE
// ================================================================
const SLANG_DICTIONARY = [
  // Spoken / Collegiate Contractions
  { pattern: /\bgonna\b/gi, replacement: "going to" },
  { pattern: /\bwanna\b/gi, replacement: "want to" },
  { pattern: /\bgotta\b/gi, replacement: "have to" },
  { pattern: /\bkinda\b/gi, replacement: "somewhat" },
  { pattern: /\bsorta\b/gi, replacement: "somewhat" },
  { pattern: /\blemme\b/gi, replacement: "let me" },
  { pattern: /\bgimme\b/gi, replacement: "give me" },
  { pattern: /\bdunno\b/gi, replacement: "do not know" },
  { pattern: /\bimma\b/gi, replacement: "I am going to" },
  { pattern: /\bcuz\b/gi, replacement: "because" },
  { pattern: /\b'cause\b/gi, replacement: "because" },
  { pattern: /\bprolly\b/gi, replacement: "probably" },
  { pattern: /\bain't\b/gi, replacement: "is not" },
  { pattern: /\by'all\b/gi, replacement: "you all" },
  
  // Internet / Text Abbreviations
  { pattern: /\bbtw\b/gi, replacement: "by the way" },
  { pattern: /\btbh\b/gi, replacement: "to be honest" },
  { pattern: /\bfyi\b/gi, replacement: "for your information" },
  { pattern: /\basap\b/gi, replacement: "as soon as possible" },
  { pattern: /\bidk\b/gi, replacement: "I do not know" },
  { pattern: /\btl;?dr\b/gi, replacement: "in summary" },
  { pattern: /\bimo\b/gi, replacement: "in my perspective" },
  { pattern: /\bimho\b/gi, replacement: "in my perspective" },
  { pattern: /\brn\b/gi, replacement: "right now" },
  { pattern: /\bnp\b/gi, replacement: "no problem" },
  { pattern: /\bgg\b/gi, replacement: "good" },
  { pattern: /\bw\/\b/gi, replacement: "with" },
  { pattern: /\bw\/o\b/gi, replacement: "without" },

  // Informal / Colloquial Expressions -> Academic Lecture Phrasing
  { pattern: /\bsuper fast\b/gi, replacement: "highly performant" },
  { pattern: /\ba bunch of\b/gi, replacement: "multiple" },
  { pattern: /\ba lot of\b/gi, replacement: "numerous" },
  { pattern: /\blots of\b/gi, replacement: "many" },
  { pattern: /\btons of\b/gi, replacement: "extensive" },
  { pattern: /\bheaps of\b/gi, replacement: "substantial" },
  { pattern: /\bhit a wall\b/gi, replacement: "encountered a limitation" },
  { pattern: /\bbuggy\b/gi, replacement: "error-prone" },
  { pattern: /\bhacks\b/gi, replacement: "techniques" },
  { pattern: /\bno cap\b/gi, replacement: "certainly" },
  { pattern: /\bfor real\b/gi, replacement: "indeed" },
  { pattern: /\bprops to\b/gi, replacement: "credit to" },
  { pattern: /\bheads up\b/gi, replacement: "note that" },
  { pattern: /\bbig deal\b/gi, replacement: "significant factor" },
  { pattern: /\btoss out\b/gi, replacement: "discard" },
  { pattern: /\brip out\b/gi, replacement: "remove" },
  { pattern: /\bhook up\b/gi, replacement: "integrate" },
  { pattern: /\bfix up\b/gi, replacement: "refactor" }
];

const SPEECH_FILLERS = [
  /\b(um+|uh+|er+|ah+)\b[\s,]*/gi,
  /\b(like\s+like|you\s+know\s+what\s+i\s+mean)\b[\s,]*/gi,
  /\b(you know|i mean|so yeah|right right|basically|literally)\b[\s,]*/gi
];

// ================================================================
// 🛡️ 1. OVERLAPPING SPEECH & CLASSROOM CHATTER CLEANUP
// ================================================================
const CHATTER_SIDE_PHRASES = [
  /\b(hey\s+pass\s+(me\s+)?(the\s+)?(pen|pencil|notes|book|paper))\b/gi,
  /\b(what\s+page\s+(is\s+it|are\s+we\s+on))\b/gi,
  /\b(did\s+you\s+(understand|get|hear)\s+that)\b/gi,
  /\b(can\s+you\s+hear\s+(him|her|them|the\s+teacher|the\s+sir))\b/gi,
  /\b(what\s+did\s+(he|she|the\s+prof|the\s+teacher|sir|ma'?am)\s+say)\b/gi,
  /\b(is\s+attendance\s+(taken|done|over))\b/gi,
  /\b(shh+|be\s+quiet|stop\s+talking|shut\s+up)\b/gi,
  /\b(bro\s+wait|wait\s+bro|one\s+sec|hold\s+on\s+a\s+sec)\b/gi,
  /\b(what\s+time\s+is\s+it|when\s+is\s+(this\s+class|lunch|break))\b/gi,
  /\b(give\s+me\s+your\s+phone)\b/gi
];

function cleanOverlappingSpeechAndChatter(text) {
  if (!text || typeof text !== "string") return { cleanedText: "", removedCount: 0 };
  let cleaned = text;
  let count = 0;

  // A) Strip known non-lecture side chatter patterns
  CHATTER_SIDE_PHRASES.forEach((pattern) => {
    if (pattern.test(cleaned)) {
      const matches = cleaned.match(pattern);
      if (matches) count += matches.length;
      cleaned = cleaned.replace(pattern, " ");
    }
  });

  // B) Deduplicate adjacent repeated clauses & word clusters (Acoustic Echo / Cross-Talk)
  // e.g. "today we will today we will discuss" -> "today we will discuss"
  cleaned = cleaned.replace(/\b([a-zA-Z0-9_]{2,}(?:\s+[a-zA-Z0-9_]{2,}){0,8})\s+\1\b/gi, (match, phrase) => {
    count++;
    return phrase;
  });

  // C) Single word stutter repeat: "the the", "and and", "in in"
  cleaned = cleaned.replace(/\b([a-zA-Z]{2,})\s+\1\b/gi, (match, word) => {
    count++;
    return word;
  });

  // Clean trailing punctuation before spaces: "data ." -> "data."
  cleaned = cleaned.replace(/\s+([.,!?:;])/g, "$1");
  cleaned = cleaned.replace(/[ \t]+/g, " ").trim();
  return { cleanedText: cleaned, removedCount: count };
}

// ================================================================
// 🗣️ 2. MUMBLE & WHISPER RECOGNITION ENHANCER
// ================================================================
const MUMBLE_PHONETIC_MAP = [
  // Slurred Gerund restoration (-in' -> -ing)
  { pattern: /\b([a-zA-Z]{3,})in'\b/gi, replacement: "$1ing" },
  { pattern: /\b(talkin|runnin|workin|learnin|readin|writin|computin|testin|analyzin|buildin|codin|solvin|programmin)\b/gi, 
    replacement: (m) => m + "g" },

  // Mumbled phonetic slurs & fast contractions
  { pattern: /\bwhaddya\b/gi, replacement: "what do you" },
  { pattern: /\bwhatcha\b/gi, replacement: "what are you" },
  { pattern: /\bhafta\b/gi, replacement: "have to" },
  { pattern: /\btryna\b/gi, replacement: "trying to" },
  { pattern: /\boutta\b/gi, replacement: "out of" },
  { pattern: /\bspose\b/gi, replacement: "suppose" },
  { pattern: /\b'spose\b/gi, replacement: "suppose" },
  { pattern: /\bgotchu\b/gi, replacement: "understood" },
  { pattern: /\bgotcha\b/gi, replacement: "understood" },
  { pattern: /\by'know\b/gi, replacement: "you know" },
  { pattern: /\bwoulda\b/gi, replacement: "would have" },
  { pattern: /\bcoulda\b/gi, replacement: "could have" },
  { pattern: /\bshoulda\b/gi, replacement: "should have" },
  { pattern: /\bmusta\b/gi, replacement: "must have" },
  { pattern: /\bgimme\b/gi, replacement: "give me" },
  { pattern: /\blemme\b/gi, replacement: "let me" },
  { pattern: /\bwanna\b/gi, replacement: "want to" },
  { pattern: /\bgonna\b/gi, replacement: "going to" },
  { pattern: /\bkinda\b/gi, replacement: "kind of" },
  { pattern: /\bsorta\b/gi, replacement: "sort of" },
  { pattern: /\bdunno\b/gi, replacement: "do not know" },
  { pattern: /\bprolly\b/gi, replacement: "probably" },
  { pattern: /\bcuz\b/gi, replacement: "because" }
];

function enhanceMumblesAndWhispers(text) {
  if (!text || typeof text !== "string") return { enhancedText: "", enhancedCount: 0 };
  let enhanced = text;
  let count = 0;

  MUMBLE_PHONETIC_MAP.forEach(({ pattern, replacement }) => {
    if (pattern.test(enhanced)) {
      const matches = enhanced.match(pattern);
      if (matches) count += matches.length;
      enhanced = enhanced.replace(pattern, replacement);
    }
  });

  return { enhancedText: enhanced.trim(), enhancedCount: count };
}

// ================================================================
// 📖 3. CONTENT-BASED DOMAIN SPELLING CORRECTION ENGINE
// ================================================================
const CONTENT_SPELLING_DICTIONARY = [
  // Computer Science, Programming & Data
  { pattern: /\b(pie\s*thon|py\s*thon)\b/gi, replacement: "Python" },
  { pattern: /\b(see\s*plus\s*plus|c\s*plus\s*plus)\b/gi, replacement: "C++" },
  { pattern: /\b(see\s*sharp|c\s*sharp)\b/gi, replacement: "C#" },
  { pattern: /\b(sequel|s\s*q\s*l)\b/gi, replacement: "SQL" },
  { pattern: /\b(no\s*sequel|no\s*sql)\b/gi, replacement: "NoSQL" },
  { pattern: /\b(new\s*pie|num\s*pie|numpai)\b/gi, replacement: "NumPy" },
  { pattern: /\b(pan\s*das)\b/gi, replacement: "Pandas" },
  { pattern: /\b(mat\s*plot\s*lib|match\s*plot\s*lib)\b/gi, replacement: "Matplotlib" },
  { pattern: /\b(tensor\s*flow)\b/gi, replacement: "TensorFlow" },
  { pattern: /\b(pie\s*torch|py\s*torch)\b/gi, replacement: "PyTorch" },
  { pattern: /\b(java\s*script)\b/gi, replacement: "JavaScript" },
  { pattern: /\b(type\s*script)\b/gi, replacement: "TypeScript" },
  { pattern: /\b(node\s*j\s*s|node\s*js)\b/gi, replacement: "Node.js" },
  { pattern: /\b(react\s*j\s*s|react\s*js)\b/gi, replacement: "React.js" },
  { pattern: /\b(git\s*hub)\b/gi, replacement: "GitHub" },
  { pattern: /\b(doc\s*ker)\b/gi, replacement: "Docker" },
  { pattern: /\b(kuberneties|koobernetes)\b/gi, replacement: "Kubernetes" },
  { pattern: /\b(post\s*grass|post\s*gres)\b/gi, replacement: "PostgreSQL" },
  { pattern: /\b(mongo\s*d\s*b|mongo\s*db)\b/gi, replacement: "MongoDB" },
  { pattern: /\b(polly\s*morphism|poly\s*morphism)\b/gi, replacement: "polymorphism" },
  { pattern: /\b(n\s*capsulation|in\s*capsulation)\b/gi, replacement: "encapsulation" },
  { pattern: /\b(in\s*heritance)\b/gi, replacement: "inheritance" },
  { pattern: /\b(ab\s*straction)\b/gi, replacement: "abstraction" },
  { pattern: /\b(a\s*synchronous)\b/gi, replacement: "asynchronous" },
  { pattern: /\b(bull\s*e\s*an|bool\s*e\s*an)\b/gi, replacement: "Boolean" },
  { pattern: /\b(re\s*cursion)\b/gi, replacement: "recursion" },
  { pattern: /\b(big\s*oh\s*notation|big\s*o\s*notation)\b/gi, replacement: "Big-O notation" },
  { pattern: /\b(dike\s*stra|dijkstra)\b/gi, replacement: "Dijkstra" },

  // Mathematics & Statistics
  { pattern: /\b(deriv\s*ative)\b/gi, replacement: "derivative" },
  { pattern: /\b(integ\s*ral)\b/gi, replacement: "integral" },
  { pattern: /\b(poly\s*nomial)\b/gi, replacement: "polynomial" },
  { pattern: /\b(quad\s*ratic)\b/gi, replacement: "quadratic" },
  { pattern: /\b(i\s*can\s*value|eigen\s*value)\b/gi, replacement: "eigenvalue" },
  { pattern: /\b(i\s*can\s*vector|eigen\s*vector)\b/gi, replacement: "eigenvector" },
  { pattern: /\b(stock\s*astic|stocastic)\b/gi, replacement: "stochastic" },
  { pattern: /\b(a\s*symptom\s*tick|asymptotic)\b/gi, replacement: "asymptotic" },
  { pattern: /\b(pie\s*thagoras|pythagoras\s*theorem)\b/gi, replacement: "Pythagorean theorem" },
  { pattern: /\b(fibo\s*nacci)\b/gi, replacement: "Fibonacci" },
  { pattern: /\b(bayes\s*theorem)\b/gi, replacement: "Bayes' Theorem" },
  { pattern: /\b(central\s*limit\s*theorem)\b/gi, replacement: "Central Limit Theorem" },

  // Physics, Electrical & Mechanical Engineering
  { pattern: /\b(thermo\s*dynamics)\b/gi, replacement: "thermodynamics" },
  { pattern: /\b(electro\s*magnetism)\b/gi, replacement: "electromagnetism" },
  { pattern: /\b(quantum\s*mechanics)\b/gi, replacement: "quantum mechanics" },
  { pattern: /\b(fourier\s*transform)\b/gi, replacement: "Fourier Transform" },
  { pattern: /\b(laplace\s*transform)\b/gi, replacement: "Laplace Transform" },
  { pattern: /\b(photo\s*electric\s*effect)\b/gi, replacement: "photoelectric effect" },
  { pattern: /\b(boltz\s*mann)\b/gi, replacement: "Boltzmann" },
  { pattern: /\b(planck'?s\s*constant)\b/gi, replacement: "Planck's constant" },
  { pattern: /\b(heisen\s*berg)\b/gi, replacement: "Heisenberg" },

  // Biology, Chemistry & Medicine
  { pattern: /\b(photo\s*synth\s*says|photo\s*synthesis)\b/gi, replacement: "photosynthesis" },
  { pattern: /\b(car\s*ball\s*hydrate|carbo\s*hydrate)\b/gi, replacement: "carbohydrate" },
  { pattern: /\b(mighty\s*chondria|mito\s*chondria)\b/gi, replacement: "mitochondria" },
  { pattern: /\b(chromo\s*somes)\b/gi, replacement: "chromosomes" },
  { pattern: /\b(endoplasmic\s*reticulum)\b/gi, replacement: "endoplasmic reticulum" },
  { pattern: /\b(golgi\s*apparatus)\b/gi, replacement: "Golgi apparatus" },
  { pattern: /\b(crispr|c\s*r\s*i\s*s\s*p\s*r)\b/gi, replacement: "CRISPR" },
  { pattern: /\b(polymerase\s*chain\s*reaction|p\s*c\s*r)\b/gi, replacement: "PCR" },
  { pattern: /\b(covalent\s*bond)\b/gi, replacement: "covalent bond" },
  { pattern: /\b(stoichiometry)\b/gi, replacement: "stoichiometry" }
];

function applyContentBasedSpelling(text, subjectTag = "") {
  if (!text || typeof text !== "string") return { correctedText: "", correctedCount: 0 };
  let corrected = text;
  let count = 0;

  CONTENT_SPELLING_DICTIONARY.forEach(({ pattern, replacement }) => {
    if (pattern.test(corrected)) {
      const matches = corrected.match(pattern);
      if (matches) count += matches.length;
      corrected = corrected.replace(pattern, replacement);
    }
  });

  return { correctedText: corrected, correctedCount: count };
}

// ================================================================
// 🔠 4. AUTOMATIC CONTEXT & PROPER NOUN CAPITALIZATION ENGINE
// ================================================================
const ACRONYMS_LIST = [
  "AI", "ML", "DL", "NLP", "API", "HTML", "CSS", "SQL", "NoSQL", "CPU", "GPU", "TPU",
  "RAM", "ROM", "SSD", "HDD", "REST", "JSON", "XML", "HTTP", "HTTPS", "TCP", "UDP", "IP",
  "DNS", "SSH", "FTP", "UUID", "JWT", "OOP", "DOM", "URI", "URL", "GUI", "CLI", "OS",
  "SDK", "IDE", "AWS", "GCP", "BERT", "LLM", "GPT", "SVM", "KNN", "PCA", "CNN", "RNN",
  "LSTM", "DNA", "RNA", "mRNA", "ATP", "CRISPR", "NASA", "WHO", "UNESCO", "IEEE", "ACM", "MIT"
];

const PROPER_NAMES_LIST = [
  "Guido van Rossum", "Alan Turing", "Ada Lovelace", "Albert Einstein", "Isaac Newton",
  "Charles Darwin", "Pythagoras", "Euclid", "Euler", "Fibonacci", "Dijkstra", "Bernoulli",
  "Gauss", "Fourier", "Laplace", "Bayes", "Boltzmann", "Planck", "Schrodinger", "Heisenberg",
  "Mendel", "Watson", "Crick", "Turing Machine", "Newton's Laws", "Moore's Law"
];

const TECH_NAMES_LIST = [
  "Python", "JavaScript", "TypeScript", "Java", "C++", "C#", "Rust", "Go", "Swift",
  "Kotlin", "PHP", "Ruby", "Scala", "MATLAB", "React", "Angular", "Vue", "Next.js",
  "Express", "Django", "Flask", "FastAPI", "Spring Boot", "TensorFlow", "PyTorch",
  "NumPy", "Pandas", "Matplotlib", "Seaborn", "Scikit-learn", "Linux", "Ubuntu",
  "Windows", "macOS", "Android", "iOS", "Git", "GitHub", "Docker", "Kubernetes",
  "PostgreSQL", "MySQL", "MongoDB", "Redis", "SQLite"
];

function applyAutomaticCapitalization(text) {
  if (!text || typeof text !== "string") return "";
  let formatted = text;

  // 1. Acronyms Capitalization
  ACRONYMS_LIST.forEach((acr) => {
    const acrRegex = new RegExp(`\\b(${acr})\\b`, "gi");
    formatted = formatted.replace(acrRegex, acr);
  });

  // 2. Proper Names & Scientists
  PROPER_NAMES_LIST.forEach((name) => {
    const nameRegex = new RegExp(`\\b(${escapeRegex(name)})\\b`, "gi");
    formatted = formatted.replace(nameRegex, name);
  });

  // 3. Technology & Framework Names
  TECH_NAMES_LIST.forEach((tech) => {
    const techRegex = new RegExp(`\\b(${escapeRegex(tech)})\\b`, "gi");
    formatted = formatted.replace(techRegex, tech);
  });

  // 4. Standalone Pronoun 'I' and contractions ('I'm', 'I've', 'I'll', 'I'd')
  formatted = formatted
    .replace(/\b(i)\b/g, "I")
    .replace(/\b(i)'(m|ve|ll|d)\b/g, "I'$2")
    .replace(/\b(i)\s+am\b/g, "I am");

  // 5. Sentence Boundaries & Paragraph Starters Capitalization
  const paragraphs = formatted.split(/\n{2,}/);
  const capitalizedParas = paragraphs.map((para) => {
    const sentences = para.split(/(?<=[.?!])\s+/);
    const capitalizedSentences = sentences.map((sent) => {
      let s = sent.trim();
      if (!s) return "";
      return s.charAt(0).toUpperCase() + s.slice(1);
    });
    return capitalizedSentences.filter(Boolean).join(" ");
  });

  return capitalizedParas.filter(Boolean).join("\n\n");
}

function normalizeSlangAndFillers(text) {
  if (!text || typeof text !== "string") return { cleanedText: "", slangCount: 0 };
  let cleaned = text;
  let count = 0;

  // 1. Clean Overlapping Speech & Classroom Chatter
  const overlapRes = cleanOverlappingSpeechAndChatter(cleaned);
  cleaned = overlapRes.cleanedText;
  count += overlapRes.removedCount;

  // 2. Enhance Mumbles & Whispered Contractions
  const mumbleRes = enhanceMumblesAndWhispers(cleaned);
  cleaned = mumbleRes.enhancedText;
  count += mumbleRes.enhancedCount;

  // 3. Content-Based Domain Academic Spelling
  const spellRes = applyContentBasedSpelling(cleaned);
  cleaned = spellRes.correctedText;
  count += spellRes.correctedCount;

  // 4. Slang Dictionary Replacements
  SLANG_DICTIONARY.forEach(({ pattern, replacement }) => {
    if (pattern.test(cleaned)) {
      const matches = cleaned.match(pattern);
      if (matches) count += matches.length;
      cleaned = cleaned.replace(pattern, replacement);
    }
  });

  // 5. Speech Filler Removal
  SPEECH_FILLERS.forEach((fillerRegex) => {
    if (fillerRegex.test(cleaned)) {
      const matches = cleaned.match(fillerRegex);
      if (matches) count += matches.length;
      cleaned = cleaned.replace(fillerRegex, " ");
    }
  });

  // 6. Automatic Capitalization
  cleaned = applyAutomaticCapitalization(cleaned);

  // Clean spacing
  cleaned = cleaned.replace(/[ \t]+/g, " ").trim();

  return { cleanedText: cleaned, slangCount: count };
}

// ================================================================
// 🧠 AUTOMATIC SMART STRUCTURE & MEANING RECOGNITION
// ================================================================
function detectSmartStructure(text) {
  if (!text) {
    return {
      headings: [],
      definitions: [],
      keyPoints: [],
      examples: [],
      formulas: [],
      questions: [],
      conclusions: [],
      slangCount: 0
    };
  }

  const { cleanedText, slangCount } = normalizeSlangAndFillers(text);
  const formattedText = applySmartPunctuation(cleanedText);
  const sentences = splitSentences(formattedText);

  // 1. Headings & Subheadings Recognition
  const headingKeywords = /^(topic|chapter|section|unit|module|overview of|introduction to|part \d|deep dive into|next we discuss|let's examine|moving on to)\b/i;
  const headings = [];
  sentences.forEach((s) => {
    if (headingKeywords.test(s) || (s.length < 50 && s.endsWith(":") && !s.includes(" "))) {
      headings.push(s.replace(/[:.]$/, "").trim());
    }
  });

  // 2. Definitions & Key Terminology
  const definitions = extractDefinitions(sentences);

  // 3. Key Points & Highlights
  const keyPoints = extractHighlights(sentences);

  // 4. Practical Examples Recognition
  const exampleRegex = /^(for example|for instance|consider (a|the|an)|as an example|an example of this|take the case of|such as when|illustrated by)\b/i;
  const examples = sentences
    .filter((s) => exampleRegex.test(s) || /\b(for example|for instance)\b/i.test(s))
    .slice(0, 15);

  // 5. Formulas & Mathematical / Computational Equations
  const formulas = extractFormulas(sentences);

  // 6. Questions & Problem Inquiries
  const questions = sentences
    .filter((s) => s.endsWith("?") || /^(what|why|how|which|can|could|would|is|are|does|do)\b/i.test(s))
    .slice(0, 12);

  // 7. Conclusions & Summaries
  const conclusionRegex = /^(in conclusion|to summarize|in summary|finally|the bottom line is|to wrap up|in brief|as a result of all this)\b/i;
  const conclusions = sentences
    .filter((s) => conclusionRegex.test(s) || /\b(in conclusion|to summarize|in summary)\b/i.test(s))
    .slice(0, 8);

  return {
    headings,
    definitions,
    keyPoints,
    examples,
    formulas,
    questions,
    conclusions,
    slangCount,
    cleanedText: formattedText
  };
}

// Master function: transcript -> full smart notes object (with Slang Normalization, Structure Recognition, and mnemonics)
function generateSmartNotes(transcript) {
  const startTime = Date.now();

  // 1. Slang Normalization & Structural Recognition
  const structure = detectSmartStructure(transcript);
  const formattedTranscript = structure.cleanedText || applySmartPunctuation(transcript);

  // 2. Linguistic Component Extraction
  const sentences = splitSentences(formattedTranscript);
  const keywords = extractKeywords(formattedTranscript);
  const definitions = structure.definitions.length > 0 ? structure.definitions : extractDefinitions(sentences);
  const formulas = structure.formulas.length > 0 ? structure.formulas : extractFormulas(sentences);
  const highlights = structure.keyPoints.length > 0 ? structure.keyPoints : extractHighlights(sentences);
  const examples = structure.examples;
  const conclusions = structure.conclusions;
  const headings = structure.headings;
  const questions = structure.questions;
  const sections = buildStructuredNotes(sentences, keywords);
  const mnemonics = generateMnemonics(sentences, definitions, keywords);

  const processingTimeMs = Date.now() - startTime;

  return {
    keywords,
    definitions,
    formulas,
    highlights,
    examples,
    conclusions,
    headings,
    questions,
    sections,
    mnemonics,
    summaryShort: generateSummary(sentences, "short"),
    summary5min: generateSummary(sentences, "5min"),
    summaryDetailed: generateSummary(sentences, "detailed"),
    sentenceCount: sentences.length,
    formattedTranscript,
    slangCount: structure.slangCount,
    processingTimeMs
  };
}

// Helper to escape regex
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Build a rich, robust quiz (MCQ + True/False + Fill in the blank) from lecture notes & transcript
function generateQuiz(notes, rawTranscript = "", subject = "Lecture", targetCount = 10) {
  // If notes object is missing or invalid, generate on the fly from transcript
  let safeNotes = notes;
  if (!safeNotes || typeof safeNotes !== "object" || !safeNotes.keywords) {
    if (rawTranscript && typeof rawTranscript === "string") {
      safeNotes = generateSmartNotes(rawTranscript);
    } else {
      safeNotes = { keywords: [], definitions: [], sections: [], highlights: [], formulas: [] };
    }
  }

  const definitions = Array.isArray(safeNotes.definitions) ? safeNotes.definitions : [];
  const keywords = Array.isArray(safeNotes.keywords) ? safeNotes.keywords : [];
  const sections = Array.isArray(safeNotes.sections) ? safeNotes.sections : [];
  const highlights = Array.isArray(safeNotes.highlights) ? safeNotes.highlights : [];
  const formulas = Array.isArray(safeNotes.formulas) ? safeNotes.formulas : [];

  // Extract all clean sentences from transcript or summaries as fallback pool
  const allSentences = splitSentences(
    rawTranscript ||
    safeNotes.formattedTranscript ||
    (sections.map(s => s.bullets.join(" ")).join(" ")) ||
    safeNotes.summaryDetailed ||
    safeNotes.summaryShort ||
    ""
  );

  const fallbackKeywords = keywords.length > 0
    ? keywords
    : ["concept", "process", "framework", "analysis", "system", "method", "structure", "principle"];

  const capitalize = (str) => str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
  const questions = [];
  let qCounter = 1;

  // -------------------------------------------------------------
  // 1. DEFINITION-BASED MCQs & FILL-IN-THE-BLANKS
  // -------------------------------------------------------------
  definitions.forEach((d, idx) => {
    if (!d.term || !d.definition) return;
    const termClean = d.term.trim();
    const termCap = capitalize(termClean);

    // Distractor terms from other definitions or keywords
    const otherTerms = definitions
      .filter(other => other.term.toLowerCase() !== termClean.toLowerCase())
      .map(other => capitalize(other.term.trim()));

    const distractorWords = keywords
      .filter(k => k.toLowerCase() !== termClean.toLowerCase())
      .map(k => capitalize(k));

    const candidateDistractors = [...new Set([...otherTerms, ...distractorWords])];
    const pickedDistractors = shuffle(candidateDistractors).slice(0, 3);

    // Fallback generic distractors if needed
    while (pickedDistractors.length < 3) {
      const generic = capitalize(fallbackKeywords[pickedDistractors.length % fallbackKeywords.length]);
      if (!pickedDistractors.includes(generic) && generic.toLowerCase() !== termClean.toLowerCase()) {
        pickedDistractors.push(generic);
      } else {
        pickedDistractors.push(`Concept ${pickedDistractors.length + 1}`);
      }
    }

    const mcqOptions = shuffle([termCap, ...pickedDistractors]);

    // Question 1A: Concept Definition MCQ
    questions.push({
      id: `q-def-mcq-${idx + 1}`,
      type: "mcq",
      difficulty: "Medium",
      question: `Which concept or term is defined by the statement: "${d.definition}"?`,
      options: mcqOptions,
      answer: termCap,
      explanation: `"${termCap}" is defined as: "${d.definition}".`
    });

    // Question 1B: Fill-in-the-blank (Blanking the term)
    const blankedDef = d.definition.replace(new RegExp(escapeRegex(termClean), "i"), "________");
    questions.push({
      id: `q-def-blank-${idx + 1}`,
      type: "fill-in-the-blank",
      difficulty: "Easy",
      question: `Complete the definition: "${blankedDef}"`,
      answer: termCap,
      explanation: `The missing term is "${termCap}". Definition: "${d.definition}".`
    });
  });

  // -------------------------------------------------------------
  // 2. SECTION & TOPIC APPLICATION MCQs
  // -------------------------------------------------------------
  sections.forEach((sec, idx) => {
    if (!sec.heading || !sec.bullets || sec.bullets.length === 0) return;
    const correctHeading = sec.heading.trim();

    const otherHeadings = sections
      .filter(s => s.heading.toLowerCase() !== correctHeading.toLowerCase())
      .map(s => s.heading.trim());

    const distractorHeadings = keywords
      .filter(k => k.toLowerCase() !== correctHeading.toLowerCase())
      .map(k => capitalize(k));

    const combined = [...new Set([...otherHeadings, ...distractorHeadings])];
    const picked = shuffle(combined).slice(0, 3);
    while (picked.length < 3) {
      picked.push(`Unit Module ${picked.length + 1}`);
    }

    const options = shuffle([correctHeading, ...picked]);
    const bullet = sec.bullets[Math.min(idx % sec.bullets.length, sec.bullets.length - 1)];

    questions.push({
      id: `q-sec-mcq-${idx + 1}`,
      type: "mcq",
      difficulty: "Medium",
      question: `In this lecture, which topic directly covers: "${bullet}"?`,
      options,
      answer: correctHeading,
      explanation: `This key point is discussed under the section "${correctHeading}".`
    });
  });

  // -------------------------------------------------------------
  // 3. FORMULA / EQUATION QUESTIONS
  // -------------------------------------------------------------
  formulas.forEach((f, idx) => {
    questions.push({
      id: `q-form-${idx + 1}`,
      type: "fill-in-the-blank",
      difficulty: "Hard",
      question: `Identify the mathematical/logical expression noted in class: "${f.replace(/\d+/g, "___")}"`,
      answer: f,
      explanation: `The full expression recorded is: "${f}".`
    });
  });

  // -------------------------------------------------------------
  // 4. BALANCED TRUE / FALSE QUESTIONS (True & False variations)
  // -------------------------------------------------------------
  const statementPool = highlights.length > 0 ? highlights : allSentences.slice(0, 8);
  statementPool.slice(0, 6).forEach((sentence, idx) => {
    if (!sentence || sentence.length < 15) return;

    if (idx % 2 === 0) {
      // Genuine TRUE statement
      questions.push({
        id: `q-tf-${idx + 1}`,
        type: "true-false",
        difficulty: "Easy",
        question: `True or False: "${sentence}"`,
        options: ["True", "False"],
        answer: "True",
        explanation: `True. This statement is accurate and directly noted in the lecture.`
      });
    } else {
      // Smart FALSE modification
      let falseSentence = sentence;
      if (/\bis\b/i.test(sentence) && !/\bis not\b/i.test(sentence)) {
        falseSentence = sentence.replace(/\bis\b/i, "is strictly not");
      } else if (/\bcan\b/i.test(sentence)) {
        falseSentence = sentence.replace(/\bcan\b/i, "cannot under any circumstances");
      } else if (/\ballows\b/i.test(sentence)) {
        falseSentence = sentence.replace(/\ballows\b/i, "prohibits");
      } else if (/\bimportant\b/i.test(sentence)) {
        falseSentence = sentence.replace(/\bimportant\b/i, "unimportant and obsolete");
      } else if (/\brequires\b/i.test(sentence)) {
        falseSentence = sentence.replace(/\brequires\b/i, "does not require");
      } else {
        falseSentence = `Contrary to standard principles, ${sentence.charAt(0).toLowerCase() + sentence.slice(1)} is entirely false.`;
      }

      questions.push({
        id: `q-tf-${idx + 1}`,
        type: "true-false",
        difficulty: "Medium",
        question: `True or False: "${falseSentence}"`,
        options: ["True", "False"],
        answer: "False",
        explanation: `False. The correct lecture principle is: "${sentence}".`
      });
    }
  });

  // -------------------------------------------------------------
  // 5. RESILIENT FALLBACK: If sentence pool was very small
  // -------------------------------------------------------------
  if (questions.length < 5 && allSentences.length > 0) {
    allSentences.slice(0, 5).forEach((s, idx) => {
      const words = s.split(/\s+/).filter(w => w.length > 4 && !STOPWORDS.has(w.toLowerCase()));
      if (words.length > 0) {
        const targetWord = capitalize(words[0].replace(/[^a-zA-Z]/g, ""));
        const blanked = s.replace(new RegExp(escapeRegex(targetWord), "i"), "________");
        
        const candidateDistractors = fallbackKeywords
          .filter(k => k.toLowerCase() !== targetWord.toLowerCase())
          .map(k => capitalize(k));
        const picked = shuffle(candidateDistractors).slice(0, 3);
        while (picked.length < 3) picked.push(`Option ${picked.length + 1}`);

        questions.push({
          id: `q-fallback-${idx + 1}`,
          type: "mcq",
          difficulty: "Easy",
          question: `Complete the lecture statement: "${blanked}"`,
          options: shuffle([targetWord, ...picked]),
          answer: targetWord,
          explanation: `The correct term is "${targetWord}". Full context: "${s}".`
        });
      }
    });
  }

  // Final fallback if lecture has minimal text
  if (questions.length === 0) {
    questions.push({
      id: "q-basic-1",
      type: "true-false",
      difficulty: "Easy",
      question: `True or False: Lecture notes for "${subject}" were successfully saved in NotesPilot AI.`,
      options: ["True", "False"],
      answer: "True",
      explanation: `True. Your lecture notes are saved and ready for study.`
    });
  }

  // Shuffle and balance questions
  const shuffledQuestions = shuffle(questions);
  const target = Math.min(shuffledQuestions.length, Math.max(5, targetCount || 10));
  return shuffledQuestions.slice(0, target);
}

// Generate structured day-by-day study schedule
function generateStudyPlan(lectures, targetDateStr, hoursPerDay = 2) {
  const targetDate = new Date(targetDateStr);
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  const diffTime = Math.max(0, targetDate.getTime() - startDate.getTime());
  let totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (totalDays <= 0) totalDays = 3; // default fallback 3-day sprint

  const days = [];
  const lecCount = lectures.length;

  for (let d = 0; d < totalDays; d++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + d);

    const dateStr = currentDate.toISOString().split("T")[0];
    const tasks = [];

    if (lecCount === 0) {
      tasks.push({
        id: `task-${d}-1`,
        title: "Record or import your first lecture notes to auto-populate study tasks",
        subject: "General",
        type: "notes",
        completed: false
      });
    } else {
      // Rotate through lectures for each day
      const lecIndex = d % lecCount;
      const lec = lectures[lecIndex];
      const subject = lec.subject || "General";

      if (d === totalDays - 1) {
        // Final Exam Review Day
        tasks.push({
          id: `task-${d}-1`,
          title: `🔥 Grand Review: Re-read 1-minute summaries for all ${lecCount} subjects`,
          subject: "All Subjects",
          type: "summary",
          completed: false
        });
        tasks.push({
          id: `task-${d}-2`,
          title: `🧠 Practice Speed Quiz across all saved lectures`,
          subject: "All Subjects",
          type: "quiz",
          completed: false
        });
      } else {
        // Daily focus area
        tasks.push({
          id: `task-${d}-1`,
          title: `📖 Read 5-Minute Summary & Key Points for "${subject}"`,
          subject,
          lectureId: lec.id,
          type: "summary",
          completed: false
        });
        tasks.push({
          id: `task-${d}-2`,
          title: `📌 Memorize ${lec.notes?.definitions?.length || 3} Definitions & Formulas`,
          subject,
          lectureId: lec.id,
          type: "definitions",
          completed: false
        });
        tasks.push({
          id: `task-${d}-3`,
          title: `🤖 Review Q&A with Student Supporter (${hoursPerDay}h session goal)`,
          subject,
          lectureId: lec.id,
          type: "supporter",
          completed: false
        });
      }
    }

    days.push({
      dayIndex: d + 1,
      date: dateStr,
      displayDate: currentDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
      tasks
    });
  }

  return {
    targetDate: targetDateStr,
    hoursPerDay: Number(hoursPerDay) || 2,
    totalDays,
    days
  };
}

// ----------------------------------------------------------------
// OPTIONAL UPGRADE: real AI (OpenAI / Gemini)
// Wire this up later if you want smarter notes than the offline
// rule-based engine above. Not required for the project to run.
// ----------------------------------------------------------------
async function upgradeWithRealAI(transcript, apiKey) {
  throw new Error(
    "Real AI upgrade not configured. Add your OpenAI/Gemini call here and " +
      "pass your API key in a .env file (never commit it to GitHub)."
  );
}

module.exports = {
  splitSentences,
  extractKeywords,
  extractDefinitions,
  extractFormulas,
  extractHighlights,
  generateSmartNotes,
  generateSummary,
  generateQuiz,
  generateStudyPlan,
  generateMnemonics,
  generateEli5,
  generateExamPaper,
  answerDoubt,
  applySmartPunctuation,
  normalizeSlangAndFillers,
  cleanOverlappingSpeechAndChatter,
  enhanceMumblesAndWhispers,
  applyContentBasedSpelling,
  applyAutomaticCapitalization,
  detectSmartStructure,
  upgradeWithRealAI
};
