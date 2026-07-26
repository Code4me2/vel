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
      span.textContent = displayChar(graphemes[i]);
      spans[i] = span;
      frag.appendChild(span);
    }
    el.textContent = '';
    el.appendChild(frag);

    refreshSpanWidths(spans, graphemes);

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

  function refreshSpanWidths(spans, graphemes) {
    const currentText = spans.map((span) => span.textContent);

    for (let i = 0; i < spans.length; i++) {
      spans[i].style.width = '';
      spans[i].textContent = displayChar(graphemes[i]);
    }

    // Force reflow so spans are measured with the element's current CSS.
    if (spans[0]) void spans[0].offsetHeight;

    for (let i = 0; i < spans.length; i++) {
      // Preserve subpixel widths. Rounding every character up can add dozens
      // of pixels to longer single-line text and force it past the viewport.
      const width = spans[i].getBoundingClientRect().width;
      spans[i].style.width = width.toFixed(3) + 'px';
      spans[i].textContent = currentText[i];
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
    let spans;
    el.style.opacity = '0';
    el.style.visibility = 'hidden';
    try {
      spans = await buildSpans(el, graphemes);
      setAllChars(spans, graphemes);
    } finally {
      el.style.opacity = '';
      el.style.visibility = '';
    }

    let frameId = null;
    let resizeFrameId = null;
    let running = true;
    const lastTouched = new Float64Array(N);
    const activeIndices = new Set();
    const frameInterval = 33;
    let lastFrame = 0;

    function ensureAnimation() {
      if (!running || frameId !== null) return;
      lastFrame = 0;
      frameId = requestAnimationFrame(tick);
    }

    function onPointerMove(e) {
      if (!running) return;
      activeIndices.clear();

      // Prefer the event target: each character owns its full inline box, so
      // this remains accurate when text wraps onto multiple lines.
      let hitIndex = spans.indexOf(e.target);

      // Fall back to two-dimensional bounds for events targeted at the parent
      // (for example, near a glyph's transparent pixels). Checking both axes
      // prevents a character on another line with the same x-position from
      // being selected.
      if (hitIndex === -1) {
        for (let i = 0; i < spans.length; i++) {
          const r = spans[i].getBoundingClientRect();
          if (
            e.clientX >= r.left &&
            e.clientX <= r.right &&
            e.clientY >= r.top &&
            e.clientY <= r.bottom
          ) {
            hitIndex = i;
            break;
          }
        }
      }

      if (hitIndex !== -1) {
        const hitRect = spans[hitIndex].getBoundingClientRect();
        for (let d = -pointerRadius; d <= pointerRadius; d++) {
          const j = hitIndex + d;
          if (j < 0 || j >= N) continue;

          // Logical neighbors can land on opposite ends of adjacent wrapped
          // lines. Only animate neighbors that share the hovered visual line.
          const neighborRect = spans[j].getBoundingClientRect();
          const sharesLine = neighborRect.bottom > hitRect.top && neighborRect.top < hitRect.bottom;
          if (sharesLine) activeIndices.add(j);
        }
      }

      if (activeIndices.size > 0) ensureAnimation();
    }

    function onPointerLeave() {
      activeIndices.clear();
    }

    function refreshLayout() {
      refreshSpanWidths(spans, graphemes);
      lockWidth(el, graphemes.join(''));
    }

    function scheduleLayoutRefresh() {
      if (!running || resizeFrameId !== null) return;
      resizeFrameId = requestAnimationFrame(() => {
        resizeFrameId = null;
        if (running) refreshLayout();
      });
    }

    function tick(now) {
      if (!running) {
        frameId = null;
        return;
      }
      if (now - lastFrame < frameInterval) {
        frameId = requestAnimationFrame(tick);
        return;
      }
      lastFrame = now;

      for (const i of activeIndices) {
        lastTouched[i] = now;
      }

      let hasPendingAnimation = activeIndices.size > 0;
      for (let i = 0; i < N; i++) {
        const t = lastTouched[i];

        if (t === 0) {
          if (spans[i].textContent !== displayChar(graphemes[i])) {
            spans[i].textContent = displayChar(graphemes[i]);
          }
        } else if (now - t < settleMs) {
          hasPendingAnimation = true;
          if (!isWhitespace(graphemes[i])) {
            spans[i].textContent = randomChar(charset);
          }
        } else {
          lastTouched[i] = 0;
          spans[i].textContent = displayChar(graphemes[i]);
        }
      }

      frameId = hasPendingAnimation ? requestAnimationFrame(tick) : null;
    }

    el.addEventListener('pointermove', onPointerMove, { passive: true });
    el.addEventListener('pointerleave', onPointerLeave, { passive: true });
    window.addEventListener('resize', scheduleLayoutRefresh, { passive: true });

    lockWidth(el, graphemes.join(''));
    el.classList.add('is-scrambling');

    return {
      destroy() {
        running = false;
        if (frameId !== null) cancelAnimationFrame(frameId);
        if (resizeFrameId !== null) cancelAnimationFrame(resizeFrameId);
        el.removeEventListener('pointermove', onPointerMove);
        el.removeEventListener('pointerleave', onPointerLeave);
        window.removeEventListener('resize', scheduleLayoutRefresh);
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

    let graphemes = getGraphemes(opts.text !== undefined ? opts.text : el.textContent || '');

    const originalA11y = {
      label: { present: el.hasAttribute('aria-label'), value: el.getAttribute('aria-label') },
      busy: { present: el.hasAttribute('aria-busy'), value: el.getAttribute('aria-busy') },
    };

    function restoreAttribute(name, snapshot) {
      if (snapshot.present) el.setAttribute(name, snapshot.value);
      else el.removeAttribute(name);
    }

    function restoreA11y() {
      restoreAttribute('aria-label', originalA11y.label);
      restoreAttribute('aria-busy', originalA11y.busy);
    }

    function applyAnimatedA11y(busy) {
      // Keep the accessible name stable while the visible glyphs change.
      const accessibleText = originalA11y.label.present
        ? originalA11y.label.value
        : graphemes.join('');
      el.setAttribute('aria-label', accessibleText);
      if (busy) el.setAttribute('aria-busy', 'true');
      else restoreAttribute('aria-busy', originalA11y.busy);
    }

    const reduced = prefersReducedMotion();
    const doMount = mode === 'mount' || mode === 'both';
    const doPointer = mode === 'pointer' || mode === 'both';

    // Reduced motion: render text without animation, but keep the API functional.
    if (reduced) {
      let destroyed = false;
      let setTextQueue = Promise.resolve();
      const spans = await buildSpans(el, graphemes);
      setAllChars(spans, graphemes);

      async function applyReducedText(text) {
        if (destroyed) return;
        graphemes = getGraphemes(text);
        const nextSpans = await buildSpans(el, graphemes);
        if (!destroyed) setAllChars(nextSpans, graphemes);
      }

      return {
        destroy() {
          destroyed = true;
          unlockWidth(el);
        },
        setText(text) {
          setTextQueue = setTextQueue.catch(() => {}).then(() => applyReducedText(text));
          return setTextQueue;
        },
      };
    }

    el.classList.add('scramble-trigger');

    let pointerCtrl = null;
    let destroyed = false;
    let setTextQueue = Promise.resolve();

    async function applyText(text) {
      if (destroyed) return;

      if (pointerCtrl) {
        pointerCtrl.destroy();
        pointerCtrl = null;
      }

      graphemes = getGraphemes(text);

      if (graphemes.length === 0) {
        const spans = await buildSpans(el, graphemes);
        if (!destroyed) {
          setAllChars(spans, graphemes);
          restoreA11y();
        }
        return;
      }

      if (doPointer) {
        applyAnimatedA11y(false);
        const nextPointerCtrl = await runPointerMode(el, graphemes, charset, pointerRadius, settleMs);
        if (destroyed) {
          nextPointerCtrl.destroy();
          return;
        }
        pointerCtrl = nextPointerCtrl;
        return;
      }

      const spans = await buildSpans(el, graphemes);
      if (!destroyed) {
        setAllChars(spans, graphemes);
        restoreA11y();
      }
    }

    if (doMount) {
      applyAnimatedA11y(true);
      el.classList.add('is-scrambling');

      await runMountSweep(el, graphemes, charset, mountDuration, sweepDir);

      el.classList.remove('is-scrambling');
      unlockWidth(el);

      // After mount, hand off to pointer mode.
      if (doPointer) {
        applyAnimatedA11y(false);
        pointerCtrl = await runPointerMode(el, graphemes, charset, pointerRadius, settleMs);
      } else {
        restoreA11y();
      }
    } else if (doPointer) {
      applyAnimatedA11y(false);
      pointerCtrl = await runPointerMode(el, graphemes, charset, pointerRadius, settleMs);
    }

    return {
      destroy() {
        destroyed = true;
        if (pointerCtrl) pointerCtrl.destroy();
        pointerCtrl = null;
        el.classList.remove('scramble-trigger', 'is-scrambling');
        unlockWidth(el);
        restoreA11y();
      },
      setText(text) {
        setTextQueue = setTextQueue.catch(() => {}).then(() => applyText(text));
        return setTextQueue;
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
