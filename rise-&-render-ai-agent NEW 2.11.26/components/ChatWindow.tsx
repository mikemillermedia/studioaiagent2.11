import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Chat, GenerateContentResponse, FunctionCall, Part } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { MessageRole, ChatMessage, WidgetState } from '../types';
import { SYSTEM_INSTRUCTION, WELCOME_MESSAGE, TOOLS } from '../constants';
import { useLiveAPI } from '../hooks/useLiveAPI';
import { handleToolCall } from '../utils/toolHandler';

// Icons
const SendIcon = () => <span className="material-icons-round text-lg">arrow_upward</span>;
const MicIcon = () => <span className="material-icons-round text-xl">mic</span>;
const KeyboardIcon = () => <span className="material-icons-round text-xl">keyboard</span>;
const MinimizeIcon = () => <span className="material-icons-round text-xl">expand_more</span>;

interface ChatWindowProps {
  onClose: () => void;
  isOpen: boolean;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ onClose, isOpen }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: MessageRole.MODEL, text: WELCOME_MESSAGE, timestamp: new Date() }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<WidgetState>(WidgetState.CHAT);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatSessionRef = useRef<Chat | null>(null);

  // Initialize Gemini Chat Client
  useEffect(() => {
    if (!chatSessionRef.current) {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        chatSessionRef.current = ai.chats.create({
            model: 'gemini-3-flash-preview',
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                tools: TOOLS
            }
        });
    }
  }, []);

  // Voice Hook
  const { connect, disconnect, isConnected, isTalking, volume } = useLiveAPI({
    apiKey: process.env.API_KEY || '',
    onDisconnect: () => setMode(WidgetState.CHAT)
  });

  // Handle Mode Switching
  useEffect(() => {
    if (mode === WidgetState.VOICE) {
        connect();
    } else {
        if (isConnected) disconnect();
    }
  }, [mode]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, mode]);

  const handleSendText = async () => {
    if (!inputValue.trim() || !chatSessionRef.current) return;
    
    const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: MessageRole.USER,
        text: inputValue,
        timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
        let result = await chatSessionRef.current.sendMessageStream({ message: inputValue });
        
        let fullResponse = '';
        const botMsgId = (Date.now() + 1).toString();
        let toolCalls: FunctionCall[] = [];
        
        // Optimistically add bot message
        setMessages(prev => [...prev, {
            id: botMsgId,
            role: MessageRole.MODEL,
            text: '',
            timestamp: new Date()
        }]);

        for await (const chunk of result) {
            // Check for text
            const text = (chunk as GenerateContentResponse).text;
            if (text) {
                fullResponse += text;
                setMessages(prev => prev.map(m => 
                    m.id === botMsgId ? { ...m, text: fullResponse } : m
                ));
            }
            
            // Check for tool calls (function calls)
            if (chunk.functionCalls) {
                // Collect them to execute later
                toolCalls.push(...chunk.functionCalls);
            }
        }

        // Execute Tool Calls if any
        if (toolCalls.length > 0) {
            const functionResponses: Part[] = [];
            for (const fc of toolCalls) {
                const functionResponse = await handleToolCall(fc);
                functionResponses.push({
                    functionResponse: {
                        id: fc.id,
                        name: fc.name,
                        response: functionResponse
                    }
                });
            }
            
            // Send response back to model
            const toolResult = await chatSessionRef.current.sendMessageStream({
                message: functionResponses
            });

            // Process the model's response to the tool execution
            for await (const chunk of toolResult) {
                const text = (chunk as GenerateContentResponse).text;
                if (text) {
                    fullResponse += text;
                    setMessages(prev => prev.map(m => 
                        m.id === botMsgId ? { ...m, text: fullResponse } : m
                    ));
                }
            }
        }

    } catch (error) {
        console.error("Chat error", error);
        setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: MessageRole.SYSTEM,
            text: "I'm having trouble connecting right now. Please try again.",
            timestamp: new Date()
        }]);
    } finally {
        setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendText();
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`
        fixed z-50 flex flex-col overflow-hidden bg-studio-dark shadow-2xl font-sans animate-fade-in-up transition-all duration-300
        /* Mobile: Full Screen */
        w-full h-[100dvh] top-0 left-0 rounded-none
        /* Tablet/Desktop: Floating Widget */
        sm:w-[400px] sm:h-[600px] sm:top-auto sm:left-auto sm:right-6 sm:bottom-6 sm:rounded-2xl sm:border sm:border-studio-gray
    `}>
      {/* Header */}
      <div className="bg-studio-black p-4 flex justify-between items-center border-b border-studio-gray shrink-0">
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#131313] border border-[#F5EFE6]/10 flex items-center justify-center text-[#F5EFE6] font-bold text-lg shadow-lg">
              R
            </div>
            <div>
              <h2 className="text-white font-semibold tracking-wide text-sm">RISE & RENDER</h2>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-[10px] text-gray-400 font-medium">ONLINE</span>
              </div>
            </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1">
            <MinimizeIcon />
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden relative bg-studio-black">
        
        {/* TEXT MODE */}
        <div className={`absolute inset-0 flex flex-col transition-opacity duration-300 ${mode === WidgetState.CHAT ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === MessageRole.USER ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] p-3 rounded-lg text-sm leading-relaxed ${
                            msg.role === MessageRole.USER 
                                ? 'bg-studio-accent text-white rounded-br-none' 
                                : msg.role === MessageRole.SYSTEM 
                                ? 'bg-red-900/50 text-red-200 border border-red-800'
                                : 'bg-studio-gray text-studio-text rounded-bl-none border border-studio-gray/50'
                        }`}>
                            <ReactMarkdown 
                              components={{
                                ul: ({node, ...props}) => <ul className="list-disc ml-4 my-2" {...props} />,
                                ol: ({node, ...props}) => <ol className="list-decimal ml-4 my-2" {...props} />,
                                li: ({node, ...props}) => <li className="my-1" {...props} />,
                                p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                                strong: ({node, ...props}) => <strong className="font-bold text-white" {...props} />,
                                a: ({node, ...props}) => <a className="text-indigo-400 hover:underline" target="_blank" rel="noopener noreferrer" {...props} />
                              }}
                            >
                              {msg.text}
                            </ReactMarkdown>
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-studio-gray px-4 py-3 rounded-lg rounded-bl-none flex gap-1">
                            <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-100"></div>
                            <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-200"></div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>
            
            {/* Input Area */}
            <div className="p-4 bg-studio-dark border-t border-studio-gray shrink-0">
                <div className="relative">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyPress}
                        placeholder="Ask about our packages..."
                        className="w-full bg-studio-black text-white pl-4 pr-12 py-3 rounded-xl border border-studio-gray focus:border-studio-accent focus:outline-none transition-colors placeholder-gray-600 text-sm"
                    />
                    <button 
                        onClick={handleSendText}
                        disabled={!inputValue.trim()}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-studio-accent text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 disabled:hover:bg-studio-accent transition-colors"
                    >
                        <SendIcon />
                    </button>
                </div>
            </div>
        </div>

        {/* VOICE MODE */}
        <div className={`absolute inset-0 flex flex-col items-center justify-center bg-studio-black transition-opacity duration-300 ${mode === WidgetState.VOICE ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
            <div className="relative w-48 h-48 flex items-center justify-center">
                {/* Visualizer Rings */}
                <div className={`absolute inset-0 rounded-full border border-studio-accent/30 transition-transform duration-100 ease-linear`} 
                     style={{ transform: `scale(${1 + volume})` }}></div>
                <div className={`absolute inset-4 rounded-full border border-studio-accent/50 transition-transform duration-100 ease-linear`}
                     style={{ transform: `scale(${1 + (volume * 0.7)})` }}></div>
                 
                 {/* Core Orb */}
                <div className={`w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 shadow-[0_0_30px_rgba(99,102,241,0.5)] flex items-center justify-center transition-all duration-300 ${isTalking ? 'scale-110 shadow-[0_0_50px_rgba(99,102,241,0.8)]' : 'scale-100'}`}>
                    <span className="material-icons-round text-4xl text-white">mic</span>
                </div>
            </div>
            
            <p className="mt-8 text-studio-text font-light tracking-wide">
                {isTalking ? "Speaking..." : "Listening..."}
            </p>
            <p className="text-xs text-gray-500 mt-2">Gemini 2.5 Live</p>
        </div>

      </div>

      {/* Footer / Toggle */}
      <div className="bg-studio-dark p-3 border-t border-studio-gray flex justify-center gap-2 shrink-0 pb-safe">
        <button 
            onClick={() => setMode(WidgetState.CHAT)}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-all ${mode === WidgetState.CHAT ? 'bg-studio-gray text-white' : 'text-gray-500 hover:text-gray-300'}`}
        >
            <KeyboardIcon /> Chat
        </button>
        <button 
            onClick={() => setMode(WidgetState.VOICE)}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-all ${mode === WidgetState.VOICE ? 'bg-studio-gray text-white' : 'text-gray-500 hover:text-gray-300'}`}
        >
            <MicIcon /> Voice
        </button>
      </div>
    </div>
  );
};