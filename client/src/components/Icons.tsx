// ─────────────────────────────────────────────────────────────────────────────
// Icons — small inline SVG library.
//
// Inline SVGs (rather than emoji or webfont icons) so:
//   - they stay crisp at any size
//   - colour comes from `currentColor`, picking up the theme automatically
//   - no dependency / network round-trip
//
// Stroke-based, 1px line, designed to read well at 12-20px.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
}

const baseProps = (size: number | string = 16): React.SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

export const IconClose: React.FC<IconProps> = ({ size = 16, ...rest }) => (
  <svg {...baseProps(size)} strokeWidth={2.4} {...rest}>
    <path d="M6 6 L18 18" />
    <path d="M18 6 L6 18" />
  </svg>
);

// Trash: deliberately laid out to be OPTICALLY centered.
// Geometric content runs y∈[5, 19] (14 tall) and x∈[4, 20] (16 wide), so
// its math-center is (12, 12) — matching the viewBox center exactly.
// The body is also shortened relative to typical trash glyphs so its dense
// bottom doesn't outweigh the thin lid+handle and pull the eye downward.
export const IconTrash: React.FC<IconProps> = ({ size = 16, ...rest }) => (
  <svg {...baseProps(size)} strokeWidth={1.9} {...rest}>
    {/* Lid */}
    <path d="M4 8 H20" />
    {/* Handle */}
    <path d="M10 8 V6.5 a1 1 0 0 1 1 -1 H13 a1 1 0 0 1 1 1 V8" />
    {/* Body */}
    <path d="M6.5 8 V17.5 a1.5 1.5 0 0 0 1.5 1.5 H16 a1.5 1.5 0 0 0 1.5 -1.5 V8" />
    {/* Slats */}
    <path d="M10.5 11.5 V15.5" />
    <path d="M13.5 11.5 V15.5" />
  </svg>
);

export const IconAlertTriangle: React.FC<IconProps> = ({ size = 16, ...rest }) => (
  <svg {...baseProps(size)} {...rest}>
    <path d="M12 3 L22 20 H2 Z" />
    <path d="M12 10 V14" />
    <circle cx="12" cy="17.4" r="0.6" fill="currentColor" stroke="none" />
  </svg>
);

// Wand — generic "tools / edit" affordance. Used by the right-side
// tools rail and the bg-removal entry button.
export const IconWand: React.FC<IconProps> = ({ size = 16, ...rest }) => (
  <svg {...baseProps(size)} strokeWidth={2} {...rest}>
    <path d="M14 4l6 6L8 22l-6-6z" />
    <path d="M14 4l3-3 3 3-3 3" />
    <path d="M2.5 17.5l3 3" />
  </svg>
);

// "Subject cutout" icon — silhouette in a frame. Used as the entry point
// for the background-removal tool.
export const IconCutout: React.FC<IconProps> = ({ size = 16, ...rest }) => (
  <svg {...baseProps(size)} strokeWidth={1.9} {...rest}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="12" cy="9" r="3" />
    <path d="M5 21c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
  </svg>
);

// Three stacked frames — used for the "make alt views" action. Reads as
// "multiple views" without being domain-specific.
export const IconViews: React.FC<IconProps> = ({ size = 16, ...rest }) => (
  <svg {...baseProps(size)} strokeWidth={1.9} {...rest}>
    <rect x="3"  y="6"  width="14" height="12" rx="2" />
    <rect x="6"  y="3"  width="14" height="12" rx="2" />
    <rect x="9"  y="9"  width="12" height="9"  rx="2" />
  </svg>
);

// Circular refresh / regenerate arrow.
export const IconRefresh: React.FC<IconProps> = ({ size = 16, ...rest }) => (
  <svg {...baseProps(size)} strokeWidth={2} {...rest}>
    <path d="M3 12 a9 9 0 0 1 15.5 -6.3 L21 8" />
    <path d="M21 3 V8 H16" />
    <path d="M21 12 a9 9 0 0 1 -15.5 6.3 L3 16" />
    <path d="M3 21 V16 H8" />
  </svg>
);

export const IconInfo: React.FC<IconProps> = ({ size = 16, ...rest }) => (
  <svg {...baseProps(size)} {...rest}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11 V16" />
    <circle cx="12" cy="7.6" r="0.6" fill="currentColor" stroke="none" />
  </svg>
);
