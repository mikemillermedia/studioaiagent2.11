import React, { useState, useEffect } from 'react';
import { ChatWindow } from './components/ChatWindow';

const App: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [showBubble, setShowBubble] = useState(false);
  const [isBouncing, setIsBouncing] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowBubble(true);
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (showBubble) {
      setIsBouncing(true);
      
      // Stop bouncing after 5 seconds
      const stopBounceTimer = setTimeout(() => {
        setIsBouncing(false);
      }, 5000);
      
      // Hide bubble after 15 seconds
      const hideTimer = setTimeout(() => {
        setShowBubble(false);
      }, 15000);
      
      return () => {
        clearTimeout(stopBounceTimer);
        clearTimeout(hideTimer);
      };
    }
  }, [showBubble]);

  return (
    <div className="font-sans antialiased text-studio-text">
      {/* Launch Button & Bubble */}
      {!isOpen && (
        <>
          {/* Greeting Bubble */}
          {showBubble && (
            <div className={`fixed bottom-24 right-6 z-50 transition-all duration-300 ${isBouncing ? 'animate-bounce' : ''}`}>
               <div className="bg-[#F5EFE6] text-[#131313] px-3 py-1.5 rounded-lg rounded-br-none shadow-xl border border-[#131313]/10 relative">
                  <p className="text-xs font-bold tracking-wide whitespace-nowrap"></p>
               </div>
            </div>
          )}

          <button
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 w-14 h-14 bg-[#131313] text-[#F5EFE6] rounded-full shadow-lg hover:shadow-xl scale-75 hover:scale-100 transition-all duration-300 flex items-center justify-center z-50 group border border-[#F5EFE6]/10"
            aria-label="Open Rise & Render Assistant"
          >
            <span className="text-3xl font-bold group-hover:rotate-12 transition-transform">
              R
            </span>
            {/* Pulse Effect */}
            <span className="absolute -inset-1 rounded-full bg-[#F5EFE6] opacity-10 animate-pulse-slow"></span>
          </button>
        </>
      )}

      {/* The Chat Widget */}
      <ChatWindow isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </div>
  );
};

export default App;
