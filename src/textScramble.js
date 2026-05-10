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
   * @param {number} [options.speed] - Frames between character changes (default 2)
   * @param {number} [options.revealRate] - Fraction of chars revealed per frame (0-1, default 0.04)
   * @param {boolean} [options.lockWidth] - Keep width stable (default true)
   * @returns {Promise<void>} Resolves when animation completes
   */
  function scramble(el, {
    text,
    duration = 800,
    charSet = 'mixed',
    speed = 2,
    revealRate = 0.04,
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

    let frames = 0;
    const totalFrames = Math.max(Math.ceil(duration / (16.67 * speed)), 30);
    let animId = null;

    return new Promise((resolve) => {
      function step() {
        frames++;

        // Reveal characters progressively
        const toReveal = Math.max(1, Math.ceil(len * revealRate));
        for (let i = 0; i < toReveal && frames <= totalFrames; i++) {
          // Find an unrevealed index (random position for organic feel)
          const unrevealed = [];
          for (let j = 0; j < len; j++) {
            if (!revealed[j]) unrevealed.push(j);
          }
          if (unrevealed.length === 0) break;
          const idx = unrevealed[Math.floor(Math.random() * unrevealed.length)];
          revealed[idx] = true;
          current[idx] = target[idx];
        }

        // Cycle unrevealed characters
        for (let i = 0; i < len; i++) {
          if (!revealed[i]) {
            current[i] = randomChar(chars);
          }
        }

        el.textContent = current.join('');

        if (frames >= totalFrames) {
          // Ensure all characters are revealed
          for (let i = 0; i < len; i++) {
            revealed[i] = true;
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
