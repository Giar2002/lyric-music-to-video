export interface LyricLine {
  id: string;
  text: string;
  startTime: number; // in seconds
  endTime?: number;
}

export interface AppState {
  audioUrl: string | null;
  audioName: string | null;
  lyrics: LyricLine[];
  step: 'upload' | 'lyrics' | 'sync' | 'preview';
}
