import { GoogleGenAI, Type } from "@google/genai";
import { ReadingStats, StoryChapter } from "../types";

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
export const generateCharacterImage = async (description: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { text: `Create a colorful, friendly, children's book style illustration of a character matching this description: ${description}. The character should be on a plain or simple background. Ensure high quality and cute style.` }
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

export const editCharacterImage = async (currentImageBase64: string, instruction: string): Promise<string> => {
  try {
    const base64Data = currentImageBase64.split(',')[1];
    const mimeType = currentImageBase64.split(';')[0].split(':')[1];

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          },
          { text: `Edit this image: ${instruction}. Keep the same style.` }
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
    throw new Error("No image generated in edit response");
  } catch (error: any) {
    console.error("Image edit error:", error);
    throw new Error(`Image editing failed: ${error.message || error}`);
  }
};

export const generateImageTweaks = async (description: string): Promise<string[]> => {
  const prompt = `Based on this character description: "${description}", suggest 3 distinct, simple visual modifications or specific details a user might want to add or change to refine the character image.
  
  IMPORTANT: 
  - DO NOT suggest features that are already explicitly mentioned in the description.
  - Suggest NEW accessories, background changes, or style adjustments.
  
  Examples of good tweaks: "Add a red hat", "Make it pixel art style", "Give them sunglasses", "Change background to a forest".
  Output ONLY a JSON array of 3 strings.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
        }
      }
    });
    
    return cleanAndParseJSON(response.text || "[]") || ["Add a hat", "Make it brighter", "Change background"];
  } catch (e) {
    return ["Make it cartoon style", "Add a cool accessory", "Change the background"];
  }
};

export const generateSceneImage = async (previousChapterContent: string): Promise<string> => {
    try {
        // Step 1: Summarize context into a visual scene description
        const summaryResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Summarize the following story chapter into a maximum of 2 sentences describing the visual scene for an illustration. Focus on the setting and the main character's action. \n\nChapter: ${previousChapterContent.substring(0, 5000)}`
        });
        const sceneDescription = summaryResponse.text || "A magical adventure scene";

        // Step 2: Generate the image
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [
                    { text: `Create a colorful children's book illustration for this scene: ${sceneDescription}. Keep the style consistent, friendly and vibrant.` }
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
        return ""; // Fallback handled in UI
    } catch (e) {
        console.error("Scene generation failed", e);
        return "";
    }
}

// --- Story Generation ---
export const generateStoryStart = async (charName: string, charDesc: string, onProgress?: (count: number) => void): Promise<StoryChapter> => {
  // Using Gemini 3 Pro for higher quality creative writing
  const prompt = `Write the first chapter of a children's adventure story about a hero named ${charName} who is ${charDesc}. 
  
  REQUIREMENTS:
  - Length: Approximately 500-1000 words.
  - Tone: Engaging, fun, and suitable for a 10-year-old (Lexile 600L-800L).
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
      // We rely on the prompt for structure, avoiding strict schema here to prevent token limit truncation issues with large text fields in strict mode, 
      // but we will parse carefully.
    }
  });

  let fullText = '';
  
  for await (const chunk of responseStream) {
    const chunkText = chunk.text;
    if (chunkText) {
        fullText += chunkText;
        if (onProgress) {
            // Rough word count estimation
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

export const generateNextChapter = async (previousContext: string, choice: string, onProgress?: (count: number) => void): Promise<StoryChapter> => {
  const prompt = `Continue the story based on the previous context. The user chose: "${choice}".
  
  REQUIREMENTS:
  - Length: Approximately 500-1000 words.
  - Tone: Engaging, fun, and suitable for a 10-year-old.
  - Structure: Use proper paragraphs, dialogue, and correct punctuation.
  - Consistency: Maintain the plot and character personality.
  - Ending: End with 3 new distinct options.
  
  Output JSON format:
  {
    "title": "Chapter Title",
    "content": "Full story text here...",
    "choices": ["Option 1", "Option 2", "Option 3"]
  }`;

  // Limit context to prevent token overflow, keeping last ~15000 chars roughly
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
    title: data.title || "Next Chapter",
    content: data.content || "The story continues...",
    choices: Array.isArray(data.choices) && data.choices.length > 0 ? data.choices : ["Continue"]
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
    model: 'gemini-2.5-flash',
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