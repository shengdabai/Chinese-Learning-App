import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText;
const helperModule = { exports: {} };
new Function('exports', compile(readFileSync(new URL('../src/utils/mediaSession.ts', import.meta.url), 'utf8')))(helperModule.exports);

// A small hook/host harness executes the actual components with fake hardware and SDK.
// It checks lifecycle and event wiring; it does not claim browser layout or React DOM coverage.
function mount(mode, { key = 'fake-test-key' } = {}) {
  const permission = deferred();
  const connection = deferred();
  const intervals = new Map();
  const contexts = [];
  const processors = [];
  const sent = [];
  const tracks = [
    { enabled: true, stops: 0, stop() { this.stops++; } },
    { enabled: true, stops: 0, stop() { this.stops++; } },
  ];
  const stream = { getTracks: () => tracks, getVideoTracks: () => [tracks[1]] };
  let requests = 0, connects = 0, closes = 0, captures = 0, callbacks;
  const video = { videoWidth: 640, videoHeight: 480, play: () => Promise.resolve() };
  const canvas = {
    getContext: () => ({ drawImage: () => captures++ }),
    toDataURL: () => 'data:image/jpeg;base64,frame',
  };
  class AudioContext {
    constructor() { this.closes = 0; contexts.push(this); }
    close() { this.closes++; return Promise.resolve(); }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createScriptProcessor() {
      const processor = { disconnect() {}, connect() {}, onaudioprocess: null };
      processors.push(processor);
      return processor;
    }
  }
  class GoogleGenAI {
    live = { connect(options) { connects++; callbacks = options.callbacks; return connection.promise; } };
  }
  const socket = { close: () => closes++, sendRealtimeInput: value => sent.push(value) };
  const slots = [];
  const effects = [];
  let index = 0;
  const react = {
    useState(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
      return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }];
    },
    useRef(initial) {
      const slot = index++;
      return slots[slot] ??= { current: initial };
    },
    useEffect(callback, deps) {
      const slot = index++;
      if (!slots[slot] || deps.some((value, i) => value !== slots[slot].deps[i])) {
        effects.push(() => {
          slots[slot]?.cleanup?.();
          slots[slot] = { deps, cleanup: callback() };
        });
      }
    },
    createElement(type, props, ...children) {
      if (type === 'video' && props?.ref) props.ref.current = video;
      if (type === 'canvas' && props?.ref) props.ref.current = canvas;
      return { type, props: { ...props, children } };
    },
  };
  const fakeWindow = {
    AudioContext,
    setInterval(callback) { const id = intervals.size + 1; intervals.set(id, callback); return id; },
  };
  const file = mode === 'live' ? 'LiveMode' : 'RoleplaySession';
  const path = new URL(`../src/features/${mode === 'live' ? 'live' : 'roleplay'}/${file}.tsx`, import.meta.url);
  const source = readFileSync(path, 'utf8');
  const module = { exports: {} };
  const require = name => {
    if (name === 'react') return { ...react, default: react };
    if (name.endsWith('/gemini')) return { createLiveClient: async () => { if (!key) throw new Error('service unavailable'); return new GoogleGenAI(); } };
    if (name === '@google/genai') return { GoogleGenAI, Modality: { AUDIO: 'AUDIO' } };
    if (name.endsWith('/mediaSession')) return helperModule.exports;
    if (name.endsWith('/audio')) return { float32ToPCM16: () => new Uint8Array(2), arrayBufferToBase64: () => 'audio' };
    return new Proxy({}, { get: (_, property) => property });
  };
  new Function('require', 'exports', 'window', 'navigator', 'clearInterval', 'setInterval', compile(source))(
    require, module.exports, fakeWindow, { mediaDevices: { getUserMedia() { requests++; return permission.promise; } } },
    id => intervals.delete(id), fakeWindow.setInterval,
  );
  const component = module.exports[file];
  let tree;
  const render = () => {
    index = 0;
    tree = component({ scenario: { title: 'Test', systemInstruction: 'test' }, onExit() {} });
    effects.splice(0).forEach(effect => effect());
    return tree;
  };
  const elements = node => !node || typeof node !== 'object' ? [] : [node, ...(node.props?.children ?? []).flat(Infinity).flatMap(elements)];
  const click = label => {
    render();
    const button = elements(tree).find(node => node.type === 'button' && (
      node.props['aria-label'] === label || node.props.children.includes(label)
    ));
    assert.ok(button, `button ${label} exists`);
    return button.props.onClick();
  };
  render();
  return {
    click, render, stream, tracks, contexts, processors, sent, permission, connection,
    get requests() { return requests; }, get connects() { return connects; },
    get closes() { return closes; }, get captures() { return captures; },
    get callbacks() { return callbacks; },
    get timers() { return intervals.size; },
    tick() { [...intervals.values()].forEach(callback => callback()); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
    async open() {
      if (mode === 'live') void this.click('Start Session');
      permission.resolve(stream);
      await flush();
      callbacks.onopen();
      connection.resolve(socket);
      await flush();
      render();
    },
  };
}

