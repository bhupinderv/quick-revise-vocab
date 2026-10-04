// Vocabulary Revisor Lite: plain JavaScript version
//
// Flow per word:
//   idle  --Start-->  thinking (word shown, 3–10 s countdown, user's choice)
//         --timer-->  revealed (answer shown, Correct / Wrong buttons)
//         --Correct/Wrong-->  thinking for the next word … until the round ends → finished → idle
//
// Rounds: Round 1 = every word in vocab.txt. Each next round = only the words marked
// wrong in the round before. Rounds continue until every word has been answered correctly.
//
// Hard words: from round HARD_ROUND on, the results popup offers a download of the words
// still wrong, in the same "dutch = english" format, so they can be uploaded as a new list.
// Own list: on the Start screen a .txt list can be uploaded; it's remembered on this device
// until "Use default list" is tapped.
//
//   'Back to previous word' re-opens ONLY the word just marked, so a mis-tap can be fixed.

const MIN_SECONDS = 3;                   // thinking time limits chosen by the user
const MAX_SECONDS = 10;
const DEFAULT_SECONDS = 5;
const TIME_KEY = 'vrl.thinkSeconds';     // remembered thinking time on this device
const HARD_ROUND = 5;                    // offer the "hard words" download after this round
const STORAGE_KEY = 'vrl.customList';    // remembered uploaded list: { name, text }

// ---- State ----
let allWords = [];       // full list from vocab.txt
let words = [];          // words in the current round: [{ word, meaning, status }]
let round = 1;
let currentIndex = 0;
let correctCount = 0;
let wrongCount = 0;
let phase = 'idle';      // 'idle' | 'thinking' | 'revealed' | 'finished'
let lastMarked = null;   // index of the word that can still be re-marked (only one step back)
let reverseMode = false; // false: Dutch → English, true: English → Dutch
let modalOpen = false;
let timerId = null;
let deadline = 0;
let thinkSeconds = loadThinkSeconds();
let listName = 'vocab.txt';
let lastMissed = [];      // words still wrong at the end of the latest round

// ---- Elements ----
const $ = (id) => document.getElementById(id);
const el = {
  modeLabel: $('modeLabel'), reverseBtn: $('reverseBtn'),
  card: $('card'), prompt: $('prompt'), idleHint: $('idleHint'),
  timer: $('timer'), timerSeconds: $('timerSeconds'), timerBar: $('timerBar'),
  answer: $('answer'), answerLabel: $('answerLabel'), answerText: $('answerText'),
  actions: $('actions'), startBtn: $('startBtn'), waitMsg: $('waitMsg'),
  judgeRow: $('judgeRow'), correctBtn: $('correctBtn'), wrongBtn: $('wrongBtn'),
  undoBtn: $('undoBtn'), undoWord: $('undoWord'), undoMark: $('undoMark'), modalUndo: $('modalUndo'),
  loader: $('loader'), loaderMsg: $('loaderMsg'), fileInput: $('fileInput'),
  progress: $('progress'), correct: $('correct'), wrong: $('wrong'), accuracy: $('accuracy'),
  modal: $('modal'), modalTitle: $('modalTitle'), wrongList: $('wrongList'),
  modalX: $('modalX'), modalClose: $('modalClose'), modalNext: $('modalNext'),
  timeBox: $('timeBox'), timeMinus: $('timeMinus'), timePlus: $('timePlus'), timeValue: $('timeValue'),
  listBox: $('listBox'), listName: $('listName'), listCount: $('listCount'), listMsg: $('listMsg'),
  uploadInput: $('uploadInput'), defaultListBtn: $('defaultListBtn'),
  hardBox: $('hardBox'), downloadBtn: $('downloadBtn'),
  modalSummary: $('modalSummary'), wrongHeading: $('wrongHeading'), roundNo: $('roundNo'),
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

function countEntryLines(text) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).length;
}

function setWords(list, name) {
  if (list.length === 0) {
    showLoader('No valid <code>dutch = english</code> lines found in that file.');
    return;
  }
  allWords = list;
  listName = name;
  el.loader.hidden = true;
  el.card.hidden = false;
  el.actions.hidden = false;
  setupRound(allWords, 1);
}

function showLoader(message) {
  el.loaderMsg.innerHTML = message;
  el.loader.hidden = false;
  el.card.hidden = true;
  el.actions.hidden = true;
  render();
}

