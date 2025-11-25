import React, { useState, useRef, useEffect } from 'react';
import { AppSettings, StoryChapter } from '../types';
import { LiveClient } from '../services/liveClient';
import { Mic, MicOff, ChevronDown, ChevronUp, ChevronRight, PlayCircle, ChevronLeft, Maximize2 } from 'lucide-react';

interface Props {
  chapter: StoryChapter;
  settings: AppSettings;
  onFinishChapter: (transcript: string, duration: number) => void;
  onMakeChoice: (choice: string) => void;
  isLatestChapter?: boolean;
  onPrevChapter?: () => void;
  onNextChapter?: () => void;
  onExpandImage?: (url: string) => void;
}

const FocusReader: React.FC<Props> = ({ chapter, settings, onFinishChapter, onMakeChoice, isLatestChapter = true, onPrevChapter, onNextChapter, onExpandImage }) => {
  const [isLive, setIsLive] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  
  const liveClientRef = useRef<LiveClient | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sentenceRefs = useRef<(HTMLSpanElement | null)[]>([]);

  // Initialize text layout safely
  const content = chapter?.content || "Story content is loading...";
  // Robust sentence splitting that keeps punctuation attached
  const sentences = React.useMemo(() => {
    return content.match(/[^.!?\n]+[.!?\n]+/g) || content.split('\n').filter(s => s.trim().length > 0) || [content];
  }, [content]);

  useEffect(() => {
    // Reset state on new chapter
    setTranscript("");
    setIsLive(false);
    setCurrentSentenceIndex(0);
    setStartTime(null);
    if (contentRef.current) contentRef.current.scrollTop = 0;

    return () => {
        if (liveClientRef.current) {
            liveClientRef.current.disconnect();
        }
    }
  }, [chapter]);

  // Auto-scroll to active sentence
  useEffect(() => {
    if (sentenceRefs.current[currentSentenceIndex]) {
      sentenceRefs.current[currentSentenceIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
  }, [currentSentenceIndex]);

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextSentence();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevSentence();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sentences.length]); // Re-bind if sentence count changes

  const handleNextSentence = () => {
    setCurrentSentenceIndex(prev => Math.min(prev + 1, sentences.length - 1));
  };

  const handlePrevSentence = () => {
    setCurrentSentenceIndex(prev => Math.max(prev - 1, 0));
  };

  const toggleLive = async () => {
    if (isLive) {
      if (liveClientRef.current) {
        liveClientRef.current.disconnect();
      }
      setIsLive(false);
      const duration = startTime ? (Date.now() - startTime) / 1000 : 0;
      onFinishChapter(transcript, duration);
    } else {
      const client = new LiveClient();
      client.onTranscriptionUpdate = (text) => {
        setTranscript(prev => prev + " " + text);
      };
      await client.connect();
      liveClientRef.current = client;
      setIsLive(true);
      setStartTime(Date.now());
    }
  };

  // Styles based on settings
  const containerStyle = {
    backgroundColor: settings.colorTheme === 'default' ? '#ffffff' : 
                     settings.colorTheme === 'yellow' ? '#fdf6e3' :
                     settings.colorTheme === 'blue' ? '#e0f7fa' : '#fce4ec',
    fontFamily: settings.isDyslexicFont ? 'var(--font-dyslexic)' : 'sans-serif',
    fontSize: settings.fontSize === 'xl' ? '1.5rem' : settings.fontSize === 'large' ? '1.25rem' : '1rem',
    lineHeight: settings.isDyslexicFont ? '2.5' : '2.0',
    letterSpacing: settings.isDyslexicFont ? '0.05em' : 'normal',
  } as React.CSSProperties;

  if (!chapter) {
    return <div className="p-8 text-center text-gray-500">Loading content...</div>;
  }

  return (
    <div className="flex flex-col h-full relative bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
      {/* Hide scrollbar strictly */}
      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
      
      {/* Sticky Top Bar Controls */}
      <div className="flex-none sticky top-0 z-50 flex items-center justify-between p-4 bg-white/95 backdrop-blur border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-2">
            {onPrevChapter && (
                <button 
                    onClick={onPrevChapter}
                    className="p-2 rounded-full hover:bg-gray-100 text-gray-600 transition-colors"
                    title="Previous Chapter"
                >
                    <ChevronLeft size={24} />
                </button>
            )}
            <h2 className="text-xl font-bold text-gray-800 truncate max-w-[200px] md:max-w-md">{chapter.title}</h2>
        </div>
        
        <div className="flex items-center gap-2">
            {onNextChapter ? (
                 <button 
                    onClick={onNextChapter}
                    className="flex items-center gap-1 px-4 py-2 rounded-full bg-indigo-50 text-indigo-700 font-bold hover:bg-indigo-100 transition-colors"
                >
                    Next <ChevronRight size={20} />
                </button>
            ) : (
                <button
                onClick={toggleLive}
                className={`flex items-center gap-2 px-6 py-2 rounded-full font-bold shadow-sm transition-all ${
                    isLive 
                    ? 'bg-red-100 text-red-600 border border-red-200 hover:bg-red-200 animate-pulse' 
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
                >
                {isLive ? <><MicOff size={20}/> Stop & Finish</> : <><Mic size={20}/> Start Reading</>}
                </button>
            )}
        </div>
      </div>

      {/* Reader Area */}
      <div className="relative flex-grow overflow-hidden" style={{ backgroundColor: containerStyle.backgroundColor }}>
        
        {/* Navigation Floating Controls (Right Side) */}
        <div className="absolute right-6 top-1/2 transform -translate-y-1/2 flex flex-col gap-4 z-40 print:hidden">
           <button 
             onClick={handlePrevSentence}
             disabled={currentSentenceIndex === 0}
             className="w-12 h-12 bg-white/90 backdrop-blur rounded-full shadow-lg border border-indigo-100 flex items-center justify-center text-indigo-600 hover:bg-indigo-50 disabled:opacity-30 transition-all"
             title="Previous Sentence (Arrow Up)"
           >
             <ChevronUp size={24} />
           </button>
           <button 
             onClick={handleNextSentence}
             disabled={currentSentenceIndex === sentences.length - 1}
             className="w-12 h-12 bg-indigo-600 text-white rounded-full shadow-lg border border-indigo-700 flex items-center justify-center hover:bg-indigo-700 disabled:opacity-30 transition-all"
             title="Next Sentence (Arrow Down)"
           >
             <ChevronDown size={24} />
           </button>
        </div>

        {/* Text Content */}
        <div 
            ref={contentRef}
            className="absolute inset-0 overflow-y-auto scroll-smooth no-scrollbar bg-texture"
            style={containerStyle}
        >
          {/* Chapter Image Banner */}
          {chapter.imageUrl && (
              <div 
                  className="w-full h-48 md:h-64 relative mb-6 group cursor-zoom-in"
                  onClick={() => onExpandImage && chapter.imageUrl && onExpandImage(chapter.imageUrl)}
              >
                  <img 
                    src={chapter.imageUrl} 
                    alt="Scene" 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                  
                  {/* Hover Overlay */}
                   <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center pointer-events-none">
                        <Maximize2 className="text-white opacity-0 group-hover:opacity-100 transform scale-75 group-hover:scale-100 transition-all w-12 h-12 drop-shadow-md" />
                    </div>
              </div>
          )}

          <div className="max-w-3xl mx-auto px-8 md:px-12 pb-64 pt-8"> 
            {/* Padding top/bottom ensures first/last sentences can be centered */}
            {sentences.length > 0 ? sentences.map((sentence, idx) => {
                
                // Determine focus state
                const isActive = idx === currentSentenceIndex;
                const isNeighbor = idx === currentSentenceIndex - 1 || idx === currentSentenceIndex + 1;
                const isFar = !isActive && !isNeighbor;

                return (
                    <span 
                        key={idx} 
                        ref={(el) => { sentenceRefs.current[idx] = el; }}
                        onClick={() => setCurrentSentenceIndex(idx)}
                        className={`
                            block mb-6 rounded-xl px-4 py-3 transition-all duration-500 ease-in-out cursor-pointer border border-transparent leading-relaxed
                            ${isActive ? 'bg-yellow-200/50 scale-105 shadow-sm border-yellow-300 font-semibold text-gray-900 ring-4 ring-yellow-50' : ''}
                            ${isNeighbor ? 'opacity-80 scale-100' : ''}
                            ${isFar ? 'opacity-25 blur-[1px] scale-95 grayscale' : ''}
                        `}
                    >
                        {sentence}
                    </span>
                );
            }) : <p>{content}</p>}
          </div>
        </div>
      </div>

      {/* Choices (Only show if not reading live AND latest chapter) */}
      {!isLive && isLatestChapter && chapter.choices && (
        <div className="flex-none bg-gray-50 border-t border-gray-200 p-4 z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">What happens next?</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {chapter.choices.map((choice, idx) => (
                <button
                key={idx}
                onClick={() => onMakeChoice(choice)}
                className="p-4 bg-white border-2 border-indigo-100 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 hover:shadow-md transition-all text-left font-medium text-gray-700 group"
                >
                <span className="block text-xs uppercase text-indigo-400 font-bold mb-1 group-hover:text-indigo-600">Option {idx + 1}</span>
                <div className="flex items-center justify-between">
                    {choice}
                    <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-500"/>
                </div>
                </button>
            ))}
            </div>
        </div>
      )}
      
      {/* History Mode Navigation */}
      {!isLatestChapter && (
          <div className="flex-none bg-indigo-50 border-t border-indigo-100 p-4 z-50 flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
              {onPrevChapter ? (
                  <button 
                      onClick={onPrevChapter}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-indigo-700 font-medium hover:bg-indigo-100 transition-colors"
                  >
                      <ChevronLeft size={20} /> Previous
                  </button>
              ) : <div className="w-24"></div>}
              
              <div className="text-sm font-bold text-indigo-400 uppercase tracking-wider bg-indigo-100/50 px-3 py-1 rounded-full">
                  Viewing Past Chapter
              </div>

              {onNextChapter ? (
                  <button 
                      onClick={onNextChapter}
                      className="flex items-center gap-2 px-6 py-2 rounded-full bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-colors shadow-sm"
                  >
                      Next <ChevronRight size={20} />
                  </button>
              ) : <div className="w-24"></div>}
          </div>
      )}
    </div>
  );
};

export default FocusReader;