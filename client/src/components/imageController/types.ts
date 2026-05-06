// ─────────────────────────────────────────────────────────────────────────────
// Shared types for the ImageController and its sub-components.
//
// The controller is intentionally decoupled from the TextToImage page's own
// types. The page maps its `GeneratedImage` to a `ControlledImage` and
// passes pre-built `DetailSection[]` for the data grid, so the controller
// never has to know about the page's enums (Background, ViewAngle, etc.).
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react';

/** The 6 view directions the controller's view grid exposes. */
export type ViewLabel = 'front' | 'three_q' | 'side' | 'back' | 'top' | 'bottom';

/** Stable order used by the view grid. */
export const VIEW_LABELS_ORDERED: readonly ViewLabel[] =
  ['front', 'three_q', 'side', 'back', 'top', 'bottom'] as const;

/** Human-readable label shown under each slot. */
export const VIEW_LABEL_DISPLAY: Record<ViewLabel, string> = {
  front:   'Front',
  three_q: '3/4',
  side:    'Side',
  back:    'Back',
  top:     'Top',
  bottom:  'Bottom',
};

/** Minimal image shape consumed by the header / view grid. */
export interface ControlledImage {
  id: string;
  url: string;
  name: string;
  /** True when the image is a primary (parent) — false when it's an alt view. */
  isPrimary: boolean;
  viewLabel: string;        // e.g. 'front' / 'three_q' / etc — or '' for older rows
  readyFor3D: boolean;
}

/** A single alt view associated with the primary image. */
export interface ControlledAltView {
  id: string;
  url: string;
  viewLabel: ViewLabel;
}

/** A label/value row inside a section of the details grid. */
export interface DetailRow {
  label: string;
  value: ReactNode;
  mono?: boolean;
  wide?: boolean;
}

/** A heading + rows. The grid auto-flows sections onto multiple columns,
 *  unless `fullWidth` is true — then this section spans the entire grid
 *  width on its own row (good for prompts / long composed strings). */
export interface DetailSection {
  heading: string;
  rows: DetailRow[];
  accent?: string;
  fullWidth?: boolean;
}

/** Props for the orchestrator. The page wires these callbacks to its own
 *  state mutations + API calls. */
export interface ImageControllerProps {
  /** When false, the entire controller hides (no selected image). */
  visible: boolean;
  /** The image currently shown in the BigImage stage — drives the header
   *  (name, subtitle, thumb) and the actions toolbar. May be a primary
   *  OR one of its alt views. */
  image: ControlledImage | null;
  /** The primary image of `image`'s group — anchors the view grid's origin
   *  slot. Equals `image` when the user has the original selected. */
  primaryImage: ControlledImage | null;
  /** Alt views attached to `primaryImage` (NOT including the primary itself). */
  altViews: ControlledAltView[];
  /** Set of view labels with an in-flight generation in this group. */
  busyViewLabels: Set<ViewLabel>;
  /** The selected image's user-typed prompt. Rendered next to the view
   *  grid (same row), since it's the most-read piece of metadata. */
  prompt: string;
  /** The full server-composed prompt (with all parameter clauses appended).
   *  Surfaced behind a small ⓘ tooltip next to the Prompt heading — keeps
   *  it inspectable without taking vertical real estate. */
  composedPrompt?: string;
  /** ADMIN-ONLY cost label shown when hovering view-action buttons.
   *  Pass undefined for non-admin users — no tooltip is shown.
   *  Example: '$0.025' or '≈$0.05 / 6 views'. */
  adminCostPerView?: string;
  /** Pre-built sections for the data grid (parent owns the shape). */
  detailSections: DetailSection[];

  // Callbacks ─ the parent owns side-effects, controller stays presentational.
  onChangeName: (next: string) => void;
  onDownload: () => void;
  onToggleReadyFor3D: () => void;
  onGenerateView: (label: ViewLabel) => void;
  onDeleteView: (id: string) => void;
  onSelectView: (id: string) => void;
  /** Regenerate a single alt view: caller deletes + generates again. */
  onRegenerateView: (label: ViewLabel, currentId: string) => void;
}
