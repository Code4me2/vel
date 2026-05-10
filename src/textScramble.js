// ── Text Scramble Effect ──
// Framework-agnostic: targets any element by selector.
// Characters cycle through random glyphs before settling on the final text.

const TextScramble = (() => {
  const CHAR_SETS = {
    alpha: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    numeric: '0123456789',
    symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
    mixed: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()',
  };

  function randomChar(charSet) {
    return charSet[Math.floor(Math.random() * charSet.length)];
  }

  // Ensure element width stays stable during scramble
  function lockWidth(el) {
    const span = document.createElement('span');
    span.className = 'scramble-anchor';
    span.textContent = el.textContent;
    el.appendChild(span);
    el.style.minWidth = span.offsetWidth + 'px';
    span.remove();
  }

  // Release width lock after animation
  function unlockWidth(el) {
    el.style.minWidth = '';
  }

  /**
   * Scramble an element's text.
   * @param {HTMLElement} el - Target element
   * @param {Object} options
   * @param {string} [options.text] - Final text (defaults to el.textContent)
   * @param {number} [options.duration] - Total animation duration in ms (default 800)
   * @param {string} [options.charSet] - Character set for scramble ('alpha'|'numeric'|'symbols'|'mixed')
   * @param {number} [options.revealStart] - When to start revealing (0-1 of duration, default 0.05)
   * @param {number} [options.revealEnd] - When reveal completes (0-1 of duration, default 0.9)
   * @param {boolean} [options.lockWidth] - Keep width stable (default true)
   * @returns {Promise<void>} Resolves when animation completes
   */
  function scramble(el, {
    text,
    duration = 800,
    charSet = 'mixed',
    revealStart = 0.05,
    revealEnd = 0.9,
    lockWidth: shouldLock = true,
  } = {}) {
    const chars = CHAR_SETS[charSet] || CHAR_SETS.mixed;
    text = text !== undefined ? text : el.textContent || '';

    // Clear previous content
    el.textContent = '';

    if (shouldLock) lockWidth(el);

    const target = text.split('');
    const len = target.length;
    const revealed = new Array(len).fill(false);
    const current = new Array(len).fill('').map(() => randomChar(chars));

    // Pre-assign each character a reveal time (0-1 range) for smooth, predictable distribution
    const revealTimes = new Array(len);
    for (let i = 0; i < len; i++) {
      revealTimes[i] = revealStart + Math.random() * (revealEnd - revealStart);
    }

    let startTime = null;
    let animId = null;

    return new Promise((resolve) => {
      function step(timestamp) {
        if (startTime === null) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Reveal characters whose time has come
        for (let i = 0; i < len; i++) {
          if (!revealed[i] && progress >= revealTimes[i]) {
            revealed[i] = true;
            current[i] = target[i];
          }
        }

        // Cycle unrevealed characters every other frame for visual noise
        if (Math.floor(elapsed / 50) !== Math.floor((elapsed - 16.67) / 50)) {
          for (let i = 0; i < len; i++) {
            if (!revealed[i]) {
              current[i] = randomChar(chars);
            }
          }
        }

        el.textContent = current.join('');

        if (progress >= 1) {
          // Ensure all characters are revealed
          for (let i = 0; i < len; i++) {
            current[i] = target[i];
          }
          el.textContent = target.join('');
          if (shouldLock) unlockWidth(el);
          cancelAnimationFrame(animId);
          resolve();
          return;
        }

        animId = requestAnimationFrame(step);
      }

      animId = requestAnimationFrame(step);
    });
  }

  // ── State machine for sequenced animations ──
  class ScrambleSequence {
    constructor(el, options = {}) {
      this.el = el instanceof HTMLElement ? el : document.querySelector(el);
      this.originalText = this.el.textContent;
      this.options = options;
      this.running = false;
      this.interrupted = false;
      this.queue = [];
    }

    /** Add a text change to the animation queue */
    add(text, opts = {}) {
      this.queue.push({ text, ...opts });
      if (!this.running) this._run();
      return this;
    }

    /** Reset to original text */
    reset(opts = {}) {
      this.queue = [];
      this.add(this.originalText, opts);
      return this;
    }

    /** Stop and clear queue */
    stop() {
      this.interrupted = true;
      this.running = false;
      this.queue = [];
      this.el.textContent = this.originalText;
      return this;
    }

    async _run() {
      this.running = true;
      this.interrupted = false;

      while (this.queue.length > 0 && !this.interrupted) {
        const item = this.queue.shift();
        await scramble(this.el, { ...this.options, ...item });
      }

      this.running = false;
    }
  }

  return {
    scramble,
    Sequence: ScrambleSequence,
  };
})();

// Export for module systems, or attach to window for scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TextScramble;
} else {
  window.TextScramble = TextScramble;
}