for (const mode of ['live', 'roleplay']) {
  test(`${mode}: unmount closes socket, audio contexts and tracks`, async () => {
    const app = mount(mode);
    await app.open();
    app.unmount();
    assert.equal(app.closes, 1);
    assert.ok(app.contexts.every(context => context.closes === 1));
    assert.ok(app.tracks.every(track => track.stops === 1));
    assert.equal(app.timers, 0);
  });

  test(`${mode}: exit before permission resolves stops late tracks without connecting`, async () => {
    const app = mount(mode);
    if (mode === 'live') void app.click('Start Session');
    app.unmount();
    app.permission.resolve(app.stream);
    await flush();
    assert.ok(app.tracks.every(track => track.stops === 1));
    assert.equal(app.connects, 0);
  });

  test(`${mode}: failed connection releases hardware`, async () => {
    const app = mount(mode);
    if (mode === 'live') void app.click('Start Session');
    app.permission.resolve(app.stream);
    await flush();
    app.connection.reject(new Error('offline'));
    await flush();
    assert.ok(app.tracks.every(track => track.stops === 1));
    assert.ok(app.contexts.every(context => context.closes === 1));
    app.unmount();
  });

  test(`${mode}: token issuance failure releases hardware without SDK calls`, async () => {
    const app = mount(mode, { key: '' });
    if (mode === 'live') void app.click('Start Session');
    app.permission.resolve(app.stream);
    await flush();
    assert.equal(app.connects, 0);
    assert.ok(app.tracks.every(track => track.stops === 1));
    assert.ok(app.contexts.every(context => context.closes === 1));
    app.unmount();
  });

  test(`${mode}: server close releases active resources`, async () => {
    const app = mount(mode);
    await app.open();
    app.callbacks.onclose();
    app.render();
    assert.ok(app.tracks.every(track => track.stops === 1));
    assert.equal(app.closes, 1);
    assert.equal(app.timers, 0);
    app.unmount();
  });

  test(`${mode}: session resolving after exit closes and ignores late callbacks`, async () => {
    const app = mount(mode);
    if (mode === 'live') void app.click('Start Session');
    app.permission.resolve(app.stream);
    await flush();
    app.unmount();
    app.callbacks.onopen();
    app.connection.resolve({ close() { this.closed = true; }, closed: false });
    const socket = await app.connection.promise;
    await flush();
    assert.equal(socket.closed, true);
    assert.equal(app.contexts.length, 1);
    assert.equal(app.processors.length, 0);
    assert.equal(app.timers, 0);
  });

  test(`${mode}: audio queued before mute is discarded`, async () => {
    const app = mount(mode);
    await app.open();
    app.processors[0].onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(2) } });
    app.click('Mute microphone');
    await flush();
    assert.equal(app.sent.length, 0);
    app.unmount();
  });
}

test('Live: pause skips capture and sending; resume and reconnect preserve the chosen state', async () => {
  const app = mount('live');
  await app.open();
  app.click('Pause video');
  assert.equal(app.tracks[1].enabled, false);
  app.tick();
  await flush();
  assert.equal(app.captures, 0);
  assert.equal(app.sent.length, 0);
  app.click('Resume video');
  assert.equal(app.tracks[1].enabled, true);
  app.tick();
  await flush();
  assert.equal(app.sent.length, 1);
  app.click('Pause video');
  app.click('End session');
  assert.equal(app.closes, 1);
  assert.equal(app.timers, 0);
  void app.click('Start Session');
  await flush();
  assert.equal(app.tracks[1].enabled, false);
  app.unmount();
});

test('Live: repeated start clicks create only one pending media request', () => {
  const app = mount('live');
  void app.click('Start Session');
  void app.click('Connecting...');
  assert.equal(app.requests, 1);
  app.unmount();
});

test('Live: queued frame is discarded when video pauses before session send', async () => {
  const app = mount('live');
  await app.open();
  app.tick();
  app.click('Pause video');
  await flush();
  assert.equal(app.sent.length, 0);
  app.unmount();
});

