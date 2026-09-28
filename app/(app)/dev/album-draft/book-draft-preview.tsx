"use client";

import { SmartCropPreview } from "@/app/(app)/dev/smart-crop/smart-crop-preview";
import type { AlbumSpreadDraft } from "@/lib/album-draft/types";

const BLANK_SPREAD = "/album/06_3_album_preview_blank_spread_taller.png";

export function BookDraftPreview({
  draft,
  onPhotoClick,
}: {
  draft: AlbumSpreadDraft;
  onPhotoClick?: (photoId: string) => void;
}) {
  return (
    <div
      className="relative mx-auto w-full max-w-[420px] overflow-hidden"
      style={{ aspectRatio: "1076 / 1264" }}
      data-testid="book-draft-preview"
      data-layout={draft.layoutId}
    >
      <img src={BLANK_SPREAD} alt="" className="absolute inset-0 h-full w-full" />
      {draft.assignments.map((assignment) => {
        const { norm } = assignment.placement;
        return (
          <div
            key={assignment.frameId}
            className={`absolute overflow-hidden ${onPhotoClick ? "cursor-pointer" : ""}`}
            data-photo-id={assignment.photoId}
            data-frame-id={assignment.frameId}
            data-side={assignment.placement.side}
            role={onPhotoClick ? "button" : undefined}
            tabIndex={onPhotoClick ? 0 : undefined}
            onClick={onPhotoClick ? () => onPhotoClick(assignment.photoId) : undefined}
            style={{
              left: `${norm.x * 100}%`,
              top: `${norm.y * 100}%`,
              width: `${norm.w * 100}%`,
              height: `${norm.h * 100}%`,
            }}
          >
            {assignment.previewUrl ? (
              <SmartCropPreview
                src={assignment.previewUrl}
                frame={assignment.cropFrame}
                transform={assignment.crop}
                fill
                photoId={assignment.photoId}
                showErrorDetails
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[#2a2420] text-[10px] text-white">
                missing preview
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
