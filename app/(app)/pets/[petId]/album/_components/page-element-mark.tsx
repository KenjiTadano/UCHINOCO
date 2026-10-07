import { Bookmark, Bone, CakeSlice, Crown, Fish, Flower2, Heart, Leaf, MapPin, MessageCircle, Minus, Paperclip, PawPrint, Snowflake, Sparkles, Square, Star, Sun, type LucideIcon } from "lucide-react";
import type { ElementDecorationId, StampId } from "@/lib/album-elements/model";

const STAMPS: Record<StampId, LucideIcon> = {
  paw: PawPrint,
  heart: Heart,
  star: Star,
  sparkle: Sparkles,
  bone: Bone,
  fish: Fish,
  crown: Crown,
  birthday: CakeSlice,
  "first-time": Star,
  outing: MapPin,
  spring: Flower2,
  summer: Sun,
  autumn: Leaf,
  winter: Snowflake,
};

const DECORATIONS: Record<ElementDecorationId, LucideIcon> = {
  line: Minus,
  tape: Paperclip,
  corner: Square,
  bubble: MessageCircle,
  ribbon: Bookmark,
};

export function PageElementMark({ type, markId, color }: { type: "stamp" | "decoration"; markId: StampId | ElementDecorationId; color: string }) {
  const Icon = type === "stamp" ? STAMPS[markId as StampId] : DECORATIONS[markId as ElementDecorationId];
  return <Icon className="page-edit-element-mark" color={color} strokeWidth={1.8} aria-hidden="true" />;
}
