// Dark mode toggle
(function () {
    const toggle = document.getElementById('theme-toggle');
    const root = document.documentElement;

    function setTheme(theme) {
        root.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }

    // Check saved preference or system preference
    const saved = localStorage.getItem('theme');
    if (saved) {
        setTheme(saved);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        setTheme('dark');
    }

    // Toggle on click
    toggle.addEventListener('click', function () {
        const current = root.getAttribute('data-theme');
        setTheme(current === 'dark' ? 'light' : 'dark');
    });

    // Listen for system preference changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
        if (!localStorage.getItem('theme')) {
            setTheme(e.matches ? 'dark' : 'light');
        }
    });
})();

// ── Text scramble on page load + hover ──
(function () {
    const h1 = document.querySelector('header h1');
    if (!h1 || !window.TextScramble) return;

    // Respect reduced-motion preference
    const motionQuery = window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : { matches: false };
    if (motionQuery.matches) return;

    const { scramble, Sequence } = window.TextScramble;
    const originalText = h1.textContent;
    h1.classList.add('scramble-trigger');

    // Scramble on page load — full duration reveal
    const loadSeq = new Sequence(h1, {
        duration: 3000,
        revealStart: 0.05,
        revealEnd: 0.9,
    });
    loadSeq.add(originalText);

    // Scramble on hover — quick re-scramble
    function runHoverScramble() {
        scramble(h1, {
            text: originalText,
            duration: 1200,
            revealStart: 0,
            revealEnd: 0.85,
        });
    }

    h1.addEventListener('mouseenter', runHoverScramble);

    function handleReducedMotionChange(e) {
        if (e.matches) {
            loadSeq.stop();
            h1.textContent = originalText;
            h1.classList.remove('scramble-trigger', 'is-scrambling');
        }
    }

    if (motionQuery.addEventListener) {
        motionQuery.addEventListener('change', handleReducedMotionChange);
    } else if (motionQuery.addListener) {
        motionQuery.addListener(handleReducedMotionChange);
    }

    window.addEventListener('pagehide', function () {
        loadSeq.stop();
        h1.removeEventListener('mouseenter', runHoverScramble);

        if (motionQuery.removeEventListener) {
            motionQuery.removeEventListener('change', handleReducedMotionChange);
        } else if (motionQuery.removeListener) {
            motionQuery.removeListener(handleReducedMotionChange);
        }
    }, { once: true });

    // Stop hover scramble if user mouses out mid-animation (let it finish)
    // — no reset needed, it resolves to original text anyway
})();
