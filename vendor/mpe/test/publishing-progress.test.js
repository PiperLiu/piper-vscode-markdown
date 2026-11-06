/* global suite, test, suiteSetup */
const assert = require('assert');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');
let progress, component;
const entry = (name) =>
  path.resolve(__dirname, '../frontend/src/webview', name);
async function compile(file, options = {}) {
  const result = await esbuild.build({
    entryPoints: [entry(file)],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    packages: 'external',
    ...options,
  });
  return result.outputFiles[0].text;
}
function evaluate(code, extras = {}) {
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require,
    ...extras,
  });
  return module.exports;
}
suite('publishing progress feedback', () => {
  suiteSetup(async () => {
    progress = evaluate(await compile('lib/publishing-progress.ts'));
    component = await compile('components/PiperPublishing.tsx', {
      loader: { '.css': 'empty' },
      plugins: [
        {
          name: 'test-preview-container',
          setup(build) {
            build.onResolve({ filter: /^\.\.\/containers\/preview$/ }, () => ({
              path: 'preview',
              namespace: 'test-preview',
            }));
            build.onLoad({ filter: /.*/, namespace: 'test-preview' }, () => ({
              contents: 'export default globalThis.testPreviewContainer;',
              loader: 'js',
            }));
          },
        },
      ],
    });
  });
  const upload = () =>
    progress.advancePublishingProgress(progress.initialPublishingProgress(), {
      phase: 'upload',
      completed: 2,
      total: 5,
    });
  test('429 countdown updates detail without advancing successful count or percentage', () => {
    const before = upload();
    const waiting = progress.advancePublishingProgress(before, {
      phase: 'upload',
      completed: 2,
      total: 5,
      state: 'retrying',
      retry: 1,
      maxRetries: 3,
      retryAfterMs: 3800,
    });
    assert.equal(waiting.value, before.value);
    assert.equal(waiting.completed, 2);
    assert.equal(
      progress.publishingProgressDetail(waiting, 'en'),
      '2/5 images uploaded · Host busy; retrying in 4s (1/3)',
    );
    assert.equal(
      progress.publishingProgressDetail(waiting, 'zh-cn'),
      '已上传 2/5 张 · 图床繁忙，4 秒后重试 (1/3)',
    );
    const tick = progress.advancePublishingProgress(waiting, {
      phase: 'upload',
      completed: 2,
      total: 5,
      state: 'retrying',
      retry: 1,
      maxRetries: 3,
      retryAfterMs: 2600,
    });
    assert.equal(tick.value, waiting.value);
    assert.match(progress.publishingProgressDetail(tick, 'en'), /in 3s/);
  });
  test('detail-only, missing, zero or invalid totals never imply completed uploads', () => {
    const before = upload();
    for (const extra of [
      {},
      { total: 0, completed: 0 },
      { total: NaN, completed: 3 },
      { total: 5, completed: NaN },
    ]) {
      const next = progress.advancePublishingProgress(before, {
        phase: 'upload',
        state: 'retrying',
        retryAfterMs: 1000,
        ...extra,
      });
      assert.equal(next.value, before.value);
      assert.ok(next.value < 0.92);
    }
    const onlyDetail = progress.advancePublishingProgress(
      progress.initialPublishingProgress(),
      { phase: 'upload', message: 'Waiting' },
    );
    assert.equal(onlyDetail.value, 0);
    assert.equal(onlyDetail.detail, 'Waiting');
  });
  test('new upload and completion clear obsolete retry text', () => {
    const waiting = progress.advancePublishingProgress(upload(), {
      phase: 'upload',
      state: 'retrying',
      retryAfterMs: 9000,
      message: 'Old retry message',
    });
    const active = progress.advancePublishingProgress(waiting, {
      phase: 'upload',
      completed: 2,
      total: 5,
      state: 'uploading',
    });
    assert.equal(
      progress.publishingProgressDetail(active, 'en'),
      'Uploading image 3/5',
    );
    const completed = progress.advancePublishingProgress(active, {
      phase: 'upload',
      completed: 3,
      total: 5,
    });
    assert.equal(
      progress.publishingProgressDetail(completed, 'en'),
      '3/5 images uploaded',
    );
    assert.equal(completed.state, undefined);
    assert.equal(completed.retryAfterMs, undefined);
    assert.equal(completed.detail, '');
    assert.equal(progress.initialPublishingProgress().detail, '');
  });
  test('queue and pacing are visible in both languages, without invented countdowns', () => {
    for (const state of ['queued', 'pacing']) {
      const waiting = progress.advancePublishingProgress(upload(), {
        phase: 'upload',
        state,
        completed: 2,
        total: 5,
      });
      assert.match(
        progress.publishingProgressDetail(waiting, 'en'),
        /2\/5 images uploaded/,
      );
      assert.match(
        progress.publishingProgressDetail(waiting, 'zh-cn'),
        /已上传 2\/5 张/,
      );
      assert.doesNotMatch(
        progress.publishingProgressDetail(waiting, 'en'),
        /retrying/,
      );
    }
  });
  test('percentage remains monotonic and 100 percent requires clipboard completion', () => {
    const done = progress.advancePublishingProgress(upload(), {
      phase: 'upload',
      completed: 5,
      total: 5,
    });
    assert.equal(done.value, 0.92);
    const stale = progress.advancePublishingProgress(done, {
      phase: 'convert',
      completed: 1,
      total: 2,
      message: 'stale',
    });
    assert.equal(stale, done);
    const writing = progress.advancePublishingProgress(done, {
      phase: 'clipboard',
      completed: 0,
      total: 1,
    });
    assert.equal(writing.value, 0.97);
    assert.equal(
      progress.advancePublishingProgress(writing, {
        phase: 'clipboard',
        completed: 1,
        total: 1,
      }).value,
      1,
    );
  });
  test('other phases keep explicit messages and malformed events are ignored', () => {
    const state = progress.advancePublishingProgress(
      progress.initialPublishingProgress(),
      {
        phase: 'convert',
        completed: 1,
        total: 2,
        message: 'Preparing diagram',
      },
    );
    assert.equal(
      progress.publishingProgressDetail(state, 'en'),
      'Preparing diagram',
    );
    assert.equal(progress.advancePublishingProgress(state, null), state);
    assert.equal(
      progress.advancePublishingProgress(state, { phase: 'not-a-stage' }),
      state,
    );
  });
  function render(mode, locale) {
    const value = progress.advancePublishingProgress(upload(), {
      phase: 'upload',
      completed: 2,
      total: 5,
      state: 'retrying',
      retry: 1,
      maxRetries: 3,
      retryAfterMs: 4000,
    });
    const states = [
      mode,
      { settings: {}, source: 'file:///synthetic.md' },
      true,
      '',
      '',
      false,
      true,
      false,
      value,
      36,
      80,
    ];
    const sent = [];
    const react = {
      Fragment: 'Fragment',
      createElement(type, props, ...children) {
        return { type, props: props || {}, children };
      },
      useState() {
        assert.ok(states.length);
        return [states.shift(), () => {}];
      },
      useRef(current) {
        return { current };
      },
      useEffect() {},
    };
    const api = evaluate(component, {
      crypto: require('crypto'),
      require(name) {
        if (name === 'react') return react;
        if (name === 'react-contexify') return { contextMenu: {} };
        return require(name);
      },
      testPreviewContainer: {
        useContainer: () => ({
          config: { isVSCode: true, locale },
          sourceUri: { current: 'file:///synthetic.md' },
          postMessage: (...args) => sent.push(args),
          clickSidebarTocButton() {},
          setShowBacklinks() {},
        }),
      },
    });
    const tree = api.default();
    const nodes = [];
    const visit = (node) => {
      if (Array.isArray(node)) return node.forEach(visit);
      if (node && typeof node === 'object') {
        nodes.push(node);
        visit(node.children);
      }
    };
    visit(tree);
    return { nodes, sent, value };
  }
  for (const mode of [false, true])
    test(`${mode ? 'publication' : 'reading'} copy shows countdown and accessible cancellation in actual component output`, () => {
      for (const locale of ['en', 'zh-cn']) {
        const { nodes, sent, value } = render(mode, locale);
        const box = nodes.find(
          (node) => node.props.className === 'piper-publish-progress',
        );
        assert.ok(box);
        assert.equal(box.props.role, 'status');
        assert.equal(box.props['aria-live'], 'polite');
        const detail = nodes.find(
          (node) => node.props.className === 'piper-progress-detail',
        );
        assert.ok(detail);
        assert.match(
          detail.children.join(''),
          locale === 'en' ? /retrying in 4s/ : /4 秒后重试/,
        );
        assert.equal(
          nodes.find((node) => node.type === 'progress').props.value,
          value.value,
        );
        const cancel = nodes.find(
          (node) =>
            node.type === 'button' &&
            node.children.includes(locale === 'en' ? 'Cancel' : '取消'),
        );
        assert.ok(cancel);
        cancel.props.onClick();
        assert.equal(sent[0][0], 'piperPublishing');
        assert.equal(sent[0][1][0].action, 'cancel');
        if (mode)
          assert.equal(
            nodes.find(
              (node) => node.props.className === 'piper-publication-workspace',
            ).props.style.paddingTop,
            36 + 16 + 80 + 8,
          );
      }
    });
});
