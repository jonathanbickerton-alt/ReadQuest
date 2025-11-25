import React, { useState, useEffect, useMemo } from 'react';
import { AppSettings, Character, ReadingSession, StoryChapter, GameState, StoryConfig } from './types';
import { generateCharacterImage, generateStoryStart, generateNextChapter, calculateReadingScore, generateSceneImage } from './services/gemini';
import FocusReader from './components/FocusReader';
import ParentDashboard from './components/ParentDashboard';
import SettingsPanel from './components/SettingsPanel';
import { Book, User, Settings as SettingsIcon, Layout, Wand2, Loader2, Play, AlertTriangle, Sparkles, Check, Edit2, Save, Trash2, ArrowRight, Search, Calendar, Clock, ChevronLeft, X, Baby, Ruler, Layers, Palette } from 'lucide-react';

const VISUAL_STYLES = [
  { id: 'cartoon', label: 'Vibrant Cartoon', value: 'colorful, vibrant, fun cartoon style', icon: '🎨' },
  { id: 'anime', label: 'Anime / Ghibli', value: 'anime style, studio ghibli inspired, detailed, soft colors', icon: '🎌' },
  { id: '3d', label: '3D Animation', value: '3d render, pixar style, cute, high quality, digital art', icon: '🧊' },
  { id: 'vintage', label: '1930s B&W', value: '1930s rubber hose animation style, black and white, vintage cartoon', icon: '📽️' },
  { id: 'watercolor', label: 'Watercolor', value: 'soft watercolor painting, artistic, storybook illustration', icon: '🖌️' },
  { id: 'comic', label: 'Comic Book', value: 'comic book style, bold lines, vibrant colors', icon: '💥' },
];

