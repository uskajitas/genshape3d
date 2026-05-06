// ─────────────────────────────────────────────────────────────────────────────
// ImageViewGrid — the 6-slot row of view directions.
//
// Layout:
//   [Front] [3/4] [Side] [Back] [Top] [Bottom]
//
// One slot is rendered as the "primary source" — the original image's view —
// styled with a violet border and an `orig` badge. The other slots are
// either filled (alt views generated already) or empty (`+` button).
//
// The primary slot is always interactive enough to swap the viewer back to
// it (just like any other thumbnail), but it can never be deleted from
// here — it's the parent image; if the user wants it gone, they delete the
// gallery card itself in the right rail.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import styled from 'styled-components';
import { ImageViewSlot } from './ImageViewSlot';
import { SectionHeader } from './SectionHeader';
import {
  VIEW_LABELS_ORDERED,
  type ControlledAltView,
  type ViewLabel,
} from './types';

interface Props {
  /** All alt views attached to the *primary* (the parent image). */
  altViews: ControlledAltView[];
  /** Set of view labels with an in-flight generation. */
  busyViewLabels: Set<ViewLabel>;
  /** ID of the primary image — used to fill the original's slot. */
  primaryImageId: string;
  /** Url of the primary image — used to render the original's slot thumb. */
  primaryImageUrl: string;
  /** ViewLabel of the primary (the angle the user originally generated). */
  primaryViewLabel: ViewLabel;

  onGenerateView: (label: ViewLabel) => void;
  onSelectView: (id: string) => void;
  onDeleteView: (id: string) => void;
  /** Regenerate a single alt view: caller deletes + generates again. */
  onRegenerateView: (label: ViewLabel, currentId: string) => void;
  /** Admin-only cost label forwarded to each slot's + / ↻ tooltip. */
  adminCost?: string;
}

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const Slots = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
`;

export const ImageViewGrid: React.FC<Props> = ({
  altViews,
  busyViewLabels,
  primaryImageId,
  primaryImageUrl,
  primaryViewLabel,
  onGenerateView,
  onSelectView,
  onDeleteView,
  onRegenerateView,
  adminCost,
}) => {
  // Build a quick label → alt-view lookup for the slot grid.
  const altByLabel = new Map<ViewLabel, ControlledAltView>();
  for (const v of altViews) altByLabel.set(v.viewLabel, v);

  return (
    <Section>
      <SectionHeader text={`Views — ${altViews.length + 1}/6`} />
      <Slots>
        {VIEW_LABELS_ORDERED.map(label => {
          const isPrimarySlot = label === primaryViewLabel;
          const filled = isPrimarySlot
            ? { id: primaryImageId, url: primaryImageUrl }
            : altByLabel.get(label);
          const busy = busyViewLabels.has(label);
          return (
            <ImageViewSlot
              key={label}
              label={label}
              filled={filled}
              busy={busy}
              isPrimarySource={isPrimarySlot}
              onGenerate={onGenerateView}
              onSelect={onSelectView}
              onDelete={onDeleteView}
              onRegenerate={onRegenerateView}
              adminCost={adminCost}
            />
          );
        })}
      </Slots>
    </Section>
  );
};
