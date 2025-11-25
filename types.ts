
export interface Character {
  name: string;
  description: string;
  imageUrl: string;
}

export interface StoryChapter {
  title: string;
  content: string;
  choices?: string[];
  imageUrl?: string; // Visual representation of the chapter
}

export interface ReadingStats {
  accuracy: number; // 0-100
  speed: number; // WPM
  pronunciation: number; // 0-100 score
  missedWords: string[];
}

export interface ReadingSession {
  id: string;
  date: string;
  bookTitle?: string; // New field for grouping
  chapterTitle: string;
  wordCount: number;
  durationSeconds: number;
  stats: ReadingStats;
}

export interface AppSettings {
  isDyslexicFont: boolean;
  colorTheme: 'default' | 'yellow' | 'blue' | 'pink';
  fontSize: 'normal' | 'large' | 'xl';
}

export interface StoryConfig {
  readingAge: number;
  targetWordCount: number;
  totalChapters: number;
  visualStyle: string;
  genre: string;
  humorLevel: 'funny' | 'serious' | 'neutral';
}

export interface GameState {
  id: string; 
  lastSaved: string; 
  title?: string; // Story title
  character: Character;
  storyConfig: StoryConfig; // New field for story settings
  storyHistory: StoryChapter[];
  currentChapterIndex: number;
  readingHistory: ReadingSession[];
  generatedWordCount: number;
}
