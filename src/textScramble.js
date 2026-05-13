// ── Text Scramble — Spec v2 ──
// Mount sweep (deterministic LTR/RTL wave) + pointer-driven hover.
// Vanilla JS IIFE, no dependencies.

const TextScramble = (() => {
  'use strict';

  const DEFAULT_CHARSET =
    '\u2593\u2592\u2591\u2588\u2584\u2580\u258c\u2590\u2502\u2500\u250c\u2510\u2514\u2518\u251c\u2524\u252c\u2534\u253c' +
    '\u2801\u2802\u2803\u2804\u2805\u2806\u2807\u2808\u2809\u280a\u280b\u280c\u280d\u280e\u280f' +
    '0123456789' +
    '!@#%^&*()_+-=[]{}|;:,.<>?/~' +
    'ÆØÅßðþ' +
    'áéíóúàèìòùäëïöüâêîôûñçÑ¡¿' +
    'アイウエオカサタナハマヤラワ';

  const DEFAULT_MOUNT_DURATION = 2000;
  const DEFAULT_POINTER_RADIUS = 1;
  const DEFAULT_SETTLE_MS = 400;
  const DEFAULT_SWEEP_DIR = 'ltr';
  const DEFAULT_MODE = 'both';

  // ── Helpers ──

  function randomChar(charset) {
    return charset[Math.floor(Math.random() * charset.length)];
  }

  function prefersReducedMotion() {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function getGraphemes(text) {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const s = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      return Array.from(s.segment(text), ({ segment }) => segment);
    }
    return Array.from(text);
  }

  function isWhitespace(ch) {
    return /^\s$/.test(ch);
  }

  // ── DOM: per-char spans (created once, updated in place) ──

  async function buildSpans(el, graphemes) {
    // Wait for fonts to load. Without this, fallback font widths are used.
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready.catch(() => {});
    }

    // Create spans with actual characters, insert them into the real element,
    // then measure their widths. This is more reliable than a hidden measurer
    // because the spans inherit the element's actual computed font styles.
    const frag = document.createDocumentFragment();
    const spans = new Array(graphemes.length);
    for (let i = 0; i < graphemes.length; i++) {
      const span = document.createElement('span');
      span.className = 'scramble-char';
      span.textContent = isWhitespace(graphemes[i]) ? '\u00a0' : graphemes[i];
      spans[i] = span;
      frag.appendChild(span);
    }
    el.textContent = '';
    el.appendChild(frag);

    // Force reflow so spans are laid out with the real font
    void el.offsetHeight;

    // Lock each span's measured width
    for (let i = 0; i < spans.length; i++) {
      spans[i].style.width = Math.ceil(spans[i].getBoundingClientRect().width) + 'px';
    }

    return spans;
  }

  function displayChar(ch) {
    return isWhitespace(ch) ? '\u00a0' : ch;
  }

  function setCharAt(spans, index, char) {
    if (spans[index]) spans[index].textContent = displayChar(char);
  }

  function setAllChars(spans, chars) {
    for (let i = 0; i < chars.length; i++) {
      setCharAt(spans, i, chars[i]);
    }
  }

  function lockWidth(el, text) {
    const span = document.createElement('span');
    span.className = 'scramble-anchor';
    span.textContent = text || '\u00a0';
    el.appendChild(span);
    const width = Math.ceil(span.getBoundingClientRect().width);
    span.remove();
    if (width > 0) el.style.minWidth = width + 'px';
  }

  function unlockWidth(el) {
    el.style.minWidth = '';
  }

  // ── Accessibility ──

  function applyA11y(el, busy) {
    if (busy) {
      el.setAttribute('aria-busy', 'true');
      el.setAttribute('aria-label', el.textContent || '');
    } else {
      el.removeAttribute('aria-busy');
      el.removeAttribute('aria-label');
    }
  }

  // ── Mount sweep (deterministic wave) ──

  function scheduleSweep(i, N, duration, direction) {
    const order = direction === 'ltr' ? i : N - 1 - i;
    const start = (order / N) * duration * 0.6;
    return Math.max(start, duration * 0.03);
  }

  async function runMountSweep(el, graphemes, charset, duration, direction) {
    const N = graphemes.length;
    if (N === 0 || duration === 0) {
      const spans = await buildSpans(el, graphemes);
      setAllChars(spans, graphemes);
      return;
    }

    // Create spans once
    const spans = await buildSpans(el, graphemes);

    // Pre-compute reveal times
    const revealAt = graphemes.map((_, i) => scheduleSweep(i, N, duration, direction));

    // Start all as random glyphs (whitespace stays as-is)
    const display = graphemes.map((g) => (isWhitespace(g) ? g : randomChar(charset)));
    setAllChars(spans, display);

    const startTime = performance.now();
    let frameId = null;
    const frameInterval = 33; // ~30fps
    let lastFrame = 0;

    return new Promise((resolve) => {
      function tick(now) {
        if (now - lastFrame < frameInterval) {
          frameId = requestAnimationFrame(tick);
          return;
        }
        lastFrame = now;

        const elapsed = now - startTime;
        let changed = false;

        for (let i = 0; i < N; i++) {
          if (isWhitespace(graphemes[i])) continue;
          if (elapsed >= revealAt[i]) {
            if (display[i] !== graphemes[i]) {
              display[i] = graphemes[i];
              changed = true;
            }
          } else {
            display[i] = randomChar(charset);
            changed = true;
          }
        }

        if (changed) setAllChars(spans, display);

        if (elapsed >= duration) {
          setAllChars(spans, graphemes);
          cancelAnimationFrame(frameId);
          resolve();
          return;
        }

        frameId = requestAnimationFrame(tick);
      }

      frameId = requestAnimationFrame(tick);
    });
  }

  // ── Pointer-driven mode ──

  async function runPointerMode(el, graphemes, charset, pointerRadius, settleMs) {
    const N = graphemes.length;
    if (N === 0) return { destroy: () => {} };

    // Build spans immediately to avoid lazy-init race condition:
    // if we wait for first pointerenter to build spans, the element
    // is hidden during build, pointerenter already fired, and
    // pointermove doesn't fire again if cursor is still — so nothing scrambles.
    // Instead: hide with opacity+visibility, build, restore.
    el.style.opacity = '0';
    el.style.visibility = 'hidden';
    const spans = await buildSpans(el, graphemes);
    setAllChars(spans, graphemes);
    el.style.opacity = '';
    el.style.visibility = '';

    let frameId = null;
    let running = true;
    const lastTouched = new Float64Array(N);
    const activeIndices = new Set();
    let frame = 0;
    const frameInterval = 33;
    let lastFrame = 0;

    function onPointerMove(e) {
      if (!running) return;
      activeIndices.clear();

      for (let i = 0; i < spans.length; i++) {
        const r = spans[i].getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right) {
          for (let d = -pointerRadius; d <= pointerRadius; d++) {
            const j = i + d;
            if (j >= 0 && j < N) activeIndices.add(j);
          }
          break;
        }
      }
    }

    function onPointerLeave() {
      activeIndices.clear();
    }

    function tick(now) {
      if (!running) return;
      if (now - lastFrame < frameInterval) {
        frameId = requestAnimationFrame(tick);
        return;
      }
      lastFrame = now;

      for (const i of activeIndices) {
        lastTouched[i] = now;
      }

      for (let i = 0; i < N; i++) {
        const t = lastTouched[i];

        if (t === 0) {
          if (spans[i].textContent !== displayChar(graphemes[i])) {
            spans[i].textContent = displayChar(graphemes[i]);
          }
        } else if (now - t < settleMs) {
          if (!isWhitespace(graphemes[i])) {
            spans[i].textContent = randomChar(charset);
          }
        } else {
          lastTouched[i] = 0;
          spans[i].textContent = displayChar(graphemes[i]);
        }
      }

      frame++;
      frameId = requestAnimationFrame(tick);
    }

    el.addEventListener('pointermove', onPointerMove, { passive: true });
    el.addEventListener('pointerleave', onPointerLeave, { passive: true });

    lockWidth(el, graphemes.join(''));
    el.classList.add('is-scrambling');

    frameId = requestAnimationFrame(tick);

    return {
      destroy() {
        running = false;
        cancelAnimationFrame(frameId);
        el.removeEventListener('pointermove', onPointerMove);
        el.removeEventListener('pointerleave', onPointerLeave);
        el.classList.remove('is-scrambling');
        unlockWidth(el);
        setAllChars(spans, graphemes);
      },
    };
  }

  // ── Public API ──

  /**
   * Initialize a text scramble effect on an element.
   *
   * @param {HTMLElement} el - Target element
   * @param {Object} [opts]
   * @param {string}  [opts.text] - Final text (default: el.textContent)
   * @param {string}  [opts.charset] - Glyph charset (default: DEFAULT_CHARSET)
   * @param {string}  [opts.mode] - 'mount' | 'pointer' | 'both' (default: 'both')
   * @param {number}  [opts.pointerRadius] - Chars on each side to affect (default: 1)
   * @param {number}  [opts.settleMs] - Settle time after cursor leaves (default: 400)
   * @param {string}  [opts.sweepDirection] - 'ltr' | 'rtl' (default: 'ltr')
   * @param {number}  [opts.mountDuration] - Mount animation ms (default: 2000)
   * @returns {Promise<{ destroy: () => void, setText: (t: string) => Promise<void> }>}
   */
  async function init(el, opts = {}) {
    if (!(el instanceof HTMLElement)) {
      throw new Error('TextScramble.init: target must be an HTMLElement');
    }

    const charset = opts.charset || DEFAULT_CHARSET;
    const mode = opts.mode || DEFAULT_MODE;
    const pointerRadius = opts.pointerRadius ?? DEFAULT_POINTER_RADIUS;
    const settleMs = opts.settleMs ?? DEFAULT_SETTLE_MS;
    const sweepDir = opts.sweepDirection || DEFAULT_SWEEP_DIR;
    const mountDuration = opts.mountDuration ?? DEFAULT_MOUNT_DURATION;

    const graphemes = getGraphemes(opts.text !== undefined ? opts.text : el.textContent || '');

    const reduced = prefersReducedMotion();
    const doMount = mode === 'mount' || mode === 'both';
    const doPointer = mode === 'pointer' || mode === 'both';

    // Reduced motion: just render text, no effects
    if (reduced) {
      const spans = await buildSpans(el, graphemes);
      setAllChars(spans, graphemes);
      return { destroy: () => {}, setText: async () => {} };
    }

    el.classList.add('scramble-trigger');

    let pointerCtrl = null;

    if (doMount) {
      applyA11y(el, true);
      el.classList.add('is-scrambling');

      await runMountSweep(el, graphemes, charset, mountDuration, sweepDir);

      el.classList.remove('is-scrambling');
      unlockWidth(el);
      applyA11y(el, false);

      // After mount, hand off to pointer mode
      if (doPointer) {
        pointerCtrl = await runPointerMode(el, graphemes, charset, pointerRadius, settleMs);
      }
    } else if (doPointer) {
      pointerCtrl = await runPointerMode(el, graphemes, charset, pointerRadius, settleMs);
    }

    return {
      destroy() {
        if (pointerCtrl) pointerCtrl.destroy();
        el.classList.remove('scramble-trigger', 'is-scrambling');
        unlockWidth(el);
        applyA11y(el, false);
      },
      async setText(text) {
        const newGraphemes = getGraphemes(text);
        const spans = await buildSpans(el, newGraphemes);
        setAllChars(spans, newGraphemes);
      },
    };
  }

  // ── Backward compat shim ──

  function scramble(el, options = {}) {
    const charset = DEFAULT_CHARSET;
    const duration = options.duration || DEFAULT_MOUNT_DURATION;
    const dir = options.sweepDirection || DEFAULT_SWEEP_DIR;
    const graphemes = getGraphemes(options.text !== undefined ? options.text : el.textContent || '');
    return runMountSweep(el, graphemes, charset, duration, dir).then(() => undefined);
  }

  class ScrambleSequence {
    constructor(el, options = {}) {
      if (!(el instanceof HTMLElement)) {
        el = typeof document !== 'undefined' ? document.querySelector(el) : null;
      }
      if (!el) throw new Error('TextScramble.Sequence: target not found');
      this.el = el;
      this.originalText = el.textContent;
      this.options = options;
      this.running = false;
      this.interrupted = false;
      this.queue = [];
    }

    add(text, opts = {}) {
      this.queue.push({ text, ...opts });
      if (!this.running) this._run();
      return this;
    }

    reset(opts = {}) {
      this.queue = [];
      this.add(this.originalText, opts);
      return this;
    }

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
    init,
    scramble,
    Sequence: ScrambleSequence,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TextScramble;
} else {
  window.TextScramble = TextScramble;
}
