import { GoogleGenAI, Type } from "@google/genai";
import { ReadingStats, StoryChapter, StoryConfig } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Helper for Robust JSON Parsing ---
const cleanAndParseJSON = (text: string): any => {
  try {
    // Remove markdown code blocks if present
    let cleanText = text.replace(/```json/g, '').replace(/```/g, '');
    // Find the first '{' and last '}' to handle potential preamble/postscript text
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleanText = cleanText.substring(firstBrace, lastBrace + 1);
    }
    
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("JSON Clean Parse failed:", e);
    console.log("Raw text was:", text);
    return {};
  }
};

// --- Helper: Blob to Base64 ---
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error("Failed to convert blob to string"));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// --- Fallback Placeholder (SVG) ---
export const getPlaceholderImage = (text: string, bgColor: string = "#e0e7ff", textColor: string = "#4338ca"): string => {
  // Safe base64 encoding that handles unicode
  const safeText = text.replace(/[^\w\s]/gi, ''); // Strip special chars for the SVG text to be safe
  const svg = `
  <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="${bgColor}"/>
    <text x="50%" y="45%" font-family="sans-serif" font-size="48" font-weight="bold" fill="${textColor}" text-anchor="middle" dominant-baseline="middle">
      ${safeText}
    </text>
    <text x="50%" y="60%" font-family="sans-serif" font-size="24" fill="${textColor}" text-anchor="middle" dominant-baseline="middle" opacity="0.6">
      (Image unavailable)
    </text>
  </svg>`;
  
  try {
      return `data:image/svg+xml;base64,${btoa(svg)}`;
  } catch (e) {
      // Fallback if btoa fails (rare)
      return `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZTBlN2ZmIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjMyIiBmaWxsPSIjNDMzOGNhIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIj5JbWFnZSBFcnJvcjwvdGV4dD48L3N2Zz4=`;
  }
};


// --- Cloudflare Worker Image Generation Service ---

const queryCloudflareWorker = async (prompt: string): Promise<string> => {
    try {
        console.log("Generating image with prompt:", prompt);
        const response = await fetch(
            `https://readquestimagen.jonathan-bickerton.workers.dev/?prompt=${encodeURIComponent(prompt)}`
        );

        if (!response.ok) {
            throw new Error(`Cloudflare Worker Error ${response.status}`);
        }

        const blob = await response.blob();
        
        // VALIDATION: Ensure we actually got an image
        if (blob.type.includes('application/json') || blob.type.includes('text')) {
            const text = await blob.text();
            throw new Error(`Worker returned invalid content: ${text.slice(0, 100)}`);
        }

        return await blobToBase64(blob);
    } catch (e: any) {
        console.error("Image generation failed:", e);
        return getPlaceholderImage("Image Gen Failed");
    }
};

export const generateCharacterImage = async (name: string, description: string, style: string): Promise<string> => {
  // Flux.1 Schnell Prompt Engineering:
  // Uses natural language structures. Style first, then Subject, then Details.
  const prompt = `Create a character design in the style of: ${style}. Character Name: ${name}. Description: ${description}. Setting: Isolated on a pure white background. View: Full body. Quality: Masterpiece, high resolution, sharp focus.`;
  return queryCloudflareWorker(prompt);
};

export const generateSceneImage = async (previousChapterContent: string, characterDescription: string, style: string): Promise<string> => {
    // Flux handles longer context well. Clean newlines to save tokens/url length but keep flow.
    const cleanContext = previousChapterContent.replace(/\s+/g, ' ');
    
    // Increase context window to 350 chars for better narrative understanding
    const context = cleanContext.length > 350 
        ? cleanContext.slice(0, 350) + "..."
        : cleanContext;
    
    const prompt = `Create a story illustration in the style of: ${style}. Scene Description: ${context}. The main character is present, looking like: ${characterDescription}. Quality: Cinematic lighting, detailed background, dynamic composition, 8k resolution.`;
    return queryCloudflareWorker(prompt);
}

// --- Story Generation (Gemini 3 Pro) ---
export const generateStoryStart = async (
    charName: string, 
    charDesc: string, 
    config: StoryConfig, 
    onProgress?: (count: number) => void
): Promise<StoryChapter> => {
  const prompt = `Write the first chapter of a children's adventure story about a hero named ${charName} who is ${charDesc}. 
  
  CONFIGURATION:
  - Target Audience Age: ${config.readingAge} years old.
  - Vocabulary Difficulty: ${config.readingAge < 7 ? "Very Simple (Dolch sight words, short sentences)" : config.readingAge < 10 ? "Simple (Common words, moderate sentences)" : "Moderate (Some challenging words allowed)"}.
  - Chapter Length: Approximately ${config.targetWordCount} words.
  - Total Book Length: ${config.totalChapters} chapters.
  
  REQUIREMENTS:
  - Tone: Engaging, fun, and age-appropriate.
  - Structure: Use proper paragraphs, dialogue, and correct punctuation.
  - Ending: End the chapter with a clear cliffhanger or decision point.
  - Choices: Provide 3 distinct short options for what happens next.
  
  Output JSON format:
  {
    "title": "Chapter Title",
    "content": "Full story text here...",
    "choices": ["Option 1", "Option 2", "Option 3"]
  }`;

  const responseStream = await ai.models.generateContentStream({
    model: 'gemini-3-pro-preview', 
    contents: prompt,
    config: {
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    }
  });

  let fullText = '';
  
  for await (const chunk of responseStream) {
    const chunkText = chunk.text;
    if (chunkText) {
        fullText += chunkText;
        if (onProgress) {
            onProgress(fullText.split(/\s+/).length);
        }
    }
  }

  const data = cleanAndParseJSON(fullText);

  return {
    title: data.title || "The Adventure Begins",
    content: data.content || `Once there was a hero named ${charName}. ${charDesc}. The adventure was about to begin.`,
    choices: Array.isArray(data.choices) && data.choices.length > 0 ? data.choices : ["Look around", "Walk forward", "Check inventory"]
  };
};

