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

// --- Image Generation ---
export const generateCharacterImage = async (description: string, age: number, style: string): Promise<string> => {
  try {
    // Combine age hint with the selected style
    const ageHint = age < 7 ? "simple, cute" : "detailed";
    
    // Note: Image generation does not have a "Lite" variant. We use the standard flash-image.
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { text: `Create a character illustration matching this description: ${description}. 
            Style: ${style}. 
            Additional Context: ${ageHint}. 
            The character should be on a plain or simple background. Ensure high quality.` }
        ]
      },
    });

    for (const candidate of response.candidates || []) {
      for (const part of candidate.content.parts) {
        if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }
    throw new Error("No image generated in response");
  } catch (error: any) {
    console.error("Image gen error:", error);
    throw new Error(`Image generation failed: ${error.message || error}`);
  }
};

export const generateSceneImage = async (previousChapterContent: string, characterDescription: string, style: string): Promise<string> => {
    try {
        // Optimization: Consolidated Summary + Generation into a single call.
        // We trim the context to the last ~1500 characters to keep payload light for the image model.
        const context = previousChapterContent.length > 1500 
            ? "..." + previousChapterContent.slice(-1500) 
            : previousChapterContent;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [
                    { text: `Draw a children's book illustration based on this story excerpt: "${context}". \n\nIMPORTANT: Include the main character: ${characterDescription}. \n\nStyle: ${style}.` }
                ]
            },
        });

        for (const candidate of response.candidates || []) {
            for (const part of candidate.content.parts) {
                if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
                    return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                }
            }
        }
        return ""; 
    } catch (e) {
        console.error("Scene generation failed", e);
        return "";
    }
}

// --- Story Generation ---
export const generateStoryStart = async (
    charName: string, 
    charDesc: string, 
    config: StoryConfig, 
    onProgress?: (count: number) => void
): Promise<StoryChapter> => {
  // Use Gemini 3 Pro for high quality storytelling
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

// --- Scoring Logic ---
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

  const response = await ai.models.generateContent({
    model: 'gemini-flash-lite-latest',
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
