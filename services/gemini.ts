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

// --- Flux Image Generation (External) ---

// Rate Limit Configuration for Flux (6 images per minute)
const FLUX_TIMESTAMPS: number[] = [];
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute in ms
const MAX_REQUESTS_PER_MINUTE = 6;

const waitForRateLimit = async () => {
  while (true) {
    const now = Date.now();
    // 1. Remove timestamps that are older than the 1-minute window
    while (FLUX_TIMESTAMPS.length > 0 && FLUX_TIMESTAMPS[0] < now - RATE_LIMIT_WINDOW) {
      FLUX_TIMESTAMPS.shift();
    }

    // 2. Check if we have slot available
    if (FLUX_TIMESTAMPS.length < MAX_REQUESTS_PER_MINUTE) {
      FLUX_TIMESTAMPS.push(now);
      return; // Proceed
    }

    // 3. If limit reached, calculate wait time based on the oldest request
    const oldestRequestTime = FLUX_TIMESTAMPS[0];
    const timeUntilExpiry = (oldestRequestTime + RATE_LIMIT_WINDOW) - now;
    const waitTime = Math.max(100, timeUntilExpiry + 100); // Wait until it expires + buffer

    console.log(`Flux Rate Limit Reached (6/min). Waiting ${Math.ceil(waitTime / 1000)}s...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
};

const queryFlux = async (prompt: string): Promise<string> => {
  await waitForRateLimit();

  const hfKey = process.env.HUGGING_FACE_API_KEY;
  
  // Construct headers dynamically to avoid sending empty Authorization
  const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-use-cache": "false"
  };
  
  if (hfKey) {
      headers["Authorization"] = `Bearer ${hfKey}`;
  }

  try {
      const response = await fetch(
          "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell",
          {
              headers,
              method: "POST",
              body: JSON.stringify({ inputs: prompt }),
          }
      );

      if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Flux API Error (${response.status}): ${errText}`);
      }

      const blob = await response.blob();
      
      // Convert Blob to Base64 Data URL
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
              if (typeof reader.result === 'string') {
                  resolve(reader.result);
              } else {
                  reject(new Error("Failed to convert image blob to string"));
              }
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
      });

  } catch (error: any) {
      console.warn("Flux Generation Failed (falling back to Gemini):", error);
      throw error;
  }
};

// --- Gemini Image Gen Fallback ---
const generateImageGemini = async (prompt: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: prompt }] },
    });
    
    for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData && part.inlineData.data) {
            return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        }
    }
    throw new Error("No image data found in Gemini response");
  } catch (e) {
      console.error("Gemini Image Gen Failed:", e);
      throw e;
  }
};

export const generateCharacterImage = async (description: string, age: number, style: string): Promise<string> => {
  // Try Flux first
  try {
      const fluxPrompt = `A high-quality children's book character illustration. 
      Character Description: ${description}.
      Art Style: ${style}.
      Context: Isolated character on a plain white background, full body, expressive, cute.`;
      
      return await queryFlux(fluxPrompt);
  } catch (e) {
      // Fallback to Gemini 2.5 Flash if Flux fails (e.g. CORS, no key, network)
      const geminiPrompt = `Draw a children's book character. 
      Description: ${description}. 
      Style: ${style}. 
      Keep it on a white background.`;
      return await generateImageGemini(geminiPrompt);
  }
};

export const generateSceneImage = async (previousChapterContent: string, characterDescription: string, style: string): Promise<string> => {
    // Truncate context to keep prompt concise
    const context = previousChapterContent.length > 500 
        ? previousChapterContent.slice(0, 500) + "..." 
        : previousChapterContent;
    const cleanContext = context.replace(/\s+/g, ' ').trim();

    // Try Flux first
    try {
        const fluxPrompt = `Children's book illustration. 
        Art Style: ${style}.
        Scene Description: ${cleanContext}.
        Main Character Details: ${characterDescription}.
        Mood: Magical, storytelling, detailed, vibrant.`;

        return await queryFlux(fluxPrompt);
    } catch (e) {
        // Fallback to Gemini 2.5 Flash
        const geminiPrompt = `Create an illustration for a children's story.
        Style: ${style}.
        Scene: ${cleanContext}.
        Include character matching: ${characterDescription}`;
        return await generateImageGemini(geminiPrompt);
    }
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