export default function App() {
  // --- State ---
  const [view, setView] = useState<'onboarding' | 'load-game' | 'character-review' | 'reading' | 'parents'>('onboarding');
  const [settings, setSettings] = useState<AppSettings>({
    isDyslexicFont: false,
    colorTheme: 'default',
    fontSize: 'large'
  });
  
  // Story State
  const [character, setCharacter] = useState<Character | null>(null);
  const [storyHistory, setStoryHistory] = useState<StoryChapter[]>([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);
  const [storyConfig, setStoryConfig] = useState<StoryConfig>({
      readingAge: 8,
      targetWordCount: 500,
      totalChapters: 10,
      visualStyle: VISUAL_STYLES[0].value
  });
  
  // Creation Flow State
  const [pendingChapter, setPendingChapter] = useState<StoryChapter | null>(null);
  const [isWritingStory, setIsWritingStory] = useState(false);
  const [generatedWordCount, setGeneratedWordCount] = useState(0);
  const [loadingSceneUrl, setLoadingSceneUrl] = useState<string | null>(null);
  
  // Progress State
  const [readingHistory, setReadingHistory] = useState<ReadingSession[]>([]);

  // UI State
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [charNameInput, setCharNameInput] = useState('');
  const [charDescInput, setCharDescInput] = useState('');
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  
  // Save Management State
  const [savedGames, setSavedGames] = useState<GameState[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // --- Effects ---
  useEffect(() => {
    try {
        // Migration Logic: Check for old single save format and move to array
        const oldSave = localStorage.getItem('readquest_save');
        let currentSaves: GameState[] = [];
        const savesRaw = localStorage.getItem('readquest_saves');
        
        if (savesRaw) {
            currentSaves = JSON.parse(savesRaw);
        }

        if (oldSave) {
            try {
                const parsedOld = JSON.parse(oldSave);
                // Assign a new ID if it doesn't exist
                const migratedSave: GameState = {
                    ...parsedOld,
                    id: parsedOld.id || Date.now().toString(),
                    lastSaved: parsedOld.lastSaved || new Date().toISOString(),
                    // Default config for old saves
                    storyConfig: parsedOld.storyConfig || { readingAge: 8, targetWordCount: 500, totalChapters: 10, visualStyle: VISUAL_STYLES[0].value }
                };
                currentSaves.push(migratedSave);
                localStorage.setItem('readquest_saves', JSON.stringify(currentSaves));
                localStorage.removeItem('readquest_save'); // Clear old format
            } catch (e) {
                console.error("Migration failed", e);
            }
        }
        
        setSavedGames(currentSaves);
    } catch (e) {
        console.warn("Local storage access denied or full", e);
    }
  }, []);

  // Update config defaults when age changes
  const handleAgeChange = (age: number) => {
      let wordCount = 500;
      let totalChapters = 10;

      if (age <= 4) {
          wordCount = 150;
          totalChapters = 5;
      } else if (age <= 6) {
          wordCount = 250;
          totalChapters = 7;
      } else if (age <= 9) {
          wordCount = 500;
          totalChapters = 12;
      } else {
          wordCount = 800;
          totalChapters = 20;
      }

      setStoryConfig(prev => ({
          ...prev,
          readingAge: age,
          targetWordCount: wordCount,
          totalChapters: totalChapters
      }));
  };

  // --- Handlers ---

  const handleSaveGame = () => {
    if (!character || storyHistory.length === 0) return;
    
    // Use existing ID or create new one
    const saveId = currentGameId || Date.now().toString();
    const timestamp = new Date().toISOString();

    const gameState: GameState = {
        id: saveId,
        lastSaved: timestamp,
        title: character.name + "'s Adventure", // Store title
        character,
        storyConfig,
        storyHistory,
        currentChapterIndex,
        readingHistory,
        generatedWordCount
    };

    try {
        // Update list of saves
        const newSaves = savedGames.filter(g => g.id !== saveId);
        newSaves.push(gameState);
        
        // Sort by date new to old
        newSaves.sort((a, b) => new Date(b.lastSaved).getTime() - new Date(a.lastSaved).getTime());

        localStorage.setItem('readquest_saves', JSON.stringify(newSaves));
        setSavedGames(newSaves);
        setCurrentGameId(saveId);
        
        setShowSaveConfirm(true);
        setTimeout(() => setShowSaveConfirm(false), 2000);
    } catch (e) {
        console.error("Save failed", e);
        setErrorMessage("Could not save game. Browser storage might be full (Images take up space!). Try deleting old saves.");
    }
  };

  const handleLoadGame = (game: GameState) => {
    try {
        setCharacter(game.character);
        setStoryHistory(game.storyHistory);
        setCurrentChapterIndex(game.currentChapterIndex);
        setReadingHistory(game.readingHistory);
        setGeneratedWordCount(game.generatedWordCount);
        // Ensure visualStyle exists if loading old save
        setStoryConfig(game.storyConfig || { readingAge: 8, targetWordCount: 500, totalChapters: 10, visualStyle: VISUAL_STYLES[0].value });
        setCurrentGameId(game.id);
        
        setView('reading');
    } catch (e) {
        console.error("Failed to load game", e);
        setErrorMessage("Could not load saved game.");
    }
  };

  const handleDeleteSave = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteConfirmId(id);
  };

  const confirmDelete = () => {
    if (!deleteConfirmId) return;
    const newSaves = savedGames.filter(g => g.id !== deleteConfirmId);
    localStorage.setItem('readquest_saves', JSON.stringify(newSaves));
    setSavedGames(newSaves);
    setDeleteConfirmId(null);
  };

  const handleStartCreation = async () => {
    if (!charNameInput || !charDescInput) return;
    setIsLoading(true);
    setErrorMessage(null);
    setPendingChapter(null);
    setGeneratedWordCount(0);
    setCurrentGameId(Date.now().toString()); // Generate new ID for new game

    try {
      // Step 1: Generate Image with Style
      const imgUrl = await generateCharacterImage(
        charDescInput, 
        storyConfig.readingAge, 
        storyConfig.visualStyle
      );

      setCharacter({
        name: charNameInput,
        description: charDescInput,
        imageUrl: imgUrl
      });
      
      // Move to Review View
      setView('character-review');
      setIsLoading(false);

      // Step 2: Start Writing Story in Background
      setIsWritingStory(true);
      
      // Pass the progress callback to update word count state
      generateStoryStart(charNameInput, charDescInput, storyConfig, (count) => {
        setGeneratedWordCount(count);
      })
        .then(chapter => {
          setPendingChapter(chapter);
        })
        .catch(e => {
          console.error("Story gen failed", e);
          setErrorMessage("Failed to write the story. Please try again.");
        })
        .finally(() => {
          setIsWritingStory(false);
        });

    } catch (e: any) {
      console.error("Setup failed", e);
      setErrorMessage(e.message || "Something went wrong starting the adventure. Please try again.");
      setIsLoading(false);
    }
  };

  const handleConfirmAdventure = () => {
    if (pendingChapter) {
        setStoryHistory([pendingChapter]);
        setCurrentChapterIndex(0);
        setView('reading');
        handleSaveGame(); // Initial save
    }
  };

  const handleFinishChapter = async (transcript: string, duration: number) => {
    setIsLoading(true);
    const currentChapter = storyHistory[currentChapterIndex];

    try {
      const stats = await calculateReadingScore(currentChapter.content || "", transcript, duration);
      
      const newSession: ReadingSession = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        bookTitle: character?.name ? `${character.name}'s Adventure` : 'Unknown Adventure',
        chapterTitle: currentChapter.title,
        wordCount: (currentChapter.content || "").split(' ').length,
        durationSeconds: duration,
        stats
      };
      
      setReadingHistory(prev => [...prev, newSession]);
      handleSaveGame(); // Auto-save after chapter completion
    } catch (e) {
      console.error("Scoring failed", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMakeChoice = async (choice: string) => {
    setIsLoading(true);
    setGeneratedWordCount(0);
    setLoadingSceneUrl(null);

    const previousContext = storyHistory[currentChapterIndex].content;

    try {
        // Start generating the scene summary image immediately (visual context)
        // Passed character description AND style to ensure visual consistency
        generateSceneImage(
            previousContext, 
            character?.description || "", 
            storyConfig.visualStyle
        ).then(url => setLoadingSceneUrl(url));

        // Start writing the next chapter stream
        const nextChapter = await generateNextChapter(
            previousContext + "\nUser Choice: " + choice, 
            choice, 
            storyConfig,
            currentChapterIndex + 1, // Index of next chapter
            (count) => setGeneratedWordCount(count)
        );

        setStoryHistory(prev => [...prev, nextChapter]);
        setCurrentChapterIndex(prev => prev + 1);
        handleSaveGame(); // Auto-save on new chapter
    } catch (e) {
        console.error("Next chapter failed", e);
        setErrorMessage("Could not load the next chapter.");
    } finally {
        setIsLoading(false);
    }
  };

  // --- Helpers ---
  // Combine all reading histories from saved games for parent view
  const getAllReadingSessions = useMemo(() => {
    const allSessions: ReadingSession[] = [];
    
    // If we have a current active game that hasn't been saved yet, include its recent history
    // Note: handleSaveGame updates savedGames, so usually savedGames is up to date.
    
    savedGames.forEach(game => {
        // Ensure legacy sessions get a book title if missing
        const sessionsWithTitle = game.readingHistory.map(s => ({
            ...s,
            bookTitle: s.bookTitle || (game.character.name + "'s Adventure")
        }));
        allSessions.push(...sessionsWithTitle);
    });

    return allSessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [savedGames, readingHistory]); // readingHistory dependency ensures updates trigger if not yet saved

  // --- Render Helpers ---

  const renderOnboarding = () => (
    <div className="flex flex-col items-center justify-center min-h-[80vh] max-w-4xl mx-auto p-4">
      <div className="text-center mb-10">
        <h1 className="text-5xl font-extrabold text-indigo-900 mb-4 tracking-tight">ReadQuest</h1>
        <p className="text-xl text-indigo-600">Your magical reading adventure begins here.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
        {/* New Game Card */}
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-indigo-50 hover:shadow-2xl transition-all">
            <h2 className="text-2xl font-bold mb-6 text-gray-800 flex items-center gap-2">
                <Wand2 className="text-purple-500 w-6 h-6"/> New Adventure
            </h2>
            
            {errorMessage && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-start gap-3 text-sm">
                    <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>{errorMessage}</div>
                </div>
            )}

            {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-6">
                <div className="relative w-full max-w-xs h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-indigo-500 to-purple-500 animate-[pulse_2s_infinite] w-2/3" />
                </div>
                
                <div className="text-center">
                    <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto mb-3" />
                    <h3 className="text-lg font-bold text-gray-800">Painting your hero...</h3>
                </div>
            </div>
            ) : (
            <div className="space-y-6">
                
                {/* Age Input */}
                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                    <label className="block text-sm font-bold text-indigo-900 mb-3 flex items-center gap-2">
                        <Baby className="w-4 h-4"/> Child's Reading Age: <span className="text-indigo-600 text-lg">{storyConfig.readingAge}</span>
                    </label>
                    <input 
                        type="range" 
                        min="4" 
                        max="15" 
                        step="1"
                        value={storyConfig.readingAge}
                        onChange={(e) => handleAgeChange(parseInt(e.target.value))}
                        className="w-full accent-indigo-600 h-2 bg-indigo-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-indigo-400 mt-1 font-medium">
                        <span>4 yrs</span>
                        <span>15+ yrs</span>
                    </div>

                    {/* Advanced Sliders */}
                    <div className="mt-4 pt-4 border-t border-indigo-200 grid grid-cols-2 gap-4">
                        <div>
                             <label className="block text-xs font-bold text-gray-600 mb-1 flex items-center gap-1">
                                <Ruler className="w-3 h-3"/> Words/Chapter
                             </label>
                             <input 
                                type="range" 
                                min="100" 
                                max="1500" 
                                step="50"
                                value={storyConfig.targetWordCount}
                                onChange={(e) => setStoryConfig(p => ({...p, targetWordCount: parseInt(e.target.value)}))}
                                className="w-full accent-purple-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                             />
                             <div className="text-right text-xs text-purple-600 font-bold">{storyConfig.targetWordCount}</div>
                        </div>
                        <div>
                             <label className="block text-xs font-bold text-gray-600 mb-1 flex items-center gap-1">
                                <Layers className="w-3 h-3"/> Total Chapters
                             </label>
                             <input 
                                type="range" 
                                min="3" 
                                max="30" 
                                step="1"
                                value={storyConfig.totalChapters}
                                onChange={(e) => setStoryConfig(p => ({...p, totalChapters: parseInt(e.target.value)}))}
                                className="w-full accent-purple-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                             />
                             <div className="text-right text-xs text-purple-600 font-bold">{storyConfig.totalChapters}</div>
                        </div>
                    </div>
                </div>

                {/* Character Name */}
                <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Character Name</label>
                <input 
                    value={charNameInput}
                    onChange={(e) => setCharNameInput(e.target.value)}
                    placeholder="e.g. Leo the Lionheart"
                    className="w-full p-4 rounded-xl border-2 border-indigo-100 focus:border-indigo-500 focus:ring-0 text-lg transition-all"
                />
                </div>

                {/* Description */}
                <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Description</label>
                <textarea 
                    value={charDescInput}
                    onChange={(e) => setCharDescInput(e.target.value)}
                    placeholder="Describe your hero..."
                    className="w-full p-4 rounded-xl border-2 border-indigo-100 focus:border-indigo-500 focus:ring-0 text-lg h-24 transition-all resize-none"
                />
                </div>

                {/* Art Style Selection */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                    <Palette className="w-4 h-4" /> Art Style
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {VISUAL_STYLES.map((style) => (
                      <button
                        key={style.id}
                        onClick={() => setStoryConfig(prev => ({...prev, visualStyle: style.value}))}
                        className={`p-2 rounded-lg text-sm font-medium border-2 transition-all flex flex-col items-center gap-1 text-center
                          ${storyConfig.visualStyle === style.value 
                            ? 'border-purple-500 bg-purple-50 text-purple-700' 
                            : 'border-gray-100 hover:border-indigo-200 text-gray-600 bg-white'
                          }`}
                      >
                        <span className="text-xl">{style.icon}</span>
                        <span className="text-xs">{style.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <button 
                onClick={handleStartCreation}
                disabled={!charNameInput || !charDescInput}
                className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold text-xl shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                Create <ArrowRight className="w-5 h-5"/>
                </button>
            </div>
            )}
        </div>

        {/* Load Game Entry Card */}
        <div className={`bg-white p-8 rounded-3xl shadow-xl border border-indigo-50 flex flex-col justify-between relative overflow-hidden ${savedGames.length === 0 ? 'opacity-50' : 'hover:shadow-2xl transition-all'}`}>
            <div>
                <h2 className="text-2xl font-bold mb-4 text-gray-800 flex items-center gap-2">
                    <Book className="text-green-500 w-6 h-6"/> Load Game
                </h2>
                <p className="text-gray-600 mb-6">Continue your journey with one of your saved stories.</p>
                <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 p-3 rounded-lg">
                    <Save className="w-4 h-4"/>
                    <span>{savedGames.length} saved stor{savedGames.length === 1 ? 'y' : 'ies'} found</span>
                </div>
            </div>

            <button 
                onClick={() => setView('load-game')}
                disabled={savedGames.length === 0}
                className="w-full py-4 bg-green-500 text-white rounded-xl font-bold text-xl shadow-lg hover:bg-green-600 transition-all flex items-center justify-center gap-3 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
                Load Saved Story <Play fill="currentColor" className="w-5 h-5"/>
            </button>
        </div>
      </div>
    </div>
  );

  const renderLoadGameScreen = () => {
    const filteredGames = savedGames.filter(game => {
        const query = searchQuery.toLowerCase();
        return (
            game.character.name.toLowerCase().includes(query) ||
            game.storyHistory.some(ch => ch.title.toLowerCase().includes(query))
        );
    });

    return (
        <div className="max-w-4xl mx-auto p-4 min-h-[80vh]">
            <div className="flex items-center gap-4 mb-8">
                <button 
                    onClick={() => setView('onboarding')}
                    className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                >
                    <ChevronLeft className="w-6 h-6 text-gray-600" />
                </button>
                <h1 className="text-3xl font-bold text-indigo-900">Load a Saved Story</h1>
            </div>

            {/* Search Bar */}
            <div className="relative mb-8">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input 
                    type="text" 
                    placeholder="Search by character or story title..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-indigo-100 focus:border-indigo-500 focus:ring-0 text-lg shadow-sm"
                />
            </div>

            {/* Grid of Saves */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredGames.length > 0 ? (
                    filteredGames.map((game) => (
                        <div 
                            key={game.id} 
                            onClick={() => handleLoadGame(game)}
                            className="bg-white p-4 rounded-2xl shadow-md border border-gray-100 hover:shadow-xl hover:border-indigo-200 transition-all cursor-pointer group flex gap-4 relative"
                        >
                            {/* Thumbnail */}
                            <div className="w-24 h-24 flex-shrink-0 rounded-xl overflow-hidden bg-gray-100">
                                <img src={game.character.imageUrl} alt={game.character.name} className="w-full h-full object-cover" />
                            </div>

                            {/* Info */}
                            <div className="flex-grow flex flex-col justify-between">
                                <div>
                                    <h3 className="font-bold text-lg text-gray-800 group-hover:text-indigo-600 transition-colors line-clamp-1">{game.character.name}</h3>
                                    <p className="text-sm text-gray-500 line-clamp-1">{game.storyHistory[game.storyHistory.length - 1]?.title || 'Unknown Chapter'}</p>
                                </div>
                                
                                <div className="flex flex-col gap-1 mt-2">
                                     <div className="w-full bg-gray-100 rounded-full h-1.5">
                                        <div 
                                            className="bg-green-500 h-1.5 rounded-full" 
                                            style={{width: `${Math.min(100, ((game.storyHistory.length) / (game.storyConfig?.totalChapters || 10)) * 100)}%`}}
                                        />
                                     </div>
                                     <div className="flex items-center justify-between text-xs text-gray-400">
                                        <div className="flex items-center gap-3">
                                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3"/> {new Date(game.lastSaved).toLocaleDateString()}</span>
                                        </div>
                                        <button 
                                            onClick={(e) => handleDeleteSave(e, game.id)}
                                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors z-10 relative"
                                            title="Delete Save"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                     </div>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="col-span-full text-center py-12 text-gray-400">
                        <div className="mb-2">No saved stories found matching "{searchQuery}"</div>
                        {savedGames.length === 0 && <div>Start a new adventure to see it here!</div>}
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {deleteConfirmId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-xl font-bold text-gray-900">Delete Story?</h3>
                            <button onClick={() => setDeleteConfirmId(null)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5"/>
                            </button>
                        </div>
                        <p className="text-gray-600 mb-6">Are you sure you want to delete this adventure? This cannot be undone.</p>
                        <div className="flex gap-3 justify-end">
                            <button 
                                onClick={() => setDeleteConfirmId(null)}
                                className="px-4 py-2 rounded-lg text-gray-600 font-medium hover:bg-gray-100 transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={confirmDelete}
                                className="px-4 py-2 rounded-lg bg-red-500 text-white font-bold hover:bg-red-600 shadow-md transition-colors flex items-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" /> Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
  };

  const renderCharacterReview = () => {
    // Progress capped at 100% (target word count)
    const progressPercent = Math.min(100, Math.floor((generatedWordCount / storyConfig.targetWordCount) * 100));
    
    return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] max-w-4xl mx-auto p-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl w-full border border-indigo-50">
        <h2 className="text-3xl font-bold mb-8 text-gray-800 text-center">Meet {character?.name}!</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div className="relative group mx-auto w-full flex justify-center">
             <div className="relative w-64 h-64 md:w-80 md:h-80 rounded-2xl overflow-hidden shadow-2xl border-4 border-white ring-4 ring-indigo-50">
                <img 
                    src={character?.imageUrl} 
                    alt={character?.name} 
                    className="w-full h-full object-cover" 
                />
             </div>
             
             <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 w-64 z-10">
                {isWritingStory ? (
                   <div className="bg-white px-4 py-3 rounded-xl shadow-lg border border-indigo-100">
                     <div className="flex items-center gap-2 mb-2">
                        <Loader2 className="w-4 h-4 text-indigo-500 animate-spin"/>
                        <span className="text-xs font-bold text-indigo-700">Writing Story... ({generatedWordCount} words)</span>
                     </div>
                     <div className="w-full h-2 bg-indigo-100 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-indigo-500 transition-all duration-300 ease-out"
                            style={{ width: `${progressPercent}%` }}
                        />
                     </div>
                   </div>
                ) : (
                   <div className="bg-white px-4 py-2 rounded-full shadow-lg border border-green-100 flex items-center justify-center gap-2 whitespace-nowrap">
                     <Check className="w-4 h-4 text-green-500"/>
                     <span className="text-sm font-bold text-green-700">Story Ready!</span>
                   </div>
                )}
             </div>
          </div>

          <div className="space-y-6 mt-8 md:mt-0 text-center md:text-left">
             <div>
                <h3 className="text-2xl font-bold text-indigo-900 mb-2">{character?.name}</h3>
                <p className="text-gray-600 italic">"{character?.description}"</p>
             </div>
             
             <div className="bg-indigo-50 p-6 rounded-2xl text-left">
                <h3 className="font-bold text-indigo-900 mb-2 flex items-center gap-2">
                    <Sparkles className="w-5 h-5"/> Ready for adventure?
                </h3>
                <p className="text-sm text-indigo-700 mb-4">Your character is ready and the first chapter is being written just for you.</p>
             </div>

             <button 
                onClick={handleConfirmAdventure}
                disabled={!pendingChapter}
                className="w-full py-4 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold text-xl shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:bg-gray-300 disabled:cursor-not-allowed disabled:transform-none"
             >
                {isWritingStory ? 'Writing Chapter 1...' : 'Start Adventure!'} <Play fill="currentColor" />
             </button>
          </div>
        </div>
      </div>
    </div>
  )};

  const isReadingView = view === 'reading' && !!character;

  return (
    // Fixed inset-0 ensures we take exactly the viewport size, preventing body scrollbar
    <div className={`fixed inset-0 flex flex-col transition-colors duration-500 ${settings.colorTheme === 'default' ? 'bg-gray-50' : settings.colorTheme === 'yellow' ? 'bg-[#fdf6e3]' : settings.colorTheme === 'blue' ? 'bg-[#e0f7fa]' : 'bg-[#fce4ec]'}`}>
      
      {/* Navigation - Fixed height */}
      <nav className="flex-none h-16 bg-white/80 backdrop-blur-md border-b border-gray-200 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
          <div className="flex justify-between items-center h-full">
            <div className="flex items-center cursor-pointer" onClick={() => setView('onboarding')}>
              <Book className="w-8 h-8 text-indigo-600 mr-2" />
              <span className="font-extrabold text-xl text-gray-800">ReadQuest</span>
            </div>
            
            <div className="flex items-center space-x-4">
              {isReadingView && (
                  <button
                    onClick={handleSaveGame}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-indigo-600 hover:bg-indigo-50 transition-colors mr-2 relative"
                  >
                    <Save className="w-4 h-4" />
                    <span className="hidden sm:inline">Save</span>
                    {showSaveConfirm && (
                        <span className="absolute top-10 left-1/2 -translate-x-1/2 bg-green-500 text-white text-xs px-2 py-1 rounded shadow-lg animate-fade-in-up whitespace-nowrap">
                            Saved!
                        </span>
                    )}
                  </button>
              )}

              <button 
                onClick={() => setView('reading')} 
                disabled={storyHistory.length === 0}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${view === 'reading' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-900'}`}
              >
                <Book className="w-4 h-4" /> Story
              </button>
              <button 
                onClick={() => setView('parents')} 
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${view === 'parents' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-900'}`}
              >
                <Layout className="w-4 h-4" /> Parents
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content - Flex Grow takes remaining height */}
      {/* Logic: If reading view, disable outer scroll so internal FocusReader handles it.
                 If other views, allow outer scroll. */}
      <main className={`flex-grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative
          ${isReadingView ? 'overflow-hidden py-4' : 'overflow-y-auto py-8 custom-scrollbar'}
      `}>
        {view === 'onboarding' && renderOnboarding()}
        
        {view === 'load-game' && renderLoadGameScreen()}
        
        {view === 'character-review' && renderCharacterReview()}

        {view === 'reading' && character && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
            
            {/* Sidebar - Scrollable independently if needed */}
            <div className="lg:col-span-3 space-y-6 overflow-y-auto h-full hidden lg:block pb-4 pr-2">
              <div className="bg-white p-4 rounded-2xl shadow-lg border border-indigo-100 text-center">
                <img src={character.imageUrl} alt={character.name} className="w-32 h-32 rounded-full mx-auto mb-3 object-cover border-4 border-indigo-100 shadow-sm" />
                <h3 className="font-bold text-lg text-gray-800">{character.name}</h3>
                <p className="text-xs text-gray-500 mt-1 line-clamp-3">{character.description}</p>
              </div>
              <SettingsPanel settings={settings} updateSettings={(s) => setSettings(prev => ({ ...prev, ...s }))} />
              
              <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
                  <h4 className="font-bold text-indigo-900 mb-2 text-sm flex items-center gap-2"><Ruler className="w-3 h-3"/> Progress</h4>
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>Chapter</span>
                      <span>{currentChapterIndex + 1} / {storyConfig.totalChapters}</span>
                  </div>
                  <div className="w-full bg-white rounded-full h-2">
                    <div 
                        className="bg-indigo-500 h-2 rounded-full transition-all duration-500" 
                        style={{width: `${Math.min(100, ((currentChapterIndex + 1) / storyConfig.totalChapters) * 100)}%`}}
                    />
                  </div>
              </div>

              <div className="bg-indigo-900 text-white p-4 rounded-2xl shadow-lg">
                <h4 className="font-bold mb-2">Current Stats</h4>
                <div className="text-sm opacity-80">
                  <div className="flex justify-between mb-1">
                    <span>Accuracy</span>
                    <span>{readingHistory.length > 0 ? readingHistory[readingHistory.length - 1].stats.accuracy : 0}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Words Read</span>
                    <span>{readingHistory.reduce((a,b) => a + b.wordCount, 0)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Reading Area - Locked height, internal scroll */}
            <div className="lg:col-span-9 h-full flex flex-col min-h-0">
              {isLoading ? (
                <div className="flex-grow flex flex-col items-center justify-center bg-white/50 rounded-2xl p-8">
                   <div className="w-full max-w-md text-center space-y-6">
                      {/* Scene Preview */}
                      <div className="w-64 h-64 mx-auto rounded-2xl overflow-hidden shadow-xl bg-gray-200 border-4 border-white relative">
                          {loadingSceneUrl ? (
                              <img src={loadingSceneUrl} className="w-full h-full object-cover animate-in fade-in duration-500" alt="Scene preview" />
                          ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                  <Loader2 className="w-12 h-12 text-gray-400 animate-spin" />
                              </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent flex items-end justify-center p-4">
                              <span className="text-white font-medium text-sm">Visualizing Chapter {currentChapterIndex + 2}...</span>
                          </div>
                      </div>

                      {/* Progress Bar */}
                      <div>
                        <div className="flex justify-between text-sm font-bold text-indigo-800 mb-2">
                            <span>Writing Story...</span>
                            <span>{generatedWordCount} / {storyConfig.targetWordCount} words</span>
                        </div>
                        <div className="w-full h-3 bg-indigo-100 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-indigo-600 transition-all duration-300 ease-out"
                                style={{ width: `${Math.min(100, Math.floor((generatedWordCount / storyConfig.targetWordCount) * 100))}%` }}
                            />
                        </div>
                      </div>
                   </div>
                </div>
              ) : storyHistory[currentChapterIndex] ? (
                <FocusReader 
                  chapter={storyHistory[currentChapterIndex]}
                  settings={settings}
                  onFinishChapter={handleFinishChapter}
                  onMakeChoice={handleMakeChoice}
                />
              ) : (
                <div className="p-8 text-center text-red-500 bg-white rounded-xl shadow">
                    Something went wrong loading the chapter. Please restart the adventure.
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'parents' && (
          <ParentDashboard history={getAllReadingSessions} />
        )}
      </main>
    </div>
  );
}