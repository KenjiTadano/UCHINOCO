import {
  COVER_COLORS,
  COVER_TEMPLATES,
  type CoverColorId,
  type CoverTemplateId,
} from "../album-cover-templates.ts";

export type CoverField = "photo" | "title" | "subtitle" | "template" | "color";

export type DraftCoverRow = {
  id: string;
  draftVersionId: string;
  coverType: "front";
  aiPhotoId: string | null;
  userPhotoId: string | null;
  aiTitle: string;
  userTitle: string | null;
  aiSubtitle: string;
  userSubtitle: string | null;
  aiTemplateId: CoverTemplateId;
  userTemplateId: CoverTemplateId | null;
  aiColorId: CoverColorId;
  userColorId: CoverColorId | null;
  revision: number;
  clientSeq: number;
};

export type EffectiveCover = {
  photoId: string | null;
  title: string;
  subtitle: string;
  templateId: CoverTemplateId;
  colorId: CoverColorId;
  photoOverridden: boolean;
  titleOverridden: boolean;
  subtitleOverridden: boolean;
  templateOverridden: boolean;
  colorOverridden: boolean;
};

export type CoverEditorModel = EffectiveCover & {
  id: string;
  draftVersionId: string;
  revision: number;
  clientSeq: number;
  previewUrl: string;
  previewUrls: Record<string, string>;
  source: DraftCoverRow;
};

const TEMPLATE_IDS = new Set(COVER_TEMPLATES.map((item) => item.id));
const COLOR_IDS = new Set(COVER_COLORS.map((item) => item.id));

export function isCoverTemplateId(value: string | null | undefined): value is CoverTemplateId {
  return Boolean(value && TEMPLATE_IDS.has(value as CoverTemplateId));
}

export function isCoverColorId(value: string | null | undefined): value is CoverColorId {
  return Boolean(value && COLOR_IDS.has(value as CoverColorId));
}

export function mapDraftCoverRow(row: Record<string, unknown>): DraftCoverRow {
  const template = String(row.ai_template_id ?? "simple");
  const color = String(row.ai_color_id ?? "white");
  const userTemplate = row.user_template_id == null ? null : String(row.user_template_id);
  const userColor = row.user_color_id == null ? null : String(row.user_color_id);
  return {
    id: String(row.id),
    draftVersionId: String(row.draft_version_id),
    coverType: "front",
    aiPhotoId: row.ai_photo_id == null ? null : String(row.ai_photo_id),
    userPhotoId: row.user_photo_id == null ? null : String(row.user_photo_id),
    aiTitle: String(row.ai_title ?? ""),
    userTitle: row.user_title == null ? null : String(row.user_title),
    aiSubtitle: String(row.ai_subtitle ?? ""),
    userSubtitle: row.user_subtitle == null ? null : String(row.user_subtitle),
    aiTemplateId: isCoverTemplateId(template) ? template : "simple",
    userTemplateId: isCoverTemplateId(userTemplate) ? userTemplate : null,
    aiColorId: isCoverColorId(color) ? color : "white",
    userColorId: isCoverColorId(userColor) ? userColor : null,
    revision: Number(row.revision) || 1,
    clientSeq: Number(row.client_seq) || 0,
  };
}

/** User value wins per field. Components should not repeat this fallback. */
export function resolveEffectiveCover(row: DraftCoverRow): EffectiveCover {
  const photoOverridden = row.userPhotoId != null && row.userPhotoId !== "";
  const titleOverridden = row.userTitle != null;
  const subtitleOverridden = row.userSubtitle != null;
  const templateOverridden = isCoverTemplateId(row.userTemplateId);
  const colorOverridden = isCoverColorId(row.userColorId);
  return {
    photoId: photoOverridden ? row.userPhotoId : row.aiPhotoId,
    title: titleOverridden ? row.userTitle! : row.aiTitle,
    subtitle: subtitleOverridden ? row.userSubtitle! : row.aiSubtitle,
    templateId: templateOverridden ? row.userTemplateId! : row.aiTemplateId,
    colorId: colorOverridden ? row.userColorId! : row.aiColorId,
    photoOverridden,
    titleOverridden,
    subtitleOverridden,
    templateOverridden,
    colorOverridden,
  };
}

export function toCoverEditor(row: DraftCoverRow, previewUrls: Record<string, string>): CoverEditorModel {
  const effective = resolveEffectiveCover(row);
  return {
    ...effective,
    id: row.id,
    draftVersionId: row.draftVersionId,
    revision: row.revision,
    clientSeq: row.clientSeq,
    previewUrl: effective.photoId ? previewUrls[effective.photoId] ?? "" : "",
    previewUrls,
    source: row,
  };
}

function withRow(model: CoverEditorModel, source: DraftCoverRow, previewUrls = model.previewUrls): CoverEditorModel {
  return toCoverEditor(source, previewUrls);
}

export function applyCoverPhoto(
  model: CoverEditorModel,
  photoId: string | null,
  clientSeq: number,
  previewUrl?: string,
): CoverEditorModel {
  const previewUrls =
    photoId && previewUrl ? { ...model.previewUrls, [photoId]: previewUrl } : model.previewUrls;
  return withRow(
    model,
    { ...model.source, userPhotoId: photoId, clientSeq },
    previewUrls,
  );
}

export function applyCoverTitle(model: CoverEditorModel, title: string | null, clientSeq: number): CoverEditorModel {
  return withRow(model, { ...model.source, userTitle: title, clientSeq });
}

export function applyCoverSubtitle(
  model: CoverEditorModel,
  subtitle: string | null,
  clientSeq: number,
): CoverEditorModel {
  return withRow(model, { ...model.source, userSubtitle: subtitle, clientSeq });
}

export function applyCoverTemplate(
  model: CoverEditorModel,
  templateId: CoverTemplateId | null,
  clientSeq: number,
): CoverEditorModel {
  return withRow(model, { ...model.source, userTemplateId: templateId, clientSeq });
}

export function applyCoverColor(
  model: CoverEditorModel,
  colorId: CoverColorId | null,
  clientSeq: number,
): CoverEditorModel {
  return withRow(model, { ...model.source, userColorId: colorId, clientSeq });
}

/** A slower cover save must not replace a newer local edit. */
export function mergeServerCover(local: CoverEditorModel, server: CoverEditorModel, sentSeq: number): CoverEditorModel {
  if (local.clientSeq > sentSeq) return local;
  return server;
}
