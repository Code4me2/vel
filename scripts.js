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

// ── Text scramble on page load + pointer hover (Spec v2) ──
(function () {
    const h1 = document.querySelector('header h1');
    if (!h1 || !window.TextScramble || !window.TextScramble.init) return;

    const controller = window.TextScramble.init(h1, {
        text: h1.textContent,
        mode: 'both',
        mountDuration: 3000,
        sweepDirection: 'ltr',
        pointerRadius: 1,
        settleMs: 400,
    });

    // Scramble subtitle (tagline) — starts immediately, no hide/reveal
    const tagline = document.querySelector('.tagline');
    if (tagline) {
        const taglineCtrl = window.TextScramble.init(tagline, {
            text: tagline.textContent,
            mode: 'both',
            mountDuration: 2500,
            sweepDirection: 'ltr',
            pointerRadius: 1,
            settleMs: 400,
        });
    }

    // Scramble section titles — pointer hover only
    const sectionTitles = document.querySelectorAll('section h2');
    sectionTitles.forEach((h2) => {
        window.TextScramble.init(h2, {
            text: h2.textContent,
            mode: 'pointer',
            pointerRadius: 1,
            settleMs: 400,
        });
    });

    // Clean up on page unload
    window.addEventListener('pagehide', function () {
        controller.destroy();
    }, { once: true });
})();
