// Spaced-repetition scheduling for flashcards, in the style of Anki (SM-2).
// Shared by main.js (via require) and the page (via <script>), so the answer buttons
// can show the same intervals the main process will actually use.
const SRS = (() => {
  const MIN = 60 * 1000;
  const DAY = 24 * 60 * MIN;
  const START_EASE = 2.5;
  const MIN_EASE = 1.3;
  const LEARN_AHEAD = 20 * MIN; // cards still being learned come back early rather than leave a gap

  // interval is in days; 0 means the card is new or being relearned and comes back within minutes
  function schedule(card, grade) {
    const { interval, ease } = card;
    if (interval === 0) {
      if (grade === 'again') return { interval: 0, ease, wait: MIN };
      if (grade === 'hard') return { interval: 0, ease, wait: 10 * MIN };
      if (grade === 'good') return { interval: 1, ease, wait: DAY };
      return { interval: 4, ease: ease + 0.15, wait: 4 * DAY };
    }
    if (grade === 'again') return { interval: 0, ease: Math.max(MIN_EASE, ease - 0.2), wait: 10 * MIN, lapse: true };
    let next;
    if (grade === 'hard') {
      next = Math.max(interval + 1, Math.round(interval * 1.2));
      return { interval: next, ease: Math.max(MIN_EASE, ease - 0.15), wait: next * DAY };
    }
    if (grade === 'good') {
      next = Math.max(interval + 1, Math.round(interval * ease));
      return { interval: next, ease, wait: next * DAY };
    }
    next = Math.max(interval + 2, Math.round(interval * ease * 1.3));
    return { interval: next, ease: ease + 0.15, wait: next * DAY };
  }

  function review(card, grade, now = Date.now()) {
    const s = schedule(card, grade);
    return {
      ...card,
      interval: s.interval,
      ease: s.ease,
      due: now + s.wait,
      reps: card.reps + 1,
      lapses: card.lapses + (s.lapse ? 1 : 0),
      lastReview: now
    };
  }

  function newCard(id, deck, front, back, now = Date.now()) {
    return { id, deck, front, back, createdAt: now, due: now, interval: 0, ease: START_EASE, reps: 0, lapses: 0 };
  }

  function isDue(card, now = Date.now()) {
    return card.due <= now || (card.interval === 0 && card.reps > 0 && card.due <= now + LEARN_AHEAD);
  }

  // short label for a wait, e.g. "10m", "3h", "4d", "2mo"
  function label(ms) {
    if (ms < 60 * MIN) return Math.max(1, Math.round(ms / MIN)) + 'm';
    if (ms < DAY) return Math.round(ms / (60 * MIN)) + 'h';
    const d = ms / DAY;
    if (d < 30) return Math.round(d) + 'd';
    if (d < 365) return Math.round(d / 30) + 'mo';
    return (d / 365).toFixed(1).replace(/\.0$/, '') + 'y';
  }

  return { GRADES: ['again', 'hard', 'good', 'easy'], schedule, review, newCard, isDue, label };
})();

if (typeof module !== 'undefined') module.exports = SRS;
