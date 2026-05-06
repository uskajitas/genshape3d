// Public surface of the imageController module. Pages should import from
// here, not from individual files, so we can move things around internally
// without breaking call sites.

export { ImageController } from './ImageController';
export { ImageToolsRail } from './ImageToolsRail';
export type { ImageTool } from './ImageToolsRail';
export { BgRemovalDialog } from './BgRemovalDialog';
export type { BgRemovalParams } from './BgRemovalDialog';
export type {
  ImageControllerProps,
  ControlledImage,
  ControlledAltView,
  DetailSection,
  DetailRow,
  ViewLabel,
} from './types';
export { VIEW_LABELS_ORDERED, VIEW_LABEL_DISPLAY } from './types';
