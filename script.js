// script.js — expects data.json to be { "mc quiz title": "...", "questions": [ ... ] }
let quizData = [];
let currentQuestion = 0;

const quizTitleEl = document.getElementById("quizTitle");
const titleEl = document.getElementById("questionTitle");
const textEl = document.getElementById("questionText");
const audioEl = document.getElementById("audioPlayer");
const audioSource = document.getElementById("audioSource");
const optionsEl = document.getElementById("options");
const feedbackEl = document.getElementById("feedback");
const questionCounterEl = document.querySelector(".question-counter");

// ---------- Configuration: change these to make pauses longer/shorter ----------
const PAUSE_BEFORE_TOKEN_MS = 400; // ms pause before speaking "space" or "blank"
const PAUSE_AFTER_TOKEN_MS = 1030;  // ms pause after speaking "space" or "blank"
// ---------------------------------------------------------------------------

// Replace underscores with tokens for TTS so we can insert pauses around them.
// Single underscore "_" -> "__SPACE__"
// Two or more underscores "___" -> "__BLANK__"
function tokenizeForTTS(text) {
  if (typeof text !== "string") return text;
  return text.replace(/_+/g, match => (match.length === 1 ? "__SPACE__" : "__BLANK__"));
}

// Produce human-friendly text for ARIA/live-region (no tokens).
// single "_" -> " space " ; multiple "_" -> " blank "
function humanizeUnderscores(text) {
  if (typeof text !== "string") return text;
  return text.replace(/_+/g, match => (match.length === 1 ? " space " : " blank ")).replace(/\s{2,}/g, " ").trim();
}

// Small helper: speaks one utterance and returns a Promise that resolves when it ends.
function speakUtterance(text, options = {}) {
  const synth = window.speechSynthesis;
  if (!synth) return Promise.resolve();
  return new Promise(resolve => {
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = options.rate ?? 0.9;
    utter.pitch = options.pitch ?? 1;
    utter.volume = options.volume ?? 1;
    if (options.lang) utter.lang = options.lang;
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    synth.speak(utter);
  });
}

// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Speak text with pauses around tokens (__SPACE__, __BLANK__).
// Normal text segments are spoken normally. When encountering a token we:
//  - wait PAUSE_BEFORE_TOKEN_MS
//  - speak "space" or "blank" as its own utterance
//  - wait PAUSE_AFTER_TOKEN_MS
async function speakWithPauses(tokenizedText) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  // cancel any in-flight speech so new speech starts fresh
  synth.cancel();

  // Split into tokens and normal text. Keep tokens in the array.
  const parts = String(tokenizedText).split(/(__SPACE__|__BLANK__)/);

  for (const part of parts) {
    if (!part) continue;
    if (part === "__SPACE__") {
      await sleep(PAUSE_BEFORE_TOKEN_MS);
      await speakUtterance("space");
      await sleep(PAUSE_AFTER_TOKEN_MS);
    } else if (part === "__BLANK__") {
      await sleep(PAUSE_BEFORE_TOKEN_MS);
      await speakUtterance("blank");
      await sleep(PAUSE_AFTER_TOKEN_MS);
    } else {
      // normal text — speak it as a single utterance
      await speakUtterance(part);
    }
  }
}

function logAndShowError(msg, err) {
  console.error(msg, err || "");
  if (feedbackEl) feedbackEl.textContent = msg;
  announceToScreenReader(msg);
}

async function loadData() {
  try {
    const response = await fetch("Q3eSE_LS0_U01_02_Listening_ActivitiesA_B_F.json");
    if (!response.ok) throw new Error("HTTP " + response.status + " " + response.statusText);
    const data = await response.json();

    if (!data || !Array.isArray(data.questions)) {
      throw new Error("data.json must be an object with a 'questions' array");
    }

    quizData = data.questions;
    if (quizTitleEl) quizTitleEl.textContent = data["mc quiz title"] || "MC Quiz";

    if (quizData.length === 0) {
      logAndShowError("No questions found in data.json.");
      return;
    }

    loadQuestion();
    announceToScreenReader((quizTitleEl ? quizTitleEl.textContent + " " : "") + "loaded. Question 1 of " + quizData.length);
  } catch (error) {
    logAndShowError("Failed to load quiz data. Please check that data.json exists and is valid JSON.", error);
  }
}

function announceToScreenReader(text) {
  try {
    // Use humanized text for the live region (no tokens here)
    const normalized = humanizeUnderscores(String(text));
    const announcement = document.createElement("div");
    announcement.setAttribute("role", "status");
    announcement.setAttribute("aria-live", "polite");
    announcement.className = "sr-only";
    announcement.textContent = normalized;
    document.body.appendChild(announcement);
    setTimeout(() => announcement.remove(), 1000);
  } catch (e) {
    // silent fallback
    console.log("announceToScreenReader error", e);
  }
}

// speakText now tokenizes and uses the speakWithPauses pipeline
function speakText(text) {
  const tokenized = tokenizeForTTS(String(text));
  speakWithPauses(tokenized).catch(() => { /* ignore errors */ });
}

