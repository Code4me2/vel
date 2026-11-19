// Dark mode toggle
(function () {
    const toggle = document.getElementById('theme-toggle');
    const root = document.documentElement;
    const mql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    function isValidTheme(theme) {
        return theme === 'light' || theme === 'dark';
    }

    function getSavedTheme() {
        try {
            const theme = localStorage.getItem('theme');
            return isValidTheme(theme) ? theme : null;
        } catch {
            return null;
        }
    }

    function updateToggleState(theme) {
        if (!toggle) return;
        const isDark = theme === 'dark';
        toggle.setAttribute('aria-pressed', String(isDark));
        toggle.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    }

    function setTheme(theme, persist = true) {
        if (!isValidTheme(theme)) return;
        root.setAttribute('data-theme', theme);
        updateToggleState(theme);
        if (persist) {
            try {
                localStorage.setItem('theme', theme);
            } catch {}
        }
    }

    // The inline head script applies the initial preference before first paint.
    updateToggleState(root.getAttribute('data-theme'));

    if (!toggle) return;

    // Toggle on click
    toggle.addEventListener('click', function () {
        const current = root.getAttribute('data-theme');
        setTheme(current === 'dark' ? 'light' : 'dark');
    });

    // Listen for system preference changes
    if (mql) {
        const onPreferenceChange = function (e) {
            if (!getSavedTheme()) {
                setTheme(e.matches ? 'dark' : 'light', false);
            }
        };

        if (mql.addEventListener) {
            mql.addEventListener('change', onPreferenceChange);
        } else if (mql.addListener) {
            mql.addListener(onPreferenceChange);
        }
    }
})();

// ── Copy email to clipboard ──
(function () {
    const btn = document.getElementById('copy-email');
    if (!btn) return;

    btn.addEventListener('click', async function () {
        let copied = false;
        try {
            if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
            await navigator.clipboard.writeText('velvetmoon222999@gmail.com');
            copied = true;
        } catch {
            // Fallback
            const ta = document.createElement('textarea');
            ta.value = 'velvetmoon222999@gmail.com';
            document.body.appendChild(ta);
            ta.select();
            try {
                copied = document.execCommand('copy');
            } catch {
                copied = false;
            }
            document.body.removeChild(ta);
        }

        // Show toast
        let toast = document.getElementById('copy-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'copy-toast';
            toast.className = 'copy-toast';
            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-live', 'polite');
            document.body.appendChild(toast);
        }
        toast.textContent = copied ? 'Email copied' : 'Copy failed';
        toast.classList.add('show');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => toast.classList.remove('show'), 1500);
    });
})();

// ── Public Hugging Face model downloads ──
(async function () {
    const status = document.getElementById('hf-downloads');
    const list = document.getElementById('hf-models');
    if (!status || !list) return;

    const hub = 'https://huggingface.co';
    const format = new Intl.NumberFormat();
    status.textContent = 'Loading download counts…';
    try {
        const response = await fetch(`${hub}/api/models?author=Code4me2&limit=1000&expand%5B%5D=private&expand%5B%5D=downloadsAllTime`, { credentials: 'omit' });
        // ponytail: one page for this profile; follow Link pagination if it grows.
        if (!response.ok || response.headers.has('link')) throw new Error('Incomplete model data');
        const models = (await response.json()).filter(model => model?.private === false);
        let total = 0;
        const rows = models.map(({ id, downloadsAllTime }) => {
            const name = typeof id === 'string' && /^Code4me2\/(\w[\w.-]*)$/i.exec(id)?.[1];
            if (!name || !Number.isSafeInteger(downloadsAllTime) || downloadsAllTime < 0) {
                throw new Error('Invalid model data');
            }
            total += downloadsAllTime;
            const item = document.createElement('li');
            const link = document.createElement('a');
            link.href = `${hub}/Code4me2/${name}`;
            link.textContent = name;
            const count = document.createElement('span');
            count.className = 'model-downloads';
            count.textContent = ` · ${format.format(downloadsAllTime)}`;
            link.append(count);
            item.append(link);
            return item;
        });
        list.replaceChildren(...rows);
        status.textContent = `${format.format(total)} total downloads`;
    } catch {
        status.textContent = 'Download counts are currently unavailable.';
    }
})();

// ── Text scramble on page load + pointer hover (Spec v2) ──
(function () {
    const h1 = document.querySelector('header h1');
    if (!h1 || !window.TextScramble || !window.TextScramble.init) return;

    const controllers = [];
    let disposed = false;

    function trackController(controllerPromise) {
        Promise.resolve(controllerPromise)
            .then((controller) => {
                if (!controller || typeof controller.destroy !== 'function') return;

                if (disposed) {
                    controller.destroy();
                    return;
                }

                controllers.push(controller);
            })
            .catch((error) => console.error('TextScramble init failed:', error));
    }

    trackController(window.TextScramble.init(h1, {
        text: h1.textContent,
        mode: 'both',
        mountDuration: 3000,
        sweepDirection: 'ltr',
        pointerRadius: 1,
        settleMs: 400,
    }));

    // Scramble subtitle (tagline) — starts immediately, no hide/reveal
    const tagline = document.querySelector('.tagline');
    if (tagline) {
        trackController(window.TextScramble.init(tagline, {
            text: tagline.textContent,
            mode: 'both',
            mountDuration: 2500,
            sweepDirection: 'ltr',
            pointerRadius: 1,
            settleMs: 400,
        }));
    }

    // Scramble section titles — pointer hover only
    const sectionTitles = document.querySelectorAll('section h2');
    sectionTitles.forEach((h2) => {
        h2.style.position = 'relative';
        trackController(window.TextScramble.init(h2, {
            text: h2.textContent,
            mode: 'pointer',
            pointerRadius: 1,
            settleMs: 400,
        }));
    });

    // Clean up resolved controllers on real unloads. Keep them alive for BFCache restores.
    window.addEventListener('pagehide', function (event) {
        if (event.persisted) return;

        disposed = true;
        controllers.forEach((controller) => controller.destroy());
        controllers.length = 0;
    });
})();
