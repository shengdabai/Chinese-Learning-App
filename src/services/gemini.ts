import { GoogleGenAI } from '@google/genai';
import type { AnalysisResult } from '../types';

export function isAnalysisResult(value: unknown): value is AnalysisResult {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return ['chinese', 'pinyin', 'english', 'sentence', 'sentencePinyin', 'sentenceEnglish'].every(k => typeof v[k] === 'string' && (v[k] as string).trim().length > 0)
        && ['funFact', 'commonMistake'].every(k => v[k] === undefined || typeof v[k] === 'string')
        && (v.hskLevel === undefined || (Number.isInteger(v.hskLevel) && Number(v.hskLevel) >= 1 && Number(v.hskLevel) <= 6))
        && (v.radicals === undefined || (Array.isArray(v.radicals) && v.radicals.every(r => typeof r === 'string')));
}

async function post(path: string, body: object, signal?: AbortSignal) {
    if (signal?.aborted) throw signal.reason;
    const controller = new AbortController();
    const cancel = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', cancel, { once: true });
    const timeoutError = new Error('AI service request timed out. Please try again.');
    const timer = setTimeout(() => controller.abort(timeoutError), 30_000);
    try {
        const response = await fetch(`/api/gemini/${path}`, { method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
        if (!response.ok) throw new Error('AI service unavailable. Please try again.');
        return await response.json();
    } catch (error) {
        if (controller.signal.reason === timeoutError) throw timeoutError;
        throw error;
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
    }
}
export async function analyzePhoto(image: string, signal?: AbortSignal): Promise<AnalysisResult> {
    const result = await post('snap', { image }, signal);
    if (!isAnalysisResult(result)) throw new Error('Invalid analysis response. Please try again.');
    return result;
}
export async function createLiveClient(): Promise<GoogleGenAI> {
    const { token } = await post('live-token', {});
    if (typeof token !== 'string' || !token.startsWith('auth_tokens/')) throw new Error('Invalid session token.');
    // Pinned SDK 1.31 uses the v1alpha ephemeral-token WebSocket endpoint.
    return new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: 'v1alpha' } });
}
