/** Persisted analysis kinds. Deterministic layout suitability is embedded in subject geometry. */

export const PHOTO_INTELLIGENCE_SEMANTIC = "photo_intelligence_semantic";
export const SUBJECT_GEOMETRY = "subject_geometry";

/** Bump when the Smart Crop vision prompt, schema, or meaning changes. */
export const SUBJECT_GEOMETRY_VERSION = "subject-geometry-v1";

export type AnalysisType = typeof PHOTO_INTELLIGENCE_SEMANTIC | typeof SUBJECT_GEOMETRY;

export type ResultStatus = "success" | "fallback" | "failed";

export type CacheSource = "memory" | "db" | "ai";
