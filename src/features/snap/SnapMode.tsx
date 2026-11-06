import React, { useState, useRef, useEffect } from 'react';
import { analyzePhoto } from '../../services/gemini';
import { Camera, Volume2, Mic, X, Loader2, BookPlus } from 'lucide-react';
import { AnalysisResult } from '../../types';
import { ToneVisualizer } from '../../components/ToneVisualizer';
import { Button } from '../../components/ui/Button';
import { loadSRSCards, saveSRSCards, addCardIfNew } from '../srs/srsEngine';
import { addLearningHistory } from '../../services/storage';

import { playChineseTTS } from '../../utils/tts';

interface SnapModeProps {
    onSnapComplete?: (detectedObject: string) => void;
}

export const SnapMode: React.FC<SnapModeProps> = ({ onSnapComplete }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPracticing, setIsPracticing] = useState(false);
    const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
    const [addedToSRS, setAddedToSRS] = useState(false);

    const mountedRef = useRef(false);
    const cameraRequestRef = useRef(0);
    const practiceRequestRef = useRef(0);
    const practicePendingRef = useRef(false);
    const analysisRef = useRef<AbortController | null>(null);

    const startPractice = async () => {
        if (practicePendingRef.current || audioStreamRef.current) return;
        practicePendingRef.current = true;
        const request = ++practiceRequestRef.current;
        try {
            const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (!mountedRef.current || request !== practiceRequestRef.current) {
                micStream.getTracks().forEach(track => track.stop());
                return;
            }
            audioStreamRef.current = micStream;
            setAudioStream(micStream);
            setIsPracticing(true);
        } catch (e) {
            if (mountedRef.current && request === practiceRequestRef.current) setError('Microphone access denied. Please allow microphone permissions to practice.');
        } finally {
            if (request === practiceRequestRef.current) practicePendingRef.current = false;
        }
    };

    const stopPractice = () => {
        practiceRequestRef.current++;
        practicePendingRef.current = false;
        audioStreamRef.current?.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
        if (mountedRef.current) { setAudioStream(null); setIsPracticing(false); }
    };

    const audioStreamRef = useRef<MediaStream | null>(null);

    useEffect(() => {
        mountedRef.current = true;
        startCamera();
        return () => {
            mountedRef.current = false;
            analysisRef.current?.abort();
            stopPractice();
            stopCamera();
        };
    }, []);

    const startCamera = async () => {
        stopCamera();
        const request = cameraRequestRef.current;
        try {
            const ms = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
            });
            if (!mountedRef.current || request !== cameraRequestRef.current) {
                ms.getTracks().forEach(track => track.stop());
                return;
            }
            streamRef.current = ms;
            if (videoRef.current) {
                videoRef.current.srcObject = ms;
            }
        } catch (e) {
            if (mountedRef.current && request === cameraRequestRef.current) setError("Unable to access camera. Please allow camera permissions.");
        }
    };

    const stopCamera = () => {
        cameraRequestRef.current++;
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
    };

    const captureImage = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            if (video.videoWidth < 2 || video.videoHeight < 2) return;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                setImagePreview(dataUrl);
                analyzeImage(dataUrl);
            }
        }
    };

    const reset = () => {
        analysisRef.current?.abort();
        stopPractice();
        setLoading(false);
        setImagePreview(null);
        setResult(null);
        setError(null);
        setAddedToSRS(false);
        startCamera();
    };

    const handleAddToSRS = () => {
        if (!result) return;
        try {
            const cards = loadSRSCards();
            const updated = addCardIfNew(cards, {
                word: result.chinese,
                pinyin: result.pinyin,
                english: result.english,
                sentence: result.sentence,
                sentencePinyin: result.sentencePinyin,
                sentenceEnglish: result.sentenceEnglish,
                hskLevel: result.hskLevel,
            });
            saveSRSCards(updated);
            setAddedToSRS(true);

            addLearningHistory({
                id: `snap_${Date.now()}`,
                type: 'snap',
                timestamp: Date.now(),
                data: {
                    chinese: result.chinese,
                    pinyin: result.pinyin,
                    english: result.english,
                },
            }).catch(() => { /* IndexedDB may fail silently */ });
        } catch (err) {
            console.error('Failed to add to SRS:', err instanceof Error ? err.message : err);
        }
    };

    const analyzeImage = async (base64DataUrl: string) => {
        analysisRef.current?.abort();
        const request = new AbortController();
        analysisRef.current = request;
        setLoading(true);
        stopCamera();
        try {
            const base64Data = base64DataUrl.split(',')[1];
            const data = await analyzePhoto(base64Data, request.signal);
            if (!mountedRef.current || request.signal.aborted) return;
            setResult(data);
            if (data.english && onSnapComplete) {
                onSnapComplete(data.english);
            }
        } catch (e) {
            if (!mountedRef.current || request.signal.aborted) return;
            const message = e instanceof Error ? e.message : 'Analysis failed. Please try again.';
            setError(message);
        } finally {
            if (mountedRef.current && !request.signal.aborted) setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-50">
            <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-slate-900 rounded-2xl mx-4 my-2 shadow-inner border border-slate-800">
                {!imagePreview && (
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                        onLoadedMetadata={() => videoRef.current?.play()}
                    />
                )}

                {imagePreview && (
                    <div className="relative w-full h-full">
                        <img src={imagePreview} className="w-full h-full object-contain bg-black" alt="Captured" />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-transparent to-transparent pointer-events-none" />
                    </div>
                )}

                {!imagePreview && (
                    <div className="absolute bottom-8 left-0 right-0 flex justify-center z-20">
                        <button
                            aria-label="Capture photo"
                            onClick={captureImage}
                            className="w-20 h-20 rounded-full border-4 border-white/30 bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-all active:scale-95 shadow-xl"
                        >
                            <div className="w-16 h-16 bg-white rounded-full shadow-inner" />
                        </button>
                    </div>
                )}

                <canvas ref={canvasRef} className="hidden" />
            </div>

            {(loading || result || error) && (
                <div className="absolute inset-x-0 bottom-0 z-30 p-4 pointer-events-none">
                    <div className="pointer-events-auto max-w-2xl mx-auto bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl p-6 border border-white/50 animate-in slide-in-from-bottom-10">
                        {loading && (
                            <div className="flex flex-col items-center justify-center py-4 space-y-3">
                                <Loader2 className="animate-spin text-blue-600" size={32} />
                                <p className="text-slate-600 font-medium tracking-wide">Analyzing visual data...</p>
                            </div>
                        )}

                        {error && (
                            <div className="text-center py-4">
                                <p className="text-red-500 mb-4 font-medium">{error}</p>
                                <button
                                    onClick={reset}
                                    className="px-6 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
                                >
                                    Try Again
                                </button>
                            </div>
                        )}

                        {result && !loading && (
                            <div className="space-y-6">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <h2 className="text-xs font-bold text-blue-600 tracking-wider uppercase">Detected Object</h2>
                                            {result.hskLevel && (
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide
                                                    ${result.hskLevel <= 2 ? 'bg-green-100 text-green-700' :
                                                        result.hskLevel <= 4 ? 'bg-yellow-100 text-yellow-700' :
                                                            'bg-red-100 text-red-700'}`}>
                                                    HSK {result.hskLevel}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-baseline gap-3">
                                            <h3 className="text-3xl font-bold text-slate-900 font-chinese">{result.chinese}</h3>
                                            <span className="text-xl text-slate-500 font-light">{result.pinyin}</span>
                                        </div>
                                        <p className="text-slate-600 mt-1 text-base">{result.english}</p>
                                        {result.radicals && result.radicals.length > 0 && (
                                            <div className="flex items-center gap-1.5 mt-2">
                                                <span className="text-[10px] text-slate-400 uppercase font-bold">Radicals:</span>
                                                {result.radicals.map((radical, idx) => (
                                                    <span key={idx} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-sm font-chinese">
                                                        {radical}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        aria-label="Capture new item"
                                        onClick={reset}
                                        className="p-2 -mr-2 -mt-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-900 transition-colors"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>

                                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 shadow-sm">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Contextual Usage</h4>
                                    <p className="text-lg font-chinese text-slate-800 mb-1.5 leading-relaxed">{result.sentence}</p>
                                    <p className="text-sm text-blue-600 font-medium mb-1">{result.sentencePinyin}</p>
                                    <p className="text-sm text-slate-500 italic">{result.sentenceEnglish}</p>
                                </div>

                                {(result.funFact || result.commonMistake) && (
                                    <div className="grid grid-cols-1 gap-3">
                                        {result.funFact && (
                                            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                                                <div className="flex items-start gap-2">
                                                    <span className="text-lg">💡</span>
                                                    <div>
                                                        <h5 className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1">Fun Fact</h5>
                                                        <p className="text-sm text-amber-900">{result.funFact}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {result.commonMistake && (
                                            <div className="bg-rose-50 border border-rose-100 rounded-xl p-3">
                                                <div className="flex items-start gap-2">
                                                    <span className="text-lg">⚠️</span>
                                                    <div>
                                                        <h5 className="text-xs font-bold text-rose-700 uppercase tracking-wider mb-1">Common Mistake</h5>
                                                        <p className="text-sm text-rose-900">{result.commonMistake}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="pt-2">
                                    <button
                                        aria-label="Capture new item"
                                        onClick={reset}
                                        className="w-full py-3 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-slate-900/20"
                                    >
                                        <Camera size={18} />
                                        Capture New Item
                                    </button>
                                    <div className="flex gap-2 mt-4">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => playChineseTTS(result.chinese)}
                                            className="flex-1"
                                        >
                                            <Volume2 size={16} className="mr-2" />
                                            Listen
                                        </Button>
                                        <Button
                                            variant={isPracticing ? "secondary" : "outline"}
                                            size="sm"
                                            onClick={isPracticing ? stopPractice : startPractice}
                                            className={`flex-1 ${isPracticing ? 'bg-red-50 text-red-600 border-red-200' : ''}`}
                                        >
                                            <Mic size={16} className="mr-2" />
                                            {isPracticing ? 'Stop' : 'Practice'}
                                        </Button>
                                    </div>

                                    <div className="mt-2">
                                        <Button
                                            variant={addedToSRS ? "ghost" : "outline"}
                                            size="sm"
                                            onClick={handleAddToSRS}
                                            disabled={addedToSRS}
                                            className={`w-full ${addedToSRS ? 'text-green-600' : ''}`}
                                        >
                                            <BookPlus size={16} className="mr-2" />
                                            {addedToSRS ? 'Added to Review Queue' : 'Add to SRS Review'}
                                        </Button>
                                    </div>

                                    {isPracticing && (
                                        <div className="mt-3 bg-slate-900 rounded-lg p-2 animate-in fade-in slide-in-from-top-2">
                                            <div className="flex justify-between items-center mb-1 px-1">
                                                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Your Tone</span>
                                            </div>
                                            <ToneVisualizer stream={audioStream} height={60} width={250} targetTone={1} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