function showListMsg(text, isError) {
  el.listMsg.textContent = text;
  el.listMsg.className = 'list-msg' + (isError ? ' list-msg-error' : '');
  el.listMsg.hidden = !text;
}

// Remembered uploaded list (localStorage can be unavailable, e.g. private mode)
function getSavedList() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}
function saveList(name, text) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ name, text })); } catch { /* not remembered */ }
}
function forgetList() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

async function loadDefaultVocab() {
  try {
    const res = await fetch('vocab.txt', { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    setWords(parseVocab(await res.text()), 'vocab.txt');
  } catch {
    // Happens when index.html is opened straight from disk (file://)
    showLoader('Could not load <code>vocab.txt</code> automatically.');
  }
}

async function loadVocab() {
  const saved = getSavedList();
  if (saved && saved.text) {
    const list = parseVocab(saved.text);
    if (list.length) {
      setWords(list, saved.name || 'my list');
      return;
    }
  }
  await loadDefaultVocab();
}

// Upload from the Start screen: replaces the current list and starts again at Round 1
async function handleUpload(file) {
  if (!file) return;
  let text;
  try { text = await file.text(); } catch {
    showListMsg('Could not read that file.', true);
    return;
  }
  const list = parseVocab(text);
  if (list.length === 0) {
    showListMsg(`No "dutch = english" lines found in ${file.name}. Your current list is unchanged.`, true);
    return;
  }
  saveList(file.name, text);
  setWords(list, file.name);
  const skipped = countEntryLines(text) - list.length;
  showListMsg(
    `✓ Loaded ${list.length} word${list.length > 1 ? 's' : ''} from ${file.name}` +
    (skipped ? ` (${skipped} line${skipped > 1 ? 's' : ''} skipped, no "=")` : ''),
    false
  );
}

el.uploadInput.addEventListener('change', async () => {
  await handleUpload(el.uploadInput.files[0]);
  el.uploadInput.value = '';
});

// Fallback picker shown only when vocab.txt can't be loaded
el.fileInput.addEventListener('change', async () => {
  const file = el.fileInput.files[0];
  if (!file) return;
  const list = parseVocab(await file.text());
  if (list.length) saveList(file.name, await file.text());
  setWords(list, file.name);
  el.fileInput.value = '';
});

el.defaultListBtn.addEventListener('click', async () => {
  forgetList();
  el.defaultListBtn.blur();
  await loadDefaultVocab();
  showListMsg('✓ Back to the default list', false);
});

// ---- Thinking time (3–10 s, chosen on the Start screen) ----
function clampSeconds(n) {
  n = Math.round(Number(n));
  if (!Number.isFinite(n)) return DEFAULT_SECONDS;
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, n));
}

function loadThinkSeconds() {
  try {
    const saved = localStorage.getItem(TIME_KEY);
    return saved === null ? DEFAULT_SECONDS : clampSeconds(saved);
  } catch { return DEFAULT_SECONDS; }
}

function changeThinkSeconds(delta) {
  if (phase !== 'idle') return; // only changeable on the Start screen
  thinkSeconds = clampSeconds(thinkSeconds + delta);
  try { localStorage.setItem(TIME_KEY, String(thinkSeconds)); } catch { /* not remembered */ }
  render();
}

el.timeMinus.addEventListener('click', () => changeThinkSeconds(-1));
el.timePlus.addEventListener('click', () => changeThinkSeconds(+1));

// ---- Hard words download ----
function todayStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function downloadHardWords() {
  if (!lastMissed.length) return;
  // Always "dutch = english" (same as vocab.txt) so the file can be uploaded again
  const lines = [
    `# Hard words after round ${round}, ${todayStamp()} (from ${listName})`,
    ...lastMissed.map((w) => `${w.word} = ${w.meaning}`),
  ];
  const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hard-words-${todayStamp()}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  el.downloadBtn.textContent = `✓ Downloaded (${lastMissed.length} words)`;
}

// ---- Round logic ----
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Prepare a round with the given words, then wait on the Start screen
function setupRound(list, n) {
  stopTimer();
  round = n;
  words = list.slice();
  currentIndex = 0;
  correctCount = 0;
  wrongCount = 0;
  phase = 'idle';
  lastMarked = null;
  words.forEach((w) => (w.status = undefined));
  shuffle(words); // new order every round
  render();
}

