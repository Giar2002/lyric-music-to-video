import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function transcribeLyrics(audioBase64: string, mimeType: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          text: "Please transcribe the lyrics of this song. Return only the lyrics text, one line at a time. No intro, no outro, no metadata. If you cannot hear clearly, just do your best.",
        },
        {
          inlineData: {
            data: audioBase64,
            mimeType: mimeType,
          },
        },
      ],
    });
    return response.text || "";
  } catch (error) {
    console.error("Transcription error:", error);
    throw new Error("Gagal mentranskripsi lirik. Silakan masukkan secara manual.");
  }
}