// speakQuestion uses the chunked approach but uses speakWithPauses for each chunk.
// This preserves the existing pauses between question pieces and ensures underscores get pauses.
async function speakQuestion() {
  const synth = window.speechSynthesis;
  if (!synth || !quizData.length) return;
  const q = quizData[currentQuestion];
  const chunks = [];
  chunks.push("Question " + (currentQuestion + 1) + " of " + quizData.length);
  chunks.push(tokenizeForTTS(q.text));
  q.options.forEach((opt, i) => {
    const letter = String.fromCharCode(65 + i);
    chunks.push("Option " + letter);
    chunks.push(tokenizeForTTS(opt));
  });

  // Cancel any ongoing speech, then run chunks sequentially with a short gap between chunks.
  synth.cancel();
  for (const chunk of chunks) {
    // skip empty chunks
    if (!chunk || String(chunk).trim() === "") continue;
    await speakWithPauses(chunk);
    // short gap between chunks so items don't run together
    await sleep(250);
  }
}

function loadQuestion() {
  if (!quizData || quizData.length === 0) return;
  const q = quizData[currentQuestion];

  if (titleEl) {
    titleEl.textContent = "Question " + (currentQuestion + 1);
    titleEl.focus();
  }
  if (textEl) textEl.textContent = q.text; // keep visual text as-is (underscores visible)
  if (questionCounterEl) questionCounterEl.textContent = (quizTitleEl ? quizTitleEl.textContent + " — " : "") + "Question " + (currentQuestion + 1) + " of " + quizData.length;

  if (audioSource && audioEl) {
    audioSource.src = q.audio || "";
    audioEl.load();
  }

  if (feedbackEl) {
    feedbackEl.textContent = "";
    feedbackEl.classList.remove("correct", "incorrect");
  }

  if (!optionsEl) return;
  optionsEl.innerHTML = "";

  q.options.forEach((opt, index) => {
    const label = document.createElement("label");
    label.className = "option";

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "answer";
    radio.value = index;
    // Use humanized aria-label so screen readers announce "space" or "blank"
    radio.setAttribute("aria-label", "Option " + String.fromCharCode(65 + index) + ": " + humanizeUnderscores(opt));

    radio.addEventListener("change", () => {
      const letter = String.fromCharCode(65 + index);
      announceToScreenReader("Selected option " + letter);
      // speakText will handle tokenization + pauses
      setTimeout(() => speakText("Option " + letter + ": " + opt), 200);
    });

    label.appendChild(radio);
    label.appendChild(document.createTextNode(" " + opt));
    optionsEl.appendChild(label);
  });

  // Announce normalized (humanized) question text to screen reader
  announceToScreenReader((quizTitleEl ? quizTitleEl.textContent + ". " : "") + "Question " + (currentQuestion + 1) + " of " + quizData.length + ": " + q.text);
}

function checkAnswer() {
  const selected = document.querySelector('input[name="answer"]:checked');
  if (!selected) {
    if (feedbackEl) {
      feedbackEl.textContent = "Please select an option.";
      feedbackEl.classList.remove("correct", "incorrect");
    }
    speakText("Please select an option.");
    announceToScreenReader("Please select an option.");
    return;
  }

  const q = quizData[currentQuestion];
  const selectedIndex = Number(selected.value);
  if (selectedIndex === q.correct) {
    if (feedbackEl) {
      feedbackEl.textContent = "✓ Correct!";
      feedbackEl.classList.remove("incorrect");
      feedbackEl.classList.add("correct");
      feedbackEl.focus();
    }
    speakText("Correct answer.");
    announceToScreenReader("Correct answer.");
  } else {
    const correctText = q.options[q.correct];
    const correctLetter = String.fromCharCode(65 + q.correct);
    if (feedbackEl) {
      feedbackEl.textContent = "✗ Incorrect. Correct answer is Option " + correctLetter + ": " + correctText;
      feedbackEl.classList.remove("correct");
      feedbackEl.classList.add("incorrect");
      feedbackEl.focus();
    }
    // speak/announce normalized correct answer text (TTS gets tokenized and paused)
    speakText("Incorrect. The correct answer is option " + correctLetter + ": " + correctText);
    announceToScreenReader("Incorrect. The correct answer is option " + correctLetter + ": " + correctText);
  }
}

function nextQuestion() {
  if (currentQuestion < quizData.length - 1) {
    currentQuestion++;
    loadQuestion();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    announceToScreenReader("You are on the last question.");
  }
}

function prevQuestion() {
  if (currentQuestion > 0) {
    currentQuestion--;
    loadQuestion();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    announceToScreenReader("You are on the first question.");
  }
}

function stop() {
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  announceToScreenReader("Speech stopped.");
}

document.addEventListener("keydown", function (e) {
  if (e.key === "ArrowRight" || e.key === "End") nextQuestion();
  else if (e.key === "ArrowLeft" || e.key === "Home") prevQuestion();
});

// Expose for inline onclick handlers (index.html uses these)
window.checkAnswer = checkAnswer;
window.nextQuestion = nextQuestion;
window.prevQuestion = prevQuestion;
window.speakQuestion = speakQuestion;
window.stop = stop;

loadData();