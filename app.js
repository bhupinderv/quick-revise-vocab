// Vocabulary Revisor Lite: plain JavaScript version

// ---- State ----
let words = [];          // [{ word, meaning, status }]
let currentIndex = 0;
let correctCount = 0;
let wrongCount = 0;
let showMeaning = false;
let reverseMode = false; // false: Dutch → English, true: English → Dutch
let modalOpen = false;

// ---- Elements ----
const $ = (id) => document.getElementById(id);
const el = {
  modeLabel: $('modeLabel'), reverseBtn: $('reverseBtn'),
  card: $('card'), prompt: $('prompt'),
  answer: $('answer'), answerLabel: $('answerLabel'), answerText: $('answerText'),
  loader: $('loader'), loaderMsg: $('loaderMsg'), fileInput: $('fileInput'),
  progress: $('progress'), correct: $('correct'), wrong: $('wrong'), accuracy: $('accuracy'),
  enterAction: $('enterAction'),
  modal: $('modal'), modalTitle: $('modalTitle'), wrongList: $('wrongList'),
  modalX: $('modalX'), modalClose: $('modalClose'),
};

// ---- Loading ----
function parseVocab(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const i = line.indexOf('=');
      if (i === -1) return null; // skip malformed lines instead of crashing
      return { word: line.slice(0, i).trim(), meaning: line.slice(i + 1).trim() };
    })
    .filter((item) => item && item.word && item.meaning);
}

function setWords(list) {
  if (list.length === 0) {
    showLoader('No valid <code>dutch = english</code> lines found in that file.');
    return;
  }
  words = list;
  el.loader.hidden = true;
  el.card.hidden = false;
  startRound();
}

function showLoader(message) {
  el.loaderMsg.innerHTML = message;
  el.loader.hidden = false;
  el.card.hidden = true;
  render();
}

async function loadVocab() {
  try {
    const res = await fetch('vocab.txt', { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    setWords(parseVocab(await res.text()));
  } catch {
    // Happens when index.html is opened straight from disk (file://)
    showLoader('Could not load <code>vocab.txt</code> automatically.');
  }
}

el.fileInput.addEventListener('change', async () => {
  const file = el.fileInput.files[0];
  if (!file) return;
  setWords(parseVocab(await file.text()));
  el.fileInput.value = '';
});

// ---- Round logic ----
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function startRound() {
  currentIndex = 0;
  correctCount = 0;
  wrongCount = 0;
  showMeaning = false;
  words.forEach((w) => (w.status = undefined));
  shuffle(words); // new order every round
  render();
}

function accuracy() {
  const total = correctCount + wrongCount;
  return total === 0 ? 0 : Math.round((correctCount / total) * 100);
}

function mark(status) {
  words[currentIndex].status = status;
  if (status === 'correct') correctCount++;
  else wrongCount++;
  showMeaning = false;

  if (currentIndex < words.length - 1) {
    currentIndex++;
    render();
  } else {
    finishRound();
  }
}

function finishRound() {
  const missed = words.filter((w) => w.status === 'wrong');
  const pct = accuracy();

  el.wrongList.innerHTML = '';
  missed.forEach((w) => {
    const li = document.createElement('li');
    li.textContent = reverseMode ? `${w.meaning} = ${w.word}` : `${w.word} = ${w.meaning}`;
    el.wrongList.appendChild(li);
  });
  el.modalTitle.textContent = missed.length
    ? `Final result ${pct}%. Words you got wrong ❌`
    : `Final result ${pct}%. ✅ Great job! You got all words correct!`;

  modalOpen = true;
  el.modal.hidden = false;
  el.modalClose.focus();
  startRound();
}

function closeModal() {
  modalOpen = false;
  el.modal.hidden = true;
  el.modalClose.blur();
}

// ---- Reverse mode ----
function toggleReverse() {
  reverseMode = !reverseMode;
  showMeaning = false; // hide the answer so the flipped card isn't given away
  el.reverseBtn.blur(); // so Enter/Space don't press the button again
  render();
}

// ---- Rendering ----
function render() {
  el.modeLabel.textContent = reverseMode ? 'English → Dutch' : 'Dutch → English';

  const item = words[currentIndex];
  if (item) {
    el.prompt.textContent = reverseMode ? item.meaning : item.word;
    el.answerText.textContent = reverseMode ? item.word : item.meaning;
    el.answerLabel.textContent = reverseMode ? 'Dutch:' : 'English:';
  }
  el.answer.hidden = !showMeaning;

  el.progress.textContent = words.length ? `${currentIndex + 1} / ${words.length}` : '0 / 0';
  el.correct.textContent = correctCount;
  el.wrong.textContent = wrongCount;

  const pct = accuracy();
  el.accuracy.textContent = `Accuracy: ${pct}%`;
  el.accuracy.className =
    'accuracy ' + (pct >= 80 ? 'accuracy-high' : pct >= 50 ? 'accuracy-mid' : 'accuracy-low');

  el.enterAction.textContent = showMeaning ? 'mark correct' : 'show meaning';
}

// ---- Events ----
el.reverseBtn.addEventListener('click', toggleReverse);
el.modalX.addEventListener('click', closeModal);
el.modalClose.addEventListener('click', closeModal);
el.modal.addEventListener('click', (e) => { if (e.target === el.modal) closeModal(); });

document.addEventListener('keydown', (e) => {
  // While the results popup is open, Enter/Escape just close it
  if (modalOpen) {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
    return;
  }
  if (words.length === 0) return;

  if (e.key === 'Enter') {
    e.preventDefault();
    if (!showMeaning) {
      showMeaning = true;
      render();
    } else {
      mark('correct');
    }
  } else if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault(); // stop the page from scrolling
    if (showMeaning) mark('wrong');
  }
});

render();
loadVocab();
