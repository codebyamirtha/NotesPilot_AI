// ================================================================
// flashcards.js - Interactive 3D Flip Flashcards & Leitner SRS
// ================================================================

requireAuth();
renderNavbar("flashcards.html");

let currentDeck = null;
let currentCards = [];
let currentCardIndex = 0;
let isCardFlipped = false;

// DOM Elements
const deckSelect = document.getElementById("deck-select");
const emptyView = document.getElementById("flashcards-empty");
const workspaceView = document.getElementById("flashcards-workspace");
const flashcardElement = document.getElementById("flashcard-element");

const cardTypeTag = document.getElementById("card-type-tag");
const cardFrontContent = document.getElementById("card-front-content");
const cardBackContent = document.getElementById("card-back-content");
const cardHintText = document.getElementById("card-hint-text");

const cardCurrentIndex = document.getElementById("card-current-index");
const cardTotalCount = document.getElementById("card-total-count");
const deckSubjectTag = document.getElementById("deck-subject-tag");
const deckTeacherLabel = document.getElementById("deck-teacher-label");
const deckMasteryPercent = document.getElementById("deck-mastery-percent");
const leitnerFill = document.getElementById("leitner-fill");

const btnPrev = document.getElementById("btn-prev-card");
const btnNext = document.getElementById("btn-next-card");

// Simple markdown formatter helper
function formatFlashcardText(text) {
  if (!text) return "";
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n\n/g, "<br><br>")
    .replace(/\n/g, "<br>");
}

// 1. Load All Decks for Dropdown
async function loadAllDecks() {
  try {
    const data = await apiCall("/flashcards/all");
    const decks = data.decks || [];

    deckSelect.innerHTML = "";

    if (decks.length === 0) {
      emptyView.classList.remove("hidden");
      workspaceView.classList.add("hidden");
      deckSelect.innerHTML = "<option value=''>No lecture decks available</option>";
      return;
    }

    emptyView.classList.add("hidden");
    workspaceView.classList.remove("hidden");

    decks.forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d.lectureId;
      opt.textContent = `📚 ${d.subject || "Lecture"} (${d.totalCards} cards · ${d.masteryPercent}% mastered)`;
      deckSelect.appendChild(opt);
    });

    // Check if lectureId was passed in query params
    const urlParams = new URLSearchParams(window.location.search);
    const paramId = urlParams.get("lectureId");
    if (paramId && decks.some((d) => d.lectureId === paramId)) {
      deckSelect.value = paramId;
    }

    loadSelectedDeck();
  } catch (err) {
    console.error("Failed to load flashcard decks:", err);
    emptyView.classList.remove("hidden");
  }
}

// 2. Load Selected Deck Cards
async function loadSelectedDeck() {
  const lectureId = deckSelect.value;
  if (!lectureId) return;

  try {
    const data = await apiCall(`/flashcards/deck/${lectureId}`);
    currentDeck = data;
    currentCards = data.cards || [];
    currentCardIndex = 0;
    isCardFlipped = false;

    deckSubjectTag.textContent = data.subject || "Lecture";
    deckTeacherLabel.textContent = data.teacher ? `Teacher: ${data.teacher}` : "";
    cardTotalCount.textContent = currentCards.length;

    renderCard();
    updateMasteryProgress();
  } catch (err) {
    console.error("Failed to load deck cards:", err);
  }
}

// 3. Render Current Card
function renderCard() {
  if (!currentCards || currentCards.length === 0) return;

  const card = currentCards[currentCardIndex];
  isCardFlipped = false;
  if (flashcardElement) flashcardElement.classList.remove("flipped");

  cardCurrentIndex.textContent = currentCardIndex + 1;
  cardTypeTag.textContent = card.tag || "📌 Flashcard";
  cardFrontContent.innerHTML = formatFlashcardText(card.front);
  cardBackContent.innerHTML = formatFlashcardText(card.back);
  cardHintText.textContent = card.hint ? `💡 ${card.hint} · Tap or Space to flip` : "💡 Tap card or press Space to flip";

  btnPrev.disabled = currentCardIndex === 0;
  btnNext.disabled = currentCardIndex === currentCards.length - 1;
}

// 4. Flip Card Interaction
function flipCard() {
  if (!flashcardElement) return;
  isCardFlipped = !isCardFlipped;
  flashcardElement.classList.toggle("flipped", isCardFlipped);
}

// 5. Card Navigation
function nextCard() {
  if (currentCardIndex < currentCards.length - 1) {
    currentCardIndex++;
    renderCard();
  }
}

function prevCard() {
  if (currentCardIndex > 0) {
    currentCardIndex--;
    renderCard();
  }
}

function shuffleCurrentDeck() {
  if (!currentCards || currentCards.length < 2) return;
  for (let i = currentCards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [currentCards[i], currentCards[j]] = [currentCards[j], currentCards[i]];
  }
  currentCardIndex = 0;
  renderCard();
}

// 6. Leitner SRS Rating (1: Again, 2: Hard, 3: Good, 4: Easy)
async function rateCard(rating) {
  if (!currentCards || currentCards.length === 0) return;
  const card = currentCards[currentCardIndex];

  try {
    const res = await apiCall("/flashcards/review", "POST", {
      cardId: card.id,
      rating
    });

    if (res && res.updated) {
      card.box = res.updated.box;
      card.mastery = res.updated.mastery;
      updateMasteryProgress();
    }

    // Auto advance to next card after brief visual feedback
    if (currentCardIndex < currentCards.length - 1) {
      setTimeout(() => {
        nextCard();
      }, 200);
    }
  } catch (err) {
    console.error("Failed to record card review:", err);
  }
}

// 7. Update Deck Mastery Progress Bar
function updateMasteryProgress() {
  if (!currentCards || currentCards.length === 0) {
    deckMasteryPercent.textContent = "0%";
    leitnerFill.style.width = "0%";
    return;
  }

  let totalMastery = 0;
  currentCards.forEach((c) => {
    totalMastery += c.mastery || 0;
  });

  const avgMastery = Math.round(totalMastery / currentCards.length);
  deckMasteryPercent.textContent = `${avgMastery}%`;
  leitnerFill.style.width = `${avgMastery}%`;
}

// 8. Text-to-Speech Pronounce
function speakCardFront() {
  if (!currentCards || currentCards.length === 0) return;
  const card = currentCards[currentCardIndex];
  const textToSpeak = card.front.replace(/[*_#`]/g, "");
  speakText(textToSpeak);
}

function speakCardBack() {
  if (!currentCards || currentCards.length === 0) return;
  const card = currentCards[currentCardIndex];
  const textToSpeak = card.back.replace(/[*_#`]/g, "");
  speakText(textToSpeak);
}

// 9. Keyboard Shortcuts Listener
document.addEventListener("keydown", (e) => {
  // Ignore if user is inside an input or select
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") {
    return;
  }

  if (e.code === "Space" || e.key === " ") {
    e.preventDefault();
    flipCard();
  } else if (e.key === "1") {
    rateCard(1);
  } else if (e.key === "2") {
    rateCard(2);
  } else if (e.key === "3") {
    rateCard(3);
  } else if (e.key === "4") {
    rateCard(4);
  } else if (e.key === "ArrowLeft") {
    prevCard();
  } else if (e.key === "ArrowRight") {
    nextCard();
  } else if (e.key === "r" || e.key === "R") {
    if (isCardFlipped) speakCardBack();
    else speakCardFront();
  }
});

// Initialize on page load
loadAllDecks();
