import type { AppConfig } from "../../config/env";
import { MemoryCache } from "../../shared/cache/memory-cache";

export interface TranscriptionResult {
  transcript: string;
  languageCode: string;
}

export class SpeechService {
  private readonly mockMode: boolean;
  private readonly apiKey: string | undefined;
  private readonly ttsCache = new MemoryCache(600000); // 10 minutes TTL

  public constructor(config: AppConfig) {
    this.apiKey = config.sarvamApiKey;
    // Fall back to mock mode in test environment or when API key is not supplied
    this.mockMode = config.nodeEnv === "test" || !this.apiKey;
  }

  /**
   * Wraps a raw G.711 mu-law audio buffer in a standard WAV header.
   * This is required because Sarvam ASR requires a container format.
   */
  public wrapMuLawInWav(muLawBuffer: Buffer): Buffer {
    const header = Buffer.alloc(46);
    const dataLength = muLawBuffer.length;

    // RIFF header
    header.write("RIFF", 0);
    header.writeUInt32LE(dataLength + 38, 4); // chunk size
    header.write("WAVE", 8);

    // fmt chunk
    header.write("fmt ", 12);
    header.writeUInt32LE(18, 16); // format chunk size (18 bytes for mu-law)
    header.writeUInt16LE(7, 20); // format code: 7 = WAVE_FORMAT_MULAW
    header.writeUInt16LE(1, 22); // channels: 1 (mono)
    header.writeUInt32LE(8000, 24); // sample rate: 8000 Hz
    header.writeUInt32LE(8000, 28); // byte rate: 8000 bytes/sec
    header.writeUInt16LE(1, 32); // block align: 1
    header.writeUInt16LE(8, 34); // bits per sample: 8
    header.writeUInt16LE(0, 36); // extra parameters size: 0

    // data chunk
    header.write("data", 38);
    header.writeUInt32LE(dataLength, 42);

    return Buffer.concat([header, muLawBuffer]);
  }

  /**
   * Transcribes a raw mu-law audio buffer to plain text.
   * In mock mode, returns a placeholder transcription.
   */
  public async transcribeAudioBuffer(
    buffer: Buffer,
    fallbackLanguageCode: string
  ): Promise<TranscriptionResult> {
    if (buffer.length === 0) {
      return { transcript: "", languageCode: fallbackLanguageCode };
    }

    if (this.mockMode) {
      // Simulate transcription based on fallbackLanguageCode
      if (fallbackLanguageCode.startsWith("hi")) {
        return { transcript: "मुझे राशन कार्ड के नियम बताएं", languageCode: "hi-IN" };
      }
      if (fallbackLanguageCode.startsWith("te")) {
        return { transcript: "నాకు రేషన్ కార్డ్ కావాలి", languageCode: "te-IN" };
      }
      return { transcript: "How do I get a ration card?", languageCode: "en-IN" };
    }

    try {
      const wavBuffer = this.wrapMuLawInWav(buffer);
      const formData = new FormData();
      const audioBlob = new Blob([wavBuffer], { type: "audio/wav" });
      formData.append("file", audioBlob, "input.wav");
      formData.append("model", "saaras:v3");

      const response = await fetch("https://api.sarvam.ai/speech-to-text", {
        method: "POST",
        headers: {
          "api-subscription-key": this.apiKey!,
        },
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Sarvam ASR API error (${response.status}): ${errText}`);
      }

      const data = (await response.json()) as {
        transcript: string;
        language_code?: string;
      };

      return {
        transcript: data.transcript || "",
        languageCode: data.language_code || fallbackLanguageCode,
      };
    } catch (error) {
      throw new Error(`Failed to transcribe audio via Sarvam: ${(error as Error).message}`);
    }
  }

  /**
   * Synthesizes a text response into a raw mu-law audio buffer (8000Hz, mono).
   * In mock mode, returns a dummy buffer pre-filled with mu-law silence bytes (0xff).
   */
  public async synthesizeSpeech(text: string, languageCode: string): Promise<Buffer> {
    if (!text || text.trim() === "") {
      return Buffer.alloc(0);
    }

    const cacheKey = `${languageCode}:${text}`;
    const cached = this.ttsCache.get<Buffer>(cacheKey);
    if (cached) {
      return cached;
    }

    if (this.mockMode) {
      // Return 800 bytes of mu-law silence (equivalent to 100ms of audio at 8000Hz)
      const mockAudio = Buffer.alloc(800);
      mockAudio.fill(0xff); // 0xff is mu-law silence
      this.ttsCache.set(cacheKey, mockAudio);
      return mockAudio;
    }

    try {
      const payload = {
        text,
        model: "bulbul:v3",
        target_language_code: languageCode,
        speaker: "shubh",
        speech_sample_rate: 8000,
        output_audio_codec: "mulaw",
      };

      const response = await fetch("https://api.sarvam.ai/text-to-speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-subscription-key": this.apiKey!,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Sarvam TTS API error (${response.status}): ${errText}`);
      }

      const data = (await response.json()) as {
        audios: string[];
      };

      if (!data.audios || data.audios.length === 0 || !data.audios[0]) {
        throw new Error("No audio payload returned from Sarvam TTS API.");
      }

      const audioBuffer = Buffer.from(data.audios[0], "base64");
      this.ttsCache.set(cacheKey, audioBuffer);
      return audioBuffer;
    } catch (error) {
      throw new Error(`Failed to synthesize speech via Sarvam: ${(error as Error).message}`);
    }
  }
}
