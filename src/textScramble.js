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
  const CHAR_UPDATE_INTERVAL = 64;
  const activeAnimations = new WeakMap();

  function randomChar(charSet) {
    return charSet[Math.floor(Math.random() * charSet.length)];
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function toFiniteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function getGraphemes(text) {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      return Array.from(segmenter.segment(text), ({ segment }) => segment);
    }

    return Array.from(text);
  }

  function prefersReducedMotion() {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function isHTMLElement(el) {
    return typeof HTMLElement !== 'undefined' && el instanceof HTMLElement;
  }

  // Ensure element width stays stable during scramble
  function lockWidth(el, text) {
    const span = document.createElement('span');
    span.className = 'scramble-anchor';
    span.textContent = text || '\u00a0';
    el.appendChild(span);
    const width = Math.ceil(span.getBoundingClientRect().width);
    span.remove();

    if (width > 0) {
      el.style.minWidth = `${width}px`;
    }
  }

  // Release width lock after animation
  function unlockWidth(el) {
    el.style.minWidth = '';
  }

  function applyA11yState(el, text) {
    const previousAriaLabel = el.getAttribute('aria-label');
    const previousAriaBusy = el.getAttribute('aria-busy');

    el.setAttribute('aria-label', text);
    el.setAttribute('aria-busy', 'true');

    return {
      previousAriaLabel,
      previousAriaBusy,
    };
  }

  function restoreA11yState(el, state) {
    if (!state) return;

    if (state.previousAriaLabel === null) {
      el.removeAttribute('aria-label');
    } else {
      el.setAttribute('aria-label', state.previousAriaLabel);
    }

    if (state.previousAriaBusy === null) {
      el.removeAttribute('aria-busy');
    } else {
      el.setAttribute('aria-busy', state.previousAriaBusy);
    }
  }

  function cleanupAnimation(record, { finalText, cancelled = false } = {}) {
    if (!record) return;

    if (record.frameId !== null) {
      cancelAnimationFrame(record.frameId);
      record.frameId = null;
    }

    if (finalText !== undefined) {
      record.el.textContent = finalText;
    }

    if (record.shouldLock) unlockWidth(record.el);
    record.el.classList.remove('is-scrambling');
    restoreA11yState(record.el, record.a11yState);

    if (activeAnimations.get(record.el) === record) {
      activeAnimations.delete(record.el);
    }

    record.resolve({ cancelled });
  }

  function cancelActive(el) {
    cleanupAnimation(activeAnimations.get(el), { cancelled: true });
  }

  function isScramblableChar(char) {
    return !/^\s$/.test(char);
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
  function scramble(el, options = {}) {
    return runScramble(el, options || {}).then(() => undefined);
  }

  function runScramble(el, {
    text,
    duration = 800,
    charSet = 'mixed',
    revealStart = 0.05,
    revealEnd = 0.9,
    lockWidth: shouldLock = true,
  } = {}) {
    if (!isHTMLElement(el)) {
      return Promise.resolve({ cancelled: true });
    }

    const chars = CHAR_SETS[charSet] || CHAR_SETS.mixed;
    text = text !== undefined ? String(text) : el.textContent || '';
    duration = Math.max(0, toFiniteNumber(duration, 800));
    revealStart = clamp(toFiniteNumber(revealStart, 0.05), 0, 1);
    revealEnd = clamp(toFiniteNumber(revealEnd, 0.9), revealStart, 1);
    const target = getGraphemes(text);
    const len = target.length;

    cancelActive(el);

    if (prefersReducedMotion() || duration === 0 || len === 0) {
      el.textContent = text;
      return Promise.resolve({ cancelled: false });
    }

    if (shouldLock) lockWidth(el, text);
    el.textContent = '';
    el.classList.add('is-scrambling');

    const revealed = new Array(len).fill(false);
    const current = target.map((char) => (isScramblableChar(char) ? randomChar(chars) : char));
    const a11yState = applyA11yState(el, text);

    // Pre-assign each character a reveal time (0-1 range) for smooth, predictable distribution
    const revealTimes = new Array(len);
    for (let i = 0; i < len; i++) {
      revealTimes[i] = isScramblableChar(target[i])
        ? revealStart + Math.random() * (revealEnd - revealStart)
        : 0;
    }

    let startTime = null;
    let lastNoiseTick = -1;
    let lastRendered = '';

    return new Promise((resolve) => {
      const record = {
        el,
        frameId: null,
        shouldLock,
        a11yState,
        resolve,
      };
      activeAnimations.set(el, record);

      function step(timestamp) {
        if (activeAnimations.get(el) !== record) return;

        record.frameId = null;
        if (startTime === null) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const noiseTick = Math.floor(elapsed / CHAR_UPDATE_INTERVAL);
        let changed = false;

        // Reveal characters whose time has come
        for (let i = 0; i < len; i++) {
          if (!revealed[i] && progress >= revealTimes[i]) {
            revealed[i] = true;
            current[i] = target[i];
            changed = true;
          }
        }

        // Cycle unrevealed characters on a fixed cadence to avoid needless DOM writes.
        if (noiseTick !== lastNoiseTick) {
          lastNoiseTick = noiseTick;
          for (let i = 0; i < len; i++) {
            if (!revealed[i] && isScramblableChar(target[i])) {
              current[i] = randomChar(chars);
              changed = true;
            }
          }
        }

        const nextText = current.join('');
        if (changed && nextText !== lastRendered) {
          el.textContent = nextText;
          lastRendered = nextText;
        }

        if (progress >= 1) {
          cleanupAnimation(record, { finalText: text });
          return;
        }

        record.frameId = requestAnimationFrame(step);
      }

      record.frameId = requestAnimationFrame(step);
    });
  }

  // ── State machine for sequenced animations ──
  class ScrambleSequence {
    constructor(el, options = {}) {
      this.el = isHTMLElement(el)
        ? el
        : typeof document !== 'undefined'
          ? document.querySelector(el)
          : null;
      if (!this.el) {
        throw new Error('TextScramble.Sequence target element was not found');
      }
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
      cancelActive(this.el);
      this.el.textContent = this.originalText;
      return this;
    }

    async _run() {
      this.running = true;
      this.interrupted = false;

      while (this.queue.length > 0 && !this.interrupted) {
        const item = this.queue.shift();
        const result = await runScramble(this.el, { ...this.options, ...item });
        if (result.cancelled) break;
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
