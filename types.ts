export interface Character {
  name: string;
  description: string;
  imageUrl: string;
}

export interface StoryChapter {
  title: string;
  content: string;
  choices?: string[];
}

export interface ReadingSession {
  id: string;
  date: string;
  chapterTitle: string;
  wordCount: number;
  durationSeconds: number;
  stats: ReadingStats;
}

export interface ReadingStats {
  accuracy: number; // 0-100
  speed: number; // WPM
  pronunciation: number; // 0-100 score
  missedWords: string[];
}

export interface AppSettings {
  isDyslexicFont: boolean;
  colorTheme: 'default' | 'yellow' | 'blue' | 'pink';
  fontSize: 'normal' | 'large' | 'xl';
}

export interface GameState {
  character: Character;
  storyHistory: StoryChapter[];
  currentChapterIndex: number;
  readingHistory: ReadingSession[];
  generatedWordCount: number; // To preserve progress state if saved mid-generation (though usually we save after)
}