// Called once the end-of-round popup is dismissed
function advanceRound() {
  const missed = words.filter((w) => w.status === 'wrong');
  if (missed.length) setupRound(missed, round + 1); // only the wrong ones go again
  else setupRound(allWords, 1);                     // all learned → fresh game
}

function startGame() {
  if (phase !== 'idle' || words.length === 0) return;
  el.startBtn.blur();
  showListMsg('', false);
  startThinking();
}

// Show the current word and run the 5-second countdown
function startThinking() {
  stopTimer();
  phase = 'thinking';
  deadline = Date.now() + thinkSeconds * 1000;
  render();
  tick();
  timerId = setInterval(tick, 100);
}

function tick() {
  const msLeft = Math.max(0, deadline - Date.now());
  el.timerSeconds.textContent = Math.ceil(msLeft / 1000);
  el.timerBar.style.width = (msLeft / (thinkSeconds * 1000)) * 100 + '%';
  if (msLeft <= 0) reveal();
}

function stopTimer() {
  if (timerId !== null) clearInterval(timerId);
  timerId = null;
}

function reveal() {
  stopTimer();
  phase = 'revealed';
  render();
}

function accuracy() {
  const total = correctCount + wrongCount;
  return total === 0 ? 0 : Math.round((correctCount / total) * 100);
}

function mark(status) {
  if (phase !== 'revealed') return; // only after the answer is shown
  words[currentIndex].status = status;
  if (status === 'correct') correctCount++;
  else wrongCount++;
  lastMarked = currentIndex;

  if (currentIndex < words.length - 1) {
    currentIndex++;
    startThinking();
  } else {
    finishRound();
  }
}

// Go back to the previous word (one step only) and show its answer again
function undoLast() {
  if (lastMarked === null) return;
  stopTimer();
  const w = words[lastMarked];
  if (w.status === 'correct') correctCount--;
  else if (w.status === 'wrong') wrongCount--;
  w.status = undefined;
  currentIndex = lastMarked;
  lastMarked = null;     // can't go back any further than this
  modalOpen = false;     // in case we came from the end-of-round popup
  el.modal.hidden = true;
  el.undoBtn.blur();
  phase = 'revealed';
  render();
}

function finishRound() {
  stopTimer();
  phase = 'finished';
  const missed = words.filter((w) => w.status === 'wrong');
  lastMissed = missed;
  const pct = accuracy();

  el.wrongList.innerHTML = '';
  missed.forEach((w) => {
    const li = document.createElement('li');
    li.textContent = reverseMode ? `${w.meaning} = ${w.word}` : `${w.word} = ${w.meaning}`;
    el.wrongList.appendChild(li);
  });
  const learned = allWords.length - missed.length; // everything not wrong this round is learned

  el.modalTitle.textContent = `Round ${round} finished: ${pct}%`;
  el.modalSummary.innerHTML =
    `✓ Correct: <strong>${correctCount}</strong> &nbsp;|&nbsp; ✗ Wrong: <strong>${wrongCount}</strong><br>` +
    `Words learned so far: <strong>${learned} / ${allWords.length}</strong>` +
    (missed.length ? '' : `<br><span class="all-done">🎉 All words learned in ${round} round${round > 1 ? 's' : ''}!</span>`);
  el.wrongHeading.hidden = missed.length === 0;
  el.modalNext.textContent = missed.length
    ? `▶ Start Round ${round + 1} (${missed.length} word${missed.length > 1 ? 's' : ''})`
    : '↻ Play again (all words)';

  // From round HARD_ROUND on, offer the still-wrong words as a download
  el.hardBox.hidden = !(round >= HARD_ROUND && missed.length > 0);
  el.downloadBtn.textContent = `⬇ Download hard words (${missed.length})`;

  modalOpen = true;
  el.modal.hidden = false;
  el.modalNext.focus();
  render();
}

function closeModal() {
  modalOpen = false;
  el.modal.hidden = true;
  el.modalClose.blur();
  el.modalNext.blur();
  if (phase === 'finished') advanceRound(); // next round's Start screen
}

// "Start Round N" in the popup: set up the next round and begin straight away
function nextRoundNow() {
  closeModal();
  startGame();
}

