import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";

export class LiveClient {
  private ai: GoogleGenAI;
  private session: Promise<any> | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  
  public onTranscriptionUpdate: ((text: string) => void) | null = null;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async connect() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 16000,
    });

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      console.error("Microphone permission denied or not available", e);
      throw new Error("Microphone access is required for reading features.");
    }

    // Connect to Gemini Live
    const sessionPromise = this.ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      callbacks: {
        onopen: () => {
          console.log("Live API Connected");
          this.startAudioStream(sessionPromise);
        },
        onmessage: (message: LiveServerMessage) => {
          if (message.serverContent?.inputTranscription) {
            const text = message.serverContent.inputTranscription.text;
            if (this.onTranscriptionUpdate && text) {
              this.onTranscriptionUpdate(text);
            }
          }
        },
        onclose: () => console.log("Live API Closed"),
        onerror: (err) => console.error("Live API Error", err),
      },
      config: {
        responseModalities: [Modality.AUDIO],
        inputAudioTranscription: {}, 
        systemInstruction: "You are a silent listener. Your job is only to listen to the user read. Do not speak.",
      },
    });

    this.session = sessionPromise;
  }

  private startAudioStream(sessionPromise: Promise<any>) {
    if (!this.audioContext || !this.mediaStream) return;

    this.inputSource = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const pcmBlob = this.createBlob(inputData);
      
      sessionPromise.then((session) => {
        session.sendRealtimeInput({ media: pcmBlob });
      });
    };

    this.inputSource.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  private createBlob(data: Float32Array) {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = data[i] * 32768;
    }
    
    // Manual base64 encoding for the raw PCM data
    let binary = '';
    const bytes = new Uint8Array(int16.buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Data = btoa(binary);

    return {
      data: base64Data,
      mimeType: 'audio/pcm;rate=16000',
    };
  }

  async disconnect() {
    if (this.session) {
      try {
        const session = await this.session;
        session.close();
      } catch (e) {
        console.error("Error closing Live API session", e);
      }
      this.session = null;
    }
    
    if (this.processor) {
        this.processor.disconnect();
        this.processor = null;
    }
    if (this.inputSource) {
        this.inputSource.disconnect();
        this.inputSource = null;
    }
    if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
    }
    if (this.audioContext) {
        this.audioContext.close();
        this.audioContext = null;
    }
  }
}