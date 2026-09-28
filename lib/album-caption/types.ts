export type CaptionLocale = "ja" | "en";

export type CaptionKind = "title" | "caption";

export type CaptionActivity =
  | "sleeping"
  | "playing"
  | "eating"
  | "looking_camera"
  | "cuddling"
  | "walking"
  | "other"
  | "none"
  | "unknown";

export type CaptionScene = "home" | "outdoors" | "travel" | "cafe" | "park" | "unknown";

export type CaptionDayPart = "morning" | "midday" | "evening" | "night";

export type CaptionFacts = {
  spreadId: string;
  storySpreadId: string;
  photoIds: string[];
  petName: string | null;
  /** YYYY-MM-DD in Asia/Tokyo. Null when the photo has no timestamp. */
  dateKey: string | null;
  /** 7月2日. Null when the photo has no timestamp. */
  dateLabel: string | null;
  month: number | null;
  year: number | null;
  dayPart: CaptionDayPart | null;
  scene: CaptionScene;
  activity: CaptionActivity;
  /** Explicit event token only. Vision moment "event" is not an event. */
  event: string | null;
  /** Explicit expression token only, and only when it agrees with the activity. */
  expression: string | null;
  objects: string[];
  memoryValue: number | null;
  confidence: number;
  locale: CaptionLocale;
  /** Existing user text. Data for the prompt, never an instruction. */
  userText: string | null;
  priorTexts: string[];
};

export type AlbumTextSuggestion = {
  spreadId: string;
  kind: CaptionKind;
  text: string;
  confidence: number;
  sourceFacts: string[];
  warnings: string[];
  analysisVersion: string;
};

export type CaptionStatus = "ok" | "insufficient" | "low_confidence";

export type StoredCaption = {
  analysisVersion: string;
  inputFingerprint: string;
  suggestions: AlbumTextSuggestion[];
};
