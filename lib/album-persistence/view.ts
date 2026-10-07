import type { DraftDecoration, DraftTextElement } from "../album-polish/types.ts";
import type { AlbumSpreadDraft } from "../album-draft/types.ts";
import type { SpreadLayoutRanking } from "../album-draft/types.ts";
import type { PageBackgroundState, PageElement, PageSide } from "../album-elements/model.ts";
import type { AlbumCompositionPlan } from "../album-draft/composition.ts";
import type { CropTriple, DraftFrameRow, DraftSpreadRow, WriteStatus } from "./types.ts";

export type PersistedFrameView = {
  id: string;
  frameId: string;
  role: string;
  position: number;
  aiPhotoId: string;
  userPhotoId: string | null;
  effectivePhotoId: string;
  aiCrop: CropTriple;
  userCrop: { x: number | null; y: number | null; scale: number | null } | null;
  effectiveCrop: CropTriple;
  revision: number;
  clientSeq: number;
};

export type PersistedSpreadView = {
  id: string;
  position: number;
  storySpreadId: string;
  aiLayoutId: string;
  userLayoutId: string | null;
  effectiveLayoutId: string;
  revision: number;
  clientSeq: number;
  frames: PersistedFrameView[];
  preview: AlbumSpreadDraft;
  source: DraftSpreadRow;
  sourceFrames: DraftFrameRow[];
  texts: DraftTextElement[];
  decorations: DraftDecoration[];
  elements: PageElement[];
  backgrounds: Record<PageSide, PageBackgroundState>;
  layoutRanking?: SpreadLayoutRanking | null;
};

export type PersistedDraftView = {
  albumId: string;
  versionId: string;
  status: string;
  revision: number;
  signature: string;
  previewUrls: Record<string, string>;
  compositionPlan?: AlbumCompositionPlan | null;
  spreads: PersistedSpreadView[];
};

export type PersistenceResult = {
  ok: boolean;
  message: string | null;
  writeStatus: WriteStatus | null;
  view: PersistedDraftView | null;
};

export type DraftEditorLoad = PersistenceResult & {
  albumStatus: string | null;
};
