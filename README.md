Quick revise vocabulary.

####Date: 04-OCT-2026####
Let user choose time per word (3–10 s) on the Start screen, remembered on device

####Date: 03-OCT-2026####
Add hard-words download and custom list upload; pin buttons to bottom on phones

- From round 5 on, results popup offers "Download hard words" as a
  dutch = english .txt file that can be uploaded again
- Start screen: upload your own word list (remembered on the device),
  with "Use default list" to switch back to vocab.txt
- Mobile: Start / Correct / Wrong buttons pinned to the bottom of the screen
- Results popup scrolls on small screens; cache-busting for CSS/JS

####Date: 02-OCT-2026####
Add timed reveal, undo, and multi-round mode for mobile play

- Start screen: game waits for Start before showing the first word
- 5-second countdown with progress bar, then answer is revealed
- Large, mobile-friendly Correct / Wrong buttons (Enter = correct,
  Space = wrong); removed on-screen keyboard hint
- "Back to previous word" (one step only) to fix a mis-marked answer,
  also available from the end-of-round popup (Backspace shortcut)
- Multi-round mode: each round replays only the words marked wrong in
  the previous round, until every word is answered correctly
- Round summary popup shows accuracy, correct/wrong counts, words
  learned so far, and the words carried into the next round
