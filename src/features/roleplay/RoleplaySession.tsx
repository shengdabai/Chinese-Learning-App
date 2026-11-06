import { createLiveClient } from '../../services/gemini';
import React, { useState, useRef, useEffect } from 'react';
import { LiveServerMessage, Modality } from "@google/genai";
import { Mic, Square, ArrowLeft } from 'lucide-react';
import { MODEL_LIVE } from '../../config/constants';
import { arrayBufferToBase64, base64ToFloat32Array, float32ToPCM16 } from '../../utils/audio';
import { Scenario } from './scenarios';
import { Loader2 } from 'lucide-react';
import { MediaSessionResources } from '../../utils/mediaSession';

interface RoleplaySessionProps {
    scenario: Scenario;
    onExit: () => void;
}

export const RoleplaySession: React.FC<RoleplaySessionProps> = ({ scenario, onExit }) => {
    const [connected, setConnected] = useState(false);
    const resourcesRef = useRef<MediaSessionResources | null>(null);
    const [micActive, setMicActive] = useState(false);
    const micActiveRef = useRef(false);
    const [status, setStatus] = useState<string>("Initializing...");
    const audioContextRef = useRef<AudioContext | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const nextStartTimeRef = useRef<number>(0);

    useEffect(() => {
        connect();
        return () => {
            resourcesRef.current?.dispose();
            resourcesRef.current = null;
        };
    }, []);

    const connect = async () => {
        if (resourcesRef.current?.active) return;
        const resources = new MediaSessionResources();
        resourcesRef.current = resources;
        nextStartTimeRef.current = 0;
        try {
            setStatus("Requesting microphone...");
            const stream = resources.trackStream(await navigator.mediaDevices.getUserMedia({ audio: true }));
            if (!resources.active) return;
            streamRef.current = stream;

            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            audioContextRef.current = audioCtx;
            resources.addCleanup(() => audioCtx.close());

            const ai = await createLiveClient();
            if (!resources.active) return;
            setStatus("Connecting to AI Persona...");

            const sessionPromise = resources.trackSession(ai.live.connect({
                model: MODEL_LIVE,
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } // Helper/Friendly voice
                    },
                    systemInstruction: scenario.systemInstruction,
                },
                callbacks: {
                    onopen: () => {
                        if (!resources.active) return;
                        setConnected(true);
                        setMicActive(true);
                        micActiveRef.current = true;
                        setStatus("Roleplay Active");

                        // Send initial greeting trigger if needed, or just let user start
                        // We could send a text prompt to kick it off, but for now rely on user or system greeting.

                        // Start Audio Streaming
                        const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                        inputAudioContextRef.current = inputCtx;
                        resources.addCleanup(() => inputCtx.close());
                        const source = inputCtx.createMediaStreamSource(stream);
                        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
                        scriptProcessorRef.current = processor;
                        resources.addCleanup(() => {
                            processor.onaudioprocess = null;
                            processor.disconnect();
                            source.disconnect();
                        });

                        processor.onaudioprocess = (e) => {
                            if (!resources.active || !micActiveRef.current) return;
                            const inputData = e.inputBuffer.getChannelData(0);
                            const pcm16 = float32ToPCM16(inputData);
                            const base64 = arrayBufferToBase64(pcm16.buffer as ArrayBuffer);

                            sessionPromise.then(session => {
                                if (!resources.active || !micActiveRef.current) return;
                                session.sendRealtimeInput({
                                    audio: {
                                        mimeType: "audio/pcm;rate=16000",
                                        data: base64
                                    }
                                });
                            }).catch(() => {});
                        };

                        source.connect(processor);
                        processor.connect(inputCtx.destination);
                    },
                    onmessage: async (msg: LiveServerMessage) => {
                        if (!resources.active) return;
                        const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                        if (audioData && audioContextRef.current) {
                            const ctx = audioContextRef.current;
                            const float32 = base64ToFloat32Array(audioData);
                            const buffer = ctx.createBuffer(1, float32.length, 24000);
                            buffer.getChannelData(0).set(float32);

                            const source = ctx.createBufferSource();
                            source.buffer = buffer;
                            source.connect(ctx.destination);

                            const currentTime = ctx.currentTime;
                            if (nextStartTimeRef.current < currentTime) {
                                nextStartTimeRef.current = currentTime;
                            }
                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += buffer.duration;
                        }
                    },
                    onclose: () => {
                        if (!resources.active) return;
                        disconnect();
                        setStatus("Disconnected");
                    },
                    onerror: (err) => {
                        if (!resources.active) return;
                        console.error("Live session connection error");
                        disconnect();
                        setStatus("Connection Error");
                    }
                }
            }));
            await sessionPromise;

        } catch (e) {
            if (!resources.active) return;
            disconnect();
            const message = e instanceof Error ? e.message : 'Unknown error';
            setStatus(`Failed to start session: ${message}`);
        }
    };

    const disconnect = () => {
        resourcesRef.current?.dispose();
        resourcesRef.current = null;
        scriptProcessorRef.current = null;
        inputAudioContextRef.current = null;
        audioContextRef.current = null;
        streamRef.current = null;
        nextStartTimeRef.current = 0;
        micActiveRef.current = false;
        setMicActive(false);
        setConnected(false);
    };

    const toggleMic = () => {
        const next = !micActive;
        setMicActive(next);
        micActiveRef.current = next;
    };

    // State for simulated coach feedback
    const [feedback, setFeedback] = useState<string | null>(null);

    // Simulated coach feedback loop
    useEffect(() => {
        if (!connected) return;
        const interval = setInterval(() => {
            const tips = [
                "Tip: Try using '请问' (May I ask) for politeness.",
                "Practice tip: Speak slowly and clearly.",
                "Don't forget to specify hot or cold drinks.",
                "You can ask '多少钱' (How much is it?) if unsure."
            ];
            // Randomly show a tip every 10-15 seconds
            if (Math.random() > 0.7) {
                setFeedback(tips[Math.floor(Math.random() * tips.length)]);
                setTimeout(() => setFeedback(null), 5000);
            }
        }, 10000);
        return () => clearInterval(interval);
    }, [connected]);

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] relative bg-slate-900 border-t border-slate-800">

            {/* Scenario Header */}
            <div className="absolute top-0 left-0 right-0 z-10 p-4">
                <div className="max-w-md mx-auto bg-black/40 backdrop-blur-md rounded-xl p-4 border border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-xl shadow-lg">
                            {scenario.emoji}
                        </div>
                        <div>
                            <h3 className="text-white font-bold text-sm">{scenario.title}</h3>
                            <p className="text-slate-400 text-xs truncate max-w-[150px]">{scenario.description}</p>
                        </div>
                    </div>
                    <button
                        onClick={onExit}
                        aria-label="Exit roleplay"
                        className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
                    >
                        <ArrowLeft size={20} />
                    </button>
                </div>
            </div>

            {/* Main Visual */}
            <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
                {/* Coach Feedback Overlay */}
                {feedback && (
                    <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-blue-600/90 backdrop-blur-md text-white px-6 py-3 rounded-full text-sm font-medium shadow-xl animate-in fade-in slide-in-from-top-4 z-20 transition-all">
                        ✨ {feedback}
                    </div>
                )}

                {!connected ? (
                    <div className="flex flex-col items-center text-slate-400 animate-pulse">
                        <Loader2 className="animate-spin mb-4" size={40} />
                        <p>{status}</p>
                    </div>
                ) : (
                    <div className="relative">
                        <div className="w-48 h-48 rounded-full bg-gradient-to-b from-blue-500 to-indigo-600 flex items-center justify-center shadow-[0_0_60px_rgba(59,130,246,0.5)] animate-pulse-slow">
                            <div className="w-40 h-40 rounded-full bg-slate-900 flex items-center justify-center">
                                <div className="w-32 h-32 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden">
                                    <span className="text-6xl">{scenario.emoji}</span>
                                </div>
                            </div>
                        </div>
                        <div className="mt-12 text-center space-y-2">
                            <div className="px-4 py-2 bg-white/10 rounded-full inline-block backdrop-blur-sm border border-white/5">
                                <p className="text-blue-200 text-sm font-medium">AI is listening...</p>
                            </div>
                            <p className="text-slate-500 text-xs max-w-xs mx-auto text-center italic opacity-70">
                                "{scenario.initialPrompt}"
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Controls */}
            {connected && (
                <div className="p-8 pb-12 flex justify-center items-center gap-8">
                    <button
                        onClick={toggleMic}
                        aria-label={micActive ? "Mute microphone" : "Unmute microphone"}
                        aria-pressed={micActive}
                        className={`p-6 rounded-full transition-all duration-200 active:scale-95 shadow-xl ${micActive ? 'bg-white text-slate-900 hover:bg-slate-200' : 'bg-red-500/20 text-red-500 ring-1 ring-red-500/30'}`}
                    >
                        {micActive ? <Mic size={32} /> : <div className="relative"><Mic size={32} /><div className="absolute inset-0 border-t-2 border-red-500 rotate-45 top-1/2 left-0 w-full" /></div>}
                    </button>

                    <button
                        onClick={onExit}
                        aria-label="Exit roleplay"
                        className="p-6 rounded-full bg-red-600 text-white hover:bg-red-500 transition-all shadow-lg shadow-red-600/30 active:scale-95"
                    >
                        <Square size={32} fill="currentColor" />
                    </button>
                </div>
            )}

        </div>
    );
};
