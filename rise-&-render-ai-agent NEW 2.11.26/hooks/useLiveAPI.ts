import { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createPcmBlob, decodeAudioData, base64ToUint8Array } from '../utils/audio';
import { SYSTEM_INSTRUCTION, TOOLS } from '../constants';
import { handleToolCall } from '../utils/toolHandler';

interface UseLiveAPIProps {
  apiKey: string;
  onDisconnect: () => void;
}

export const useLiveAPI = ({ apiKey, onDisconnect }: UseLiveAPIProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [volume, setVolume] = useState(0); // For visualization
  
  // Refs for audio handling to avoid re-renders
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const connect = useCallback(async () => {
    if (!apiKey) return;

    try {
      const ai = new GoogleGenAI({ apiKey });
      
      // Setup Audio Output
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
      
      // CRITICAL: Resume audio context immediately (fixes mobile/Safari silence)
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      nextStartTimeRef.current = audioContextRef.current.currentTime;

      // Setup Audio Input
      inputContextRef.current = new AudioContextClass({ sampleRate: 16000 });
      
      // Get User Media
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Initialize Gemini Session
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: SYSTEM_INSTRUCTION,
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
            },
            tools: TOOLS,
        },
        callbacks: {
          onopen: () => {
            console.log('Gemini Live API Connected');
            setIsConnected(true);
            
            // Start processing microphone input
            if (!inputContextRef.current || !streamRef.current) return;

            const source = inputContextRef.current.createMediaStreamSource(streamRef.current);
            const processor = inputContextRef.current.createScriptProcessor(4096, 1, 1);
            
            processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                
                // Calculate volume for visualizer
                let sum = 0;
                for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
                const rms = Math.sqrt(sum / inputData.length);
                setVolume(rms * 5); // Scale up for visuals

                const pcmBlob = createPcmBlob(inputData);
                
                // Send to Gemini
                sessionPromise.then(session => {
                    session.sendRealtimeInput({ media: pcmBlob });
                });
            };

            source.connect(processor);
            processor.connect(inputContextRef.current.destination);
            
            sourceRef.current = source;
            processorRef.current = processor;
          },
          onmessage: async (msg: LiveServerMessage) => {
            // Handle Audio
            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData && audioContextRef.current) {
                setIsTalking(true);
                const bytes = base64ToUint8Array(audioData);
                const buffer = await decodeAudioData(bytes, audioContextRef.current);
                
                const source = audioContextRef.current.createBufferSource();
                source.buffer = buffer;
                source.connect(audioContextRef.current.destination);
                
                // Schedule playback
                const now = audioContextRef.current.currentTime;
                // Ensure we don't schedule in the past, but try to be continuous
                const start = Math.max(now, nextStartTimeRef.current);
                source.start(start);
                nextStartTimeRef.current = start + buffer.duration;
                
                source.onended = () => {
                    // Simple heuristic to stop "talking" visual
                    if (audioContextRef.current && audioContextRef.current.currentTime >= nextStartTimeRef.current - 0.1) {
                        setIsTalking(false);
                    }
                };
            }

            // Handle Function Calling (Tools)
            if (msg.toolCall) {
              console.log("Tool call received:", msg.toolCall);
              for (const fc of msg.toolCall.functionCalls) {
                const result = await handleToolCall(fc);
                sessionPromise.then(session => {
                  session.sendToolResponse({
                    functionResponses: [{
                      id: fc.id,
                      name: fc.name,
                      response: result
                    }]
                  });
                });
              }
            }

            if (msg.serverContent?.interrupted) {
                // Cancel current audio if interrupted
                 setIsTalking(false);
                 nextStartTimeRef.current = audioContextRef.current?.currentTime || 0;
            }
          },
          onclose: () => {
            console.log('Gemini Live API Closed');
            disconnect();
          },
          onerror: (err) => {
            console.error('Gemini Live API Error', err);
            disconnect();
          }
        }
      });
      
      sessionRef.current = sessionPromise;

    } catch (error) {
      console.error("Failed to connect to Live API", error);
      disconnect();
    }
  }, [apiKey]);

  const disconnect = useCallback(() => {
    setIsConnected(false);
    setIsTalking(false);
    setVolume(0);

    // Stop tracks
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }
    // Disconnect audio nodes
    if (sourceRef.current) sourceRef.current.disconnect();
    if (processorRef.current) processorRef.current.disconnect();
    
    // Close Audio Contexts
    if (inputContextRef.current) inputContextRef.current.close();
    if (audioContextRef.current) audioContextRef.current.close();
    
    onDisconnect();
  }, [onDisconnect]);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
        if (isConnected) {
            disconnect();
        }
    };
  }, []);

  return { connect, disconnect, isConnected, isTalking, volume };
};