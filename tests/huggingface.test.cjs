const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { setImmediate } = require('node:timers/promises');
const { runInNewContext } = require('node:vm');

const scripts = readFileSync(`${__dirname}/../scripts.js`, 'utf8');

test('shows only public models and never reports a partial total', async () => {
    const data = [
        { id: 'Code4me2/model-a', private: false, downloadsAllTime: 30 },
        { id: 'Code4me2/model-b', private: false, downloadsAllTime: 12 },
        { id: 'Code4me2/private-model', private: true, downloadsAllTime: 500 },
    ];
    for (const paginated of [false, true]) {
        const status = {};
        const list = { replaceChildren(...rows) { this.rows = rows; } };
        const nodes = { 'hf-downloads': status, 'hf-models': list };
        runInNewContext(scripts, {
            document: {
                getElementById: id => nodes[id],
                querySelector: () => null,
                documentElement: { getAttribute: () => null },
                createElement: () => ({ append(link) { this.link = link; } }),
            },
            window: {},
            fetch: async () => Response.json(data, { headers: paginated ? { link: '<next>; rel="next"' } : {} }),
        });
        await setImmediate();
        if (paginated) {
            assert.equal(status.textContent, 'Download counts are currently unavailable.');
            assert.equal(list.rows, undefined);
        } else {
            assert.equal(status.textContent, '2 public models · 42 all-time downloads');
            assert.deepEqual(list.rows.map(row => row.link.textContent), ['model-a · 30', 'model-b · 12']);
            assert.equal(list.rows[0].link.href, 'https://huggingface.co/Code4me2/model-a');
        }
    }
});
