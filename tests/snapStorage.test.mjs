import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const load = (path, require = () => ({}), globals = {}) => {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  const exports = {};
  new Function('exports', 'require', ...Object.keys(globals), code)(exports, require, ...Object.values(globals));
  return exports;
};
const card = { id: 'fixture', word: '杯', pinyin: 'bēi', english: 'cup', interval: 0, easeFactor: 2.5, repetitions: 0, nextReview: 0, addedAt: 0 };
for (const value of [{}, null, [null], [card, { ...card, interval: -1 }], [{ ...card, word: 3 }]]) {
  test(`SRS rejects invalid saved structure: ${JSON.stringify(value)}`, () => {
    const storage = { getItem: () => JSON.stringify(value) };
    const engine = load('../src/features/srs/srsEngine.ts', undefined, { localStorage: storage });
    assert.deepEqual(engine.loadSRSCards(), Array.isArray(value) && value[0] === card ? [card] : []);
  });
}
test('profile rejects invalid saved shape and returns independent defaults', () => {
  const { LearningStore } = load('../src/store/learningStore.ts', undefined, { localStorage: { getItem: () => '{"quests":{}}' } });
  const first = LearningStore.loadProfile();
  assert.ok(Array.isArray(first.quests));
  first.quests[0].completed = true;
  assert.equal(LearningStore.loadProfile().quests[0].completed, false);
});
function mountSnap() {
  const slots = [], effects = [], permissions = [], analysis = deferred(); let index = 0, completed = 0;
  const video = { videoWidth: 640, videoHeight: 480, play: async () => {} };
  const canvas = { getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,ZmFrZQ==' };
  const react = { useState(initial) { const i = index++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => slots[i] = v]; },
    useRef(initial) { return slots[index++] ??= { current: initial }; },
    useEffect(fn, deps) { const i = index++; if (!slots[i] || deps.some((v, j) => v !== slots[i].deps[j])) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
    createElement(type, props, ...children) { if (props?.ref) props.ref.current = type === 'video' ? video : canvas; return { type, props: { ...props, children } }; } };
  const component = load('../src/features/snap/SnapMode.tsx', name => {
    if (name === 'react') return { ...react, default: react };
    if (name === '@google/genai') return { GoogleGenAI: class { models = { generateContent: () => analysis.promise }; }, Type: {} };
    if (name.endsWith('/gemini')) return { analyzePhoto: () => analysis.promise };
    return new Proxy({}, { get: (_, p) => p });
  }, { navigator: { mediaDevices: { getUserMedia() { const p = deferred(); permissions.push(p); return p.promise; } } } }).SnapMode;
  let tree;
  const render = () => { index = 0; tree = component({ onSnapComplete: () => completed++ }); effects.splice(0).forEach(fn => fn()); };
  const nodes = n => !n || typeof n !== 'object' ? [] : [n, ...(n.props?.children ?? []).flat(Infinity).flatMap(nodes)];
  const click = label => { render(); const n = nodes(tree).find(n => n.props.onClick && (n.props['aria-label'] === label || n.props.children.includes(label) || (label === 'capture' && n.type === 'button'))); assert.ok(n, label); return n.props.onClick(); };
  render();
  return { permissions, click, analysis, get completed() { return completed; }, unmount: () => slots.forEach(s => s?.cleanup?.()) };
}
const stream = () => { const track = { stops: 0, stop() { this.stops++; } }; return { track, getTracks: () => [track] }; };
test('Snap stops camera that resolves after unmount', async () => {
  const app = mountSnap(), camera = stream(); app.unmount(); app.permissions[0].resolve(camera); await flush(); assert.equal(camera.track.stops, 1);
});
test('Snap retake stops practice and old camera; duplicate practice requests are ignored', async () => {
  const app = mountSnap(), camera = stream(), mic = stream(); app.permissions[0].resolve(camera); await flush();
  app.click('capture'); app.analysis.resolve({ ...card, chinese: '杯', text: JSON.stringify({ ...card, chinese: '杯' }) }); await flush();
  void app.click('Practice'); void app.click('Practice'); assert.equal(app.permissions.length, 2);
  app.permissions[1].resolve(mic); await flush(); app.click('Capture New Item'); assert.equal(mic.track.stops, 1); assert.equal(camera.track.stops, 1); app.unmount();
});
test('Snap ignores analysis after exit', async () => {
  const app = mountSnap(); app.permissions[0].resolve(stream()); await flush(); app.click('capture'); app.unmount();
  app.analysis.resolve({ ...card, chinese: '杯', text: JSON.stringify({ ...card, chinese: '杯' }) }); await flush(); assert.equal(app.completed, 0);
});

test('Snap stops practice microphone that resolves after exit', async () => {
  const app = mountSnap(), mic = stream(); app.permissions[0].resolve(stream()); await flush(); app.click('capture');
  app.analysis.resolve({ ...card, chinese: '杯', text: JSON.stringify({ ...card, chinese: '杯' }) }); await flush();
  void app.click('Practice'); app.unmount(); app.permissions[1].resolve(mic); await flush(); assert.equal(mic.track.stops, 1);
});
test('Profile counts completed quests and labels the chart as sample data', () => {
  const react = { createElement: (type, props, ...children) => ({ type, props, children }) };
  const { ProfilePage } = load('../src/features/profile/ProfilePage.tsx', name => name === 'react' ? { ...react, default: react } : new Proxy({}, { get: (_, p) => p }));
  const tree = ProfilePage({ profile: { level: 1, xp: 900, streak: 1, quests: [{ completed: true }, { completed: false }] } });
  const nodes = n => !n || typeof n !== 'object' ? [] : [n, ...(n.children ?? []).flat(Infinity).flatMap(nodes)];
  const all = nodes(tree), count = all.findIndex(n => n.children.includes('Quests Done'));
  assert.equal(all[count - 1].children[0], 1);
  assert.ok(all.some(n => n.children.includes('Learning Curve (sample data)')));
});
for (const [path, key, save, value] of [
  ['../src/features/srs/srsEngine.ts', 'lingualens_srs_cards', m => m.saveSRSCards, []],
  ['../src/store/learningStore.ts', 'lingualens_user_profile', m => m.LearningStore.saveProfile, { quests: [] }],
]) test(`storage preserves the original bytes before replacement: ${key}`, () => {
  const data = new Map([[key, '{"invalid":"fixture"}']]);
  const storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const write = save(load(path, undefined, { localStorage: storage })); write(value); write(value);
  assert.equal(data.get(`${key}_recovery`), '{"invalid":"fixture"}');
  assert.equal(data.get(key), JSON.stringify(value));
});

function mountAuth(storage) {
  let state;
  const react = {
    useState(initial) { state = initial; return [state, value => { state = value; }]; },
    useCallback: fn => fn, useEffect: fn => fn(),
  };
  const globals = { localStorage: storage };
  const { useAuth } = load('../src/features/auth/useAuth.ts', name => {
    if (name === 'react') return react;
    if (name.endsWith('/srsEngine')) return load('../src/features/srs/srsEngine.ts', undefined, globals);
    if (name.endsWith('/learningStore')) return load('../src/store/learningStore.ts', undefined, globals);
    throw new Error(`Unexpected auth dependency: ${name}`);
  }, globals);
  return { auth: useAuth(), get state() { return state; } };
}
test('logout clears both recovery copies, preserves learning data and allows a fresh backup', () => {
  const keys = ['lingualens_srs_cards', 'lingualens_user_profile'];
  const data = new Map([
    ['lingualens_auth', JSON.stringify({ username: 'fixture', createdAt: 0 })],
    ['lingualens_users', 'fixture account records'], ['unrelated', 'fixture preference'],
    ...keys.flatMap(key => [[key, 'fixture current data'], [`${key}_recovery`, 'fixture old backup']]),
  ]);
  const storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
  const app = mountAuth(storage);
  app.auth.logout();
  assert.equal(data.has('lingualens_auth'), false);
  assert.deepEqual(app.state, { user: null, isLoading: false });
  for (const key of keys) {
    assert.equal(data.has(`${key}_recovery`), false, `${key} recovery must be removed`);
    assert.equal(data.get(key), 'fixture current data');
  }
  assert.equal(data.get('lingualens_users'), 'fixture account records');
  assert.equal(data.get('unrelated'), 'fixture preference');
  const globals = { localStorage: storage };
  load('../src/features/srs/srsEngine.ts', undefined, globals).saveSRSCards([]);
  load('../src/store/learningStore.ts', undefined, globals).LearningStore.saveProfile({ quests: [] });
  for (const key of keys) assert.equal(data.get(`${key}_recovery`), 'fixture current data');
});
test('logout without recovery copies remains safe and repeatable', () => {
  const data = new Map();
  const storage = { getItem: k => data.get(k) ?? null, removeItem: k => data.delete(k) };
  const app = mountAuth(storage);
  app.auth.logout(); app.auth.logout();
  assert.equal(data.size, 0);
  assert.deepEqual(app.state, { user: null, isLoading: false });
});
test('a recovery removal failure does not stop logout or the other recovery cleanup', () => {
  const data = new Map([['lingualens_auth', '{}'], ['lingualens_user_profile_recovery', 'fixture backup']]);
  const storage = {
    getItem: k => data.get(k) ?? null,
    removeItem(k) {
      if (k === 'lingualens_srs_cards_recovery') throw new Error('fixture storage unavailable');
      data.delete(k);
    },
  };
  const app = mountAuth(storage);
  app.auth.logout();
  assert.equal(data.has('lingualens_auth'), false);
  assert.equal(data.has('lingualens_user_profile_recovery'), false);
  assert.deepEqual(app.state, { user: null, isLoading: false });
});
