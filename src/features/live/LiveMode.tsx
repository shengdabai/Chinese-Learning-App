import { createLiveClient } from '../../services/gemini';
import React, { useState, useRef, useEffect } from 'react';
import { LiveServerMessage, Modality, Session } from "@google/genai";
import { Sparkles, ChevronRight, Mic, Video, Square } from 'lucide-react';
import { MODEL_LIVE } from '../../config/constants';
import { arrayBufferToBase64, base64ToFloat32Array, float32ToPCM16 } from '../../utils/audio';
import { ToneVisualizer } from '../../components/ToneVisualizer';
import { MediaSessionResources, captureVideoFrame } from '../../utils/mediaSession';

interface LiveModeProps {
    onSessionStart?: () => void;
}

export const LiveMode: React.FC<LiveModeProps> = ({ onSessionStart }) => {
    const [connected, setConnected] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const resourcesRef = useRef<MediaSessionResources | null>(null);
    const [micActive, setMicActive] = useState(false);
    const micActiveRef = useRef(false);
    const [videoActive, setVideoActive] = useState(true);
    const videoActiveRef = useRef(true);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const activeSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
    const nextStartTimeRef = useRef<number>(0);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const intervalRef = useRef<number | null>(null);
    const [status, setStatus] = useState<string>("Ready to connect");

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            resourcesRef.current?.dispose();
            resourcesRef.current = null;
        };
    }, []);

    const connectWithCallbacks = async () => {
        if (resourcesRef.current?.active) return;
        const resources = new MediaSessionResources();
        resourcesRef.current = resources;
        setConnecting(true);
        nextStartTimeRef.current = 0;
        try {
            setStatus("Initializing hardware...");

            const stream = resources.trackStream(await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 640, height: 480 } }));
            if (!resources.active) return;
            stream.getVideoTracks().forEach(track => { track.enabled = videoActiveRef.current; });
            streamRef.current = stream;

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                void videoRef.current.play().catch(() => {});
            }

            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            audioContextRef.current = audioCtx;
            resources.addCleanup(() => audioCtx.close());

            const ai = await createLiveClient();
            if (!resources.active) return;
            setStatus("Connecting to Gemini Live...");

            const sessionPromise = resources.trackSession(ai.live.connect({
                model: MODEL_LIVE,
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } }
                    },
                    systemInstruction: "You are an expert Chinese language tutor for business professionals. Your goal is to help the user learn Chinese vocabulary and pronunciation based on what they show you or say. Always provide the Mandarin Chinese word and Pinyin when identifying objects. Keep your responses concise, encouraging, and professional. If the user is silent, ask them to show you something.",
                },
                callbacks: {
                    onopen: () => {
                        if (!resources.active) return;
                        setConnecting(false);
                        setConnected(true);
                        setMicActive(true);
                        micActiveRef.current = true;
                        setStatus("Session Active");
                        if (onSessionStart) onSessionStart();

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
                            const base64 = arrayBufferToBase64(pcm16.buffer);

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

                        startVideoStreaming(sessionPromise, resources);
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
                            activeSourceNodeRef.current = source;
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
                        setStatus("Error connecting");
                        setConnected(false);
                    }
                }
            }));
            await sessionPromise;

        } catch (e) {
            if (!resources.active) return;
            disconnect();
            const message = e instanceof Error ? e.message : 'Unknown error';
            setStatus(`Failed to start: ${message}`);
        }
    };

    const startVideoStreaming = (sessionPromise: Promise<Session>, resources: MediaSessionResources) => {
        const interval = window.setInterval(() => {
            if (!resources.active) return;
            const base64 = captureVideoFrame(videoRef.current, canvasRef.current, videoActiveRef.current);
            if (!base64) return;
            sessionPromise.then(session => {
                if (!resources.active || !videoActiveRef.current) return;
                session.sendRealtimeInput({ media: { mimeType: "image/jpeg", data: base64 } });
            }).catch(() => {});
        }, 1000);
        intervalRef.current = interval;
        resources.addCleanup(() => clearInterval(interval));
    };

    const disconnect = () => {
        resourcesRef.current?.dispose();
        resourcesRef.current = null;
        scriptProcessorRef.current = null;
        inputAudioContextRef.current = null;
        audioContextRef.current = null;
        streamRef.current = null;
        intervalRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        nextStartTimeRef.current = 0;
        micActiveRef.current = false;
        setMicActive(false);
        setConnected(false);
        setConnecting(false);
        setStatus("Ready to connect");
    };

    const toggleMic = () => {
        const next = !micActive;
        setMicActive(next);
        micActiveRef.current = next;
    };

    const toggleVideo = () => {
        const next = !videoActiveRef.current;
        videoActiveRef.current = next;
        streamRef.current?.getVideoTracks().forEach(track => { track.enabled = next; });
        setVideoActive(next);
    };

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] relative">
            <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-slate-900 rounded-2xl mx-4 my-2 shadow-2xl border border-slate-800">
                <video
                    ref={videoRef}
                    className={`w-full h-full object-cover transition-opacity duration-700 ${connected ? 'opacity-100' : 'opacity-40 blur-sm'}`}
                    muted
                    playsInline
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Overlay Status */}
                <div className="absolute top-6 left-6 z-10 flex flex-col gap-2 pointer-events-none">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider backdrop-blur-md shadow-sm transition-colors duration-500 ${connected ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-slate-700/50 text-slate-300 border border-slate-600'}`}>
                        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-red-500 animate-pulse' : 'bg-slate-400'}`} />
                        {connected ? 'Live Session' : 'Offline'}
                    </div>
                    {connected && (
                        <div className="flex flex-col gap-2 items-start animate-in slide-in-from-left-2 transition-all">
                            <div className="px-3 py-1 bg-black/40 backdrop-blur-md rounded-md text-sm text-slate-200 border border-white/10 max-w-xs">
                                Listening & Watching...
                            </div>
                            <div className="bg-black/40 backdrop-blur-md rounded-lg p-1 border border-white/10 mt-1">
                                <ToneVisualizer stream={streamRef.current} height={30} width={100} isActive={micActive} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Start Screen Overlay */}
                {!connected && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-20 p-6 text-center animate-in fade-in duration-500">
                        <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-blue-500/20 ring-4 ring-white/10">
                            <Sparkles className="text-white" size={36} />
                        </div>
                        <h2 className="text-3xl font-bold text-white mb-3 tracking-tight">Real-time Tutor</h2>
                        <p className="text-slate-300 max-w-md mb-8 leading-relaxed">
                            Experience the future of language learning. Start a live video conversation to practice in real-time.
                        </p>
                        <button
                            onClick={connectWithCallbacks}
                            disabled={connecting}
                            className="group relative flex items-center gap-3 bg-white text-slate-900 px-8 py-3.5 rounded-full font-bold hover:bg-slate-50 transition-all active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.15)] hover:shadow-[0_0_40px_rgba(255,255,255,0.3)]"
                        >
                            {connecting ? 'Connecting...' : 'Start Session'}
                            <ChevronRight size={18} className="text-slate-400 group-hover:translate-x-1 transition-transform" />
                        </button>
                        <p className="mt-6 text-xs text-slate-500 font-mono tracking-wide">{status}</p>
                    </div>
                )}
            </div>

            {/* Controls Bar */}
            {connected && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 animate-in slide-in-from-bottom-5">
                    <div className="flex items-center gap-6 px-10 py-5 bg-black/60 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl">
                        <button
                            onClick={toggleMic}
                            aria-label={micActive ? "Mute microphone" : "Unmute microphone"}
                            aria-pressed={micActive}
                            className={`p-4 rounded-full transition-all duration-200 ${micActive ? 'bg-white text-slate-900 hover:bg-slate-200 scale-100' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30 ring-1 ring-red-500/30'}`}
                        >
                            {micActive ? <Mic size={24} /> : <div className="relative"><Mic size={24} /><div className="absolute inset-0 border-t-2 border-red-400 rotate-45 top-1/2 left-0 w-full" /></div>}
                        </button>

                        <div className="w-px h-8 bg-white/10" />

                        <button
                            onClick={toggleVideo}
                            aria-label={videoActive ? "Pause video" : "Resume video"}
                            aria-pressed={videoActive}
                            className={`p-4 rounded-full transition-all duration-200 ${videoActive ? 'bg-slate-700/50 text-white hover:bg-slate-600/50' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30 ring-1 ring-red-500/30'}`}
                        >
                            {videoActive ? <Video size={24} /> : <div className="relative"><Video size={24} /><div className="absolute inset-0 border-t-2 border-red-400 rotate-45 top-1/2 left-0 w-full" /></div>}
                        </button>

                        <div className="w-px h-8 bg-white/10" />

                        <button
                            onClick={disconnect}
                            aria-label="End session"
                            className="p-4 rounded-full bg-red-600 text-white hover:bg-red-500 transition-all shadow-lg shadow-red-600/30 hover:shadow-red-500/50 active:scale-95"
                        >
                            <Square size={24} fill="currentColor" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
