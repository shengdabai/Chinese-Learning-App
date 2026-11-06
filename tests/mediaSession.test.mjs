import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

// Compile the dependency-free helper with the project's locked TypeScript.
const source = await readFile(new URL('../src/utils/mediaSession.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const { MediaSessionResources, captureVideoFrame } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

test('disconnect releases all resources once, even when one cleanup throws', () => {
  const resources = new MediaSessionResources();
  const calls = [];
  resources.addCleanup(() => calls.push('socket'));
  resources.addCleanup(() => { throw new Error('already closed'); });
  resources.addCleanup(() => calls.push('microphone'));
  resources.dispose();
  resources.dispose();
  assert.equal(resources.active, false);
  assert.deepEqual(calls, ['microphone', 'socket']);
});

test('permission granted after exit immediately stops every media track', () => {
  const resources = new MediaSessionResources();
  resources.dispose();
  let stops = 0;
  resources.trackStream({ getTracks: () => [{ stop: () => stops++ }, { stop: () => stops++ }] });
  assert.equal(stops, 2);
});

test('a session resolving after exit closes without becoming usable', async () => {
  const resources = new MediaSessionResources();
  let resolve;
  let closes = 0;
  const pending = resources.trackSession(new Promise(done => { resolve = done; }));
  resources.dispose();
  resolve({ close: () => closes++ });
  await pending;
  assert.equal(closes, 1);
  assert.equal(resources.active, false);
});

test('an established session closes on exit', async () => {
  const resources = new MediaSessionResources();
  let closes = 0;
  await resources.trackSession(Promise.resolve({ close: () => closes++ }));
  resources.dispose();
  assert.equal(closes, 1);
});

test('connection rejection propagates to the owner for failure cleanup', async () => {
  const resources = new MediaSessionResources();
  await assert.rejects(resources.trackSession(Promise.reject(new Error('offline'))), /offline/);
});

test('asynchronous cleanup rejection is handled', async () => {
  const resources = new MediaSessionResources();
  resources.addCleanup(() => Promise.reject(new Error('closed context')));
  resources.dispose();
  resources.addCleanup(() => Promise.reject(new Error('late cleanup')));
  await new Promise(resolve => setImmediate(resolve));
});

test('video pause and unready video skip both capture and serialization', () => {
  const canvas = { getContext() { assert.fail('must not capture'); } };
  assert.equal(captureVideoFrame({ videoWidth: 640, videoHeight: 480 }, canvas, false), null);
  assert.equal(captureVideoFrame({ videoWidth: 0, videoHeight: 0 }, canvas, true), null);
  assert.equal(captureVideoFrame(null, canvas, true), null);
});

test('enabled ready video captures a JPEG frame at half resolution', () => {
  const draws = [];
  const video = { videoWidth: 640, videoHeight: 480 };
  const canvas = {
    getContext: () => ({ drawImage: (...args) => draws.push(args) }),
    toDataURL: (type, quality) => {
      assert.equal(type, 'image/jpeg');
      assert.equal(quality, 0.6);
      return 'data:image/jpeg;base64,frame';
    },
  };
  assert.equal(captureVideoFrame(video, canvas, true), 'frame');
  assert.equal(canvas.width, 320);
  assert.equal(canvas.height, 240);
  assert.deepEqual(draws, [[video, 0, 0, 320, 240]]);
});