// ---- Reverse mode ----
function toggleReverse() {
  reverseMode = !reverseMode;
  el.reverseBtn.blur(); // so Enter/Space don't press the button again
  // Mid-game: restart the countdown so the flipped card isn't given away
  if (phase === 'thinking' || phase === 'revealed') startThinking();
  else render();
}

// ---- Rendering ----
function render() {
  el.modeLabel.textContent = reverseMode ? 'English → Dutch' : 'Dutch → English';

  const item = words[currentIndex];
  if (phase === 'idle') {
    el.prompt.textContent = round === 1 ? 'Ready?' : `Round ${round}`;
    el.idleHint.innerHTML = round === 1
      ? `Tap <strong>Start</strong> to see the first word (${words.length} words)`
      : `${words.length} word${words.length > 1 ? 's' : ''} you got wrong last round`;
    el.startBtn.textContent = `▶ Start Round ${round}`;
  } else if (item) {
    el.prompt.textContent = reverseMode ? item.meaning : item.word;
    el.answerText.textContent = reverseMode ? item.word : item.meaning;
    el.answerLabel.textContent = reverseMode ? 'Dutch:' : 'English:';
  }

  el.idleHint.hidden = phase !== 'idle';
  el.timeBox.hidden = phase !== 'idle';
  el.timeValue.textContent = `${thinkSeconds} s`;
  el.timeMinus.disabled = thinkSeconds <= MIN_SECONDS;
  el.timePlus.disabled = thinkSeconds >= MAX_SECONDS;
  el.listBox.hidden = phase !== 'idle';
  el.listName.textContent = listName;
  el.listCount.textContent = allWords.length;
  el.defaultListBtn.hidden = listName === 'vocab.txt' && !getSavedList();
  el.timer.hidden = phase !== 'thinking';
  el.answer.hidden = phase !== 'revealed' && phase !== 'finished';

  el.startBtn.hidden = phase !== 'idle';
  el.waitMsg.hidden = phase !== 'thinking';
  el.judgeRow.hidden = phase !== 'revealed';

  const prev = lastMarked !== null ? words[lastMarked] : null;
  el.undoBtn.hidden = !prev || (phase !== 'thinking' && phase !== 'revealed');
  if (prev) {
    el.undoWord.textContent = reverseMode ? prev.meaning : prev.word;
    el.undoMark.textContent = prev.status === 'correct' ? '(✓)' : '(✗)';
  }

  el.progress.textContent = words.length
    ? `${phase === 'idle' ? 0 : currentIndex + 1} / ${words.length}`
    : '0 / 0';
  el.roundNo.textContent = round;
  el.correct.textContent = correctCount;
  el.wrong.textContent = wrongCount;

  const pct = accuracy();
  el.accuracy.textContent = `Accuracy: ${pct}%`;
  el.accuracy.className =
    'accuracy ' + (pct >= 80 ? 'accuracy-high' : pct >= 50 ? 'accuracy-mid' : 'accuracy-low');
}

// ---- Events ----
el.startBtn.addEventListener('click', startGame);
el.correctBtn.addEventListener('click', () => mark('correct'));
el.wrongBtn.addEventListener('click', () => mark('wrong'));
el.reverseBtn.addEventListener('click', toggleReverse);
el.modalX.addEventListener('click', closeModal);
el.modalClose.addEventListener('click', closeModal);
el.undoBtn.addEventListener('click', undoLast);
el.modalUndo.addEventListener('click', undoLast);
el.modalNext.addEventListener('click', nextRoundNow);
el.downloadBtn.addEventListener('click', downloadHardWords);
el.modal.addEventListener('click', (e) => { if (e.target === el.modal) closeModal(); });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Backspace') { // keyboard shortcut for "back to previous word"
    e.preventDefault();
    undoLast();
    return;
  }
  // Results popup: Enter = start next round, Escape = close
  if (modalOpen) {
    if (e.key === 'Enter') {
      e.preventDefault();
      nextRoundNow();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
    return;
  }
  if (words.length === 0) return;

  if (e.key === 'Enter') {
    e.preventDefault();
    if (phase === 'idle') startGame();
    else if (phase === 'revealed') mark('correct');
  } else if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault(); // stop the page from scrolling
    if (phase === 'revealed') mark('wrong');
  }
});

render();
loadVocab();
