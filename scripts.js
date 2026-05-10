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

// ── Text scramble on page load ──
(function () {
    const h1 = document.querySelector('header h1');
    if (!h1 || !window.TextScramble) return;

    // Respect reduced-motion preference
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) return; // skip animation entirely

    const { scramble, Sequence } = window.TextScramble;

    // Scramble the heading on load
    const seq = new Sequence(h1, { duration: 900, revealRate: 0.05 });
    seq.add(h1.textContent);
})();
