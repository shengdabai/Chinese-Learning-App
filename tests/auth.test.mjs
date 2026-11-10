import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';

const load = (path, require, globals = {}) => {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', ...Object.keys(globals), code)(exports, require, ...Object.values(globals));
  return exports;
};

function mountPage(callback) {
  const slots = []; let index = 0;
  const react = {
    useState(initial) { const i = index++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = v; }]; },
    useRef(initial) { const i = index++; return slots[i] ??= { current: initial }; },
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  };
  const { AuthPage } = load('../src/features/auth/AuthPage.tsx', name => name === 'react'
    ? { ...react, default: react } : new Proxy({}, { get: (_, key) => key }));
  const nodes = n => !n || typeof n !== 'object' ? [] : [n, ...(n.props?.children ?? []).flat(Infinity).flatMap(nodes)];
  const render = () => { index = 0; return nodes(AuthPage({ onLogin: callback, onRegister: callback })); };
  const submit = () => render().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  const registering = () => render().find(n => n.type === 'button' && n.props.onClick).props.onClick();
  return { submit, registering, render };
}

for (const registering of [false, true]) {
  test(`auth form awaits ${registering ? 'registration' : 'login'} and prevents duplicate submissions`, async () => {
    let resolve, calls = 0;
    const pending = new Promise(r => { resolve = r; });
    const page = mountPage(() => { calls++; return pending; });
    if (registering) page.registering();
    const request = page.submit();
    assert.equal(page.render().find(n => n.type === 'Button').props.loading, true);
    void page.submit();
    assert.equal(calls, 1);
    resolve({ success: false, error: 'Fixture validation error.' });
    await request;
    assert.ok(page.render().some(n => n.props.children.includes('Fixture validation error.')));
    assert.equal(page.render().find(n => n.type === 'Button').props.loading, false);
  });
}

test('auth form catches rejected promises and permits another attempt', async () => {
  let calls = 0;
  const page = mountPage(async () => { calls++; throw new Error('private detail'); });
  await page.submit();
  assert.ok(page.render().some(n => n.props.children.includes('An unexpected error occurred. Please try again.')));
  assert.equal(page.render().find(n => n.type === 'Button').props.loading, false);
  await page.submit();
  assert.equal(calls, 2);
});

const account = { username: 'fixture', createdAt: 0, salt: 'a'.repeat(32), passwordHash: 'b'.repeat(64) };
function mountAuth(data = new Map(), failWrite, cryptoOverride) {
  let state;
  const react = { useState: initial => [initial, v => { state = v; }], useCallback: fn => fn, useEffect: fn => fn() };
  const storage = {
    getItem: k => data.get(k) ?? null,
    setItem(k, v) { if (k === failWrite) throw new Error('fixture quota error'); data.set(k, v); },
    removeItem: k => data.delete(k),
  };
  const crypto = { getRandomValues: bytes => bytes.fill(10), subtle: {
    importKey: async () => ({}), deriveBits: async () => new Uint8Array(32).fill(187).buffer,
  } };
  const { useAuth } = load('../src/features/auth/useAuth.ts', name => name === 'react' ? react : {
    clearSRSRecovery() {}, LearningStore: { clearRecovery() {} },
  }, { localStorage: storage, crypto: cryptoOverride ?? crypto });
  return { auth: useAuth(), get state() { return state; } };
}

for (const value of ['{}', '[null]', '[{"username":"fixture"}]', '{broken']) {
  test(`corrupt account storage is preserved and returns a failure: ${value}`, async () => {
    const data = new Map([['lingualens_users', value]]), page = mountAuth(data);
    for (const action of ['login', 'register']) {
      assert.equal((await page.auth[action]('new-fixture', 'password123')).success, false);
      assert.equal(data.get('lingualens_users'), value);
      assert.equal(page.state.user, null);
    }
  });
}

for (const key of ['lingualens_users', 'lingualens_auth']) {
  test(`registration does not report success when persisting ${key} fails`, async () => {
    const data = new Map(), page = mountAuth(data, key);
    const result = await page.auth.register('fixture', 'password123');
    assert.equal(result.success, false);
    assert.equal(page.state.user, null);
    if (key === 'lingualens_auth') {
      assert.match(result.error, /Account saved/);
      assert.equal(JSON.parse(data.get('lingualens_users'))[0].username, 'fixture');
    }
  });
}
test('login does not report success when session storage fails', async () => {
  const page = mountAuth(new Map([['lingualens_users', JSON.stringify([account])]]), 'lingualens_auth');
  assert.equal((await page.auth.login('fixture', 'password123')).success, false);
  assert.equal(page.state.user, null);
});
for (const value of [{}, [], { username: {}, createdAt: 0 }, { username: 'fixture', createdAt: -1 }]) {
  test(`invalid persisted session is ignored: ${JSON.stringify(value)}`, () => {
    const page = mountAuth(new Map([['lingualens_auth', JSON.stringify(value)]]));
    assert.equal(page.state.user, null);
  });
}
test('valid stored account can log in and a new account can register', async () => {
  const data = new Map([['lingualens_users', JSON.stringify([account])]]), page = mountAuth(data);
  assert.equal((await page.auth.login(' FIXTURE ', 'password123')).success, true);
  assert.equal(page.state.user.username, 'fixture');
  assert.equal((await page.auth.register('new-fixture', 'password123')).success, true);
  assert.equal(page.state.user.username, 'new-fixture');
  assert.equal(JSON.parse(data.get('lingualens_users')).length, 2);
});

test('real Web Crypto registration, password rejection, login and session restoration', async () => {
  const data = new Map(), page = mountAuth(data, undefined, webcrypto);
  assert.equal((await page.auth.register('fixture', 'password123')).success, true);
  const saved = JSON.parse(data.get('lingualens_users'))[0];
  assert.match(saved.salt, /^[a-f0-9]{32}$/);
  assert.match(saved.passwordHash, /^[a-f0-9]{64}$/);
  page.auth.logout();
  assert.equal(page.state.user, null);
  assert.deepEqual(await page.auth.login('fixture', 'wrong-password'), { success: false, error: 'Incorrect password.' });
  assert.equal(page.state.user, null);
  assert.equal((await page.auth.login('fixture', 'password123')).success, true);
  assert.equal(mountAuth(data).state.user.username, 'fixture');
});

test('registration requires eight characters without restricting existing login passwords', async () => {
  const data = new Map(), page = mountAuth(data);
  assert.deepEqual(await page.auth.register('fixture', 'short'), { success: false, error: 'Password must be at least 8 characters.' });
  assert.equal(data.size, 0);
  const form = mountPage(async () => ({ success: true }));
  assert.equal(form.render().find(n => n.props.id === 'password').props.minLength, 1);
  form.registering();
  assert.equal(form.render().find(n => n.props.id === 'password').props.minLength, 8);
});

test('unavailable Web Crypto returns a recoverable failure without persisting accounts', async () => {
  const data = new Map(), page = mountAuth(data, undefined, {});
  assert.equal((await page.auth.register('fixture', 'password123')).success, false);
  assert.equal(page.state.user, null);
  assert.equal(data.size, 0);
});