export const generateNextChapter = async (
    previousContext: string, 
    choice: string, 
    config: StoryConfig,
    currentChapterIndex: number, // 0-based index of the chapter we are ABOUT to generate
    onProgress?: (count: number) => void
): Promise<StoryChapter> => {
  
  const isPenultimate = currentChapterIndex === config.totalChapters - 2; 
  const isFinal = currentChapterIndex === config.totalChapters - 1; 

  let narrativeInstruction = "";
  if (isPenultimate) {
      narrativeInstruction = "IMPORTANT: This is the PENULTIMATE chapter. Build up to a major event or climax! Do not resolve the story yet, but set the stage for the big finale.";
  } else if (isFinal) {
      narrativeInstruction = "IMPORTANT: This is the FINAL chapter. Explain the outcome of the adventure and what happened after the event. Provide a satisfying conclusion.";
  } else {
      narrativeInstruction = "Continue the adventure. Build character development and introduce new challenges.";
  }

  const prompt = `Continue the story based on the previous context. The user chose: "${choice}".
  
  CONFIGURATION:
  - Target Audience Age: ${config.readingAge} years old.
  - Vocabulary: ${config.readingAge < 7 ? "Very Simple" : "Age Appropriate"}.
  - Target Length: ${config.targetWordCount} words.
  - Current Chapter: ${currentChapterIndex + 1} of ${config.totalChapters}.
  
  NARRATIVE GOAL: ${narrativeInstruction}
  
  REQUIREMENTS:
  - Length: Approximately ${config.targetWordCount} words.
  - Tone: Engaging, fun, and suitable for the age group.
  - Structure: Use proper paragraphs, dialogue, and correct punctuation.
  - Consistency: Maintain the plot and character personality.
  ${isFinal ? '- Ending: This is the end. Do NOT provide choices.' : '- Ending: End with 3 new distinct options.'}
  
  Output JSON format:
  {
    "title": "Chapter Title",
    "content": "Full story text here...",
    "choices": ${isFinal ? "[]" : `["Option 1", "Option 2", "Option 3"]`}
  }`;

  // Limit context to save tokens, though Flash has a large context window, reducing payload helps latency.
  const trimmedContext = previousContext.length > 20000 ? "..." + previousContext.slice(-20000) : previousContext;

  const responseStream = await ai.models.generateContentStream({
    model: 'gemini-3-pro-preview',
    contents: [
        { role: 'user', parts: [{ text: `Previous story context: ${trimmedContext}` }] },
        { role: 'user', parts: [{ text: prompt }] }
    ],
    config: {
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    }
  });

  let fullText = '';
  
  for await (const chunk of responseStream) {
    const chunkText = chunk.text;
    if (chunkText) {
        fullText += chunkText;
        if (onProgress) {
            onProgress(fullText.split(/\s+/).length);
        }
    }
  }

  const data = cleanAndParseJSON(fullText);

  return {
    title: data.title || (isFinal ? "The End" : "Next Chapter"),
    content: data.content || "The story continues...",
    choices: isFinal ? [] : (Array.isArray(data.choices) && data.choices.length > 0 ? data.choices : ["Continue"])
  };
};

// --- Scoring Logic (Gemini 3 Pro) ---
export const calculateReadingScore = async (originalText: string, transcribedText: string, durationSeconds: number): Promise<ReadingStats> => {
  const prompt = `You are a reading tutor. 
  Original Text: "${originalText.substring(0, 1000)}..." (truncated)
  Child's Transcription: "${transcribedText}"
  Duration: ${durationSeconds} seconds.

  Analyze the reading. 
  1. Calculate accuracy (percentage of words read correctly).
  2. Estimate pronunciation quality (0-100) based on how close the transcript is to the text.
  3. Identify missed or mispronounced words. Return them as a list of strings.
  4. Calculate speed (Words Per Minute).

  Return JSON.`;

  // Updated to use Gemini 3 Pro Preview for deeper analysis
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          accuracy: { type: Type.NUMBER },
          pronunciation: { type: Type.NUMBER },
          speed: { type: Type.NUMBER },
          missedWords: { type: Type.ARRAY, items: { type: Type.STRING } }
        }
      }
    }
  });

  const data = cleanAndParseJSON(response.text || "{}");
  return {
    accuracy: data.accuracy || 0,
    pronunciation: data.pronunciation || 0,
    speed: data.speed || 0,
    missedWords: data.missedWords || []
  };
};