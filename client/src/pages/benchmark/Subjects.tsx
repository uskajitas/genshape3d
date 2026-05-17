import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { useAuth } from '../../context/AuthContext';
import { Tooltip } from '../../components/Tooltip';
import { benchmarkApi, BenchmarkSubject, BenchmarkCategory } from './api';

// ─── Generation param types (mirrors TextToImage) ────────────────────────────

type Provider   = 'pollinations' | 'fal-flux-schnell' | 'fal-flux-pro' | 'hf-flux-schnell' | 'openai-dall-e-3';
type Background = 'white' | 'studio' | 'black' | 'iso';
type ViewAngle  = 'front' | 'three_q' | 'side' | 'back' | 'top';
type StyleKind  = 'photoreal' | 'clay' | 'neutral' | 'toon';
type Material   = 'auto' | 'ceramic' | 'metal' | 'wood' | 'plastic' | 'fabric' | 'glass' | 'stone';
type AspectRatio = '1:1' | '4:3' | '3:4' | '16:9';

interface GenParams {
  provider: Provider;
  bg: Background;
  view: ViewAngle;
  style: StyleKind;
  material: Material;
  aspect: AspectRatio;
  negative: string;
  strictSingle: boolean;
}

const DEFAULT_GEN: GenParams = {
  provider: 'fal-flux-schnell',
  bg: 'black',
  view: 'front',
  style: 'clay',
  material: 'auto',
  aspect: '1:1',
  negative: '',
  strictSingle: true,
};

const ASPECT_PIXELS: Record<AspectRatio, { w: number; h: number }> = {
  '1:1':  { w: 1024, h: 1024 },
  '4:3':  { w: 1024, h: 768 },
  '3:4':  { w: 768,  h: 1024 },
  '16:9': { w: 1280, h: 720 },
};

const PROVIDERS: { value: Provider; label: string; hint: string }[] = [
  { value: 'fal-flux-schnell', label: 'fal · Schnell',    hint: '~3s · fast & high quality · ~$0.003' },
  { value: 'fal-flux-pro',     label: 'fal · Pro 1.1',    hint: '~6s · top quality · ~$0.04' },
  { value: 'openai-dall-e-3',  label: 'DALL-E 3',         hint: '~10s · prompt-faithful · ~$0.04' },
  { value: 'pollinations',     label: 'Pollinations',      hint: 'Free · slower when busy' },
  { value: 'hf-flux-schnell',  label: 'HF · Schnell',     hint: 'Unavailable · service down' },
];

const VIEWS:      { value: ViewAngle;  label: string }[] = [
  { value: 'front',   label: 'Front' },
  { value: 'three_q', label: '3/4' },
  { value: 'side',    label: 'Side' },
  { value: 'back',    label: 'Back' },
  { value: 'top',     label: 'Top' },
];

const STYLES:     { value: StyleKind; label: string }[] = [
  { value: 'clay',      label: 'Clay' },
  { value: 'photoreal', label: 'Photoreal' },
  { value: 'neutral',   label: 'Neutral' },
  { value: 'toon',      label: 'Toon 3D' },
];

const BACKGROUNDS: { value: Background; label: string }[] = [
  { value: 'black',  label: 'Black' },
  { value: 'white',  label: 'White' },
  { value: 'studio', label: 'Grey' },
  { value: 'iso',    label: 'Isolated' },
];

const MATERIALS: { value: Material; label: string }[] = [
  { value: 'auto',     label: 'Auto' },
  { value: 'ceramic',  label: 'Ceramic' },
  { value: 'metal',    label: 'Metal' },
  { value: 'wood',     label: 'Wood' },
  { value: 'plastic',  label: 'Plastic' },
  { value: 'fabric',   label: 'Fabric' },
  { value: 'glass',    label: 'Glass' },
  { value: 'stone',    label: 'Stone' },
];

const ASPECTS: { value: AspectRatio; label: string }[] = [
  { value: '1:1',  label: '1:1' },
  { value: '4:3',  label: '4:3' },
  { value: '3:4',  label: '3:4' },
  { value: '16:9', label: '16:9' },
];

// ─── Styled ───────────────────────────────────────────────────────────────────

const Page = styled.div`
  display: flex; flex-direction: column; gap: 1.5rem;
  padding: 2rem; max-width: 1200px; margin: 0 auto;
`;

const TopBar = styled.div`
  display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;
`;

const PageTitle = styled.h1`
  font-size: 1.3rem; font-weight: 800; margin: 0; flex: 1;
  color: ${p => p.theme.colors.text};
`;

const Btn = styled.button<{ $primary?: boolean; $danger?: boolean; $active?: boolean }>`
  font: inherit; font-size: 0.82rem; font-weight: 600;
  padding: 0.5rem 1.1rem; border-radius: 8px; cursor: pointer;
  border: 1px solid ${p =>
    p.$danger ? '#ef4444' : (p.$primary || p.$active) ? p.theme.colors.violet : p.theme.colors.border};
  background: ${p =>
    p.$danger   ? '#ef444422' :
    p.$primary  ? `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})` :
    p.$active   ? `${p.theme.colors.violet}22` :
    'transparent'};
  color: ${p => p.$danger ? '#ef4444' : p.$active ? p.theme.colors.violet : p.theme.colors.text};
  &:hover { opacity: 0.8; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

const FilterBar = styled.div`
  display: flex; gap: 0.5rem; flex-wrap: wrap;
`;

const FilterChip = styled.button<{ $active?: boolean }>`
  font: inherit; font-size: 0.75rem; font-weight: 600;
  padding: 0.3rem 0.75rem; border-radius: 999px; cursor: pointer;
  border: 1px solid ${p => p.$active ? p.theme.colors.violet : p.theme.colors.border};
  background: ${p => p.$active ? `${p.theme.colors.violet}22` : 'transparent'};
  color: ${p => p.$active ? p.theme.colors.violet : p.theme.colors.textMuted};
  &:hover { border-color: ${p => p.theme.colors.violet}; }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
`;

const Card = styled.div`
  background: ${p => p.theme.colors.surface};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 12px; overflow: hidden;
  display: flex; flex-direction: column;
  transition: border-color 0.15s;
  &:hover { border-color: ${p => p.theme.colors.borderHigh}; }
`;

const CardImg = styled.div<{ $url?: string }>`
  width: 100%; aspect-ratio: 1;
  background: ${p => p.theme.colors.surfaceHigh};
  ${p => p.$url ? `background-image: url(${p.$url}); background-size: cover; background-position: center;` : ''}
  display: flex; align-items: center; justify-content: center;
  font-size: 2rem; color: ${p => p.theme.colors.textMuted};
`;

const CardBody = styled.div`
  padding: 0.75rem; display: flex; flex-direction: column; gap: 0.25rem; flex: 1;
`;

const CardName = styled.div`
  font-size: 0.85rem; font-weight: 700; color: ${p => p.theme.colors.text};
`;

const CardCat = styled.div`
  font-size: 0.7rem; color: ${p => p.theme.colors.violet};
`;

const CardMeta = styled.div`
  font-size: 0.68rem; color: ${p => p.theme.colors.textMuted}; margin-top: auto; padding-top: 0.5rem;
`;

const CardActions = styled.div`
  display: flex; gap: 0.5rem; padding: 0.5rem 0.75rem;
  border-top: 1px solid ${p => p.theme.colors.border};
`;

const IconBtn = styled.button`
  background: none; border: none; padding: 0.25rem 0.4rem; cursor: pointer;
  font-size: 0.78rem; color: ${p => p.theme.colors.textMuted};
  border-radius: 5px;
  &:hover { background: ${p => p.theme.colors.surfaceHigh}; color: ${p => p.theme.colors.text}; }
`;

// ─── Modal ────────────────────────────────────────────────────────────────────

const Backdrop = styled.div`
  position: fixed; inset: 0; background: rgba(0,0,0,0.65);
  display: flex; align-items: center; justify-content: center; z-index: 200; padding: 1.5rem;
`;

const Modal = styled.div`
  background: ${p => p.theme.colors.surface};
  border: 1px solid ${p => p.theme.colors.borderHigh};
  border-radius: 14px; width: 100%; max-width: 780px;
  max-height: 90vh; overflow-y: auto;
  display: flex; flex-direction: column; gap: 0;
  box-shadow: 0 24px 64px rgba(0,0,0,0.55);
`;

const ModalHeader = styled.div`
  padding: 1.5rem 1.75rem 1rem;
  border-bottom: 1px solid ${p => p.theme.colors.border};
`;

const ModalTitle = styled.h2`
  margin: 0; font-size: 1.05rem; font-weight: 800; color: ${p => p.theme.colors.text};
`;

const ModalBody = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  flex: 1;
  @media (max-width: 600px) { grid-template-columns: 1fr; }
`;

const ModalCol = styled.div`
  padding: 1.25rem 1.75rem;
  display: flex; flex-direction: column; gap: 1rem;
  &:first-child { border-right: 1px solid ${p => p.theme.colors.border}; }
`;

const ColTitle = styled.div`
  font-size: 0.7rem; font-weight: 700; letter-spacing: 0.07em;
  text-transform: uppercase; color: ${p => p.theme.colors.textMuted};
  margin-bottom: -0.25rem;
`;

const FieldGroup = styled.div`
  display: flex; flex-direction: column; gap: 0.35rem;
`;

const Label = styled.label`
  font-size: 0.72rem; font-weight: 700; color: ${p => p.theme.colors.textMuted};
  text-transform: uppercase; letter-spacing: 0.05em;
`;

const Input = styled.input`
  font: inherit; font-size: 0.85rem;
  padding: 0.5rem 0.75rem; border-radius: 8px;
  border: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surfaceHigh};
  color: ${p => p.theme.colors.text};
  &:focus { outline: none; border-color: ${p => p.theme.colors.violet}; }
`;

const Textarea = styled.textarea`
  font: inherit; font-size: 0.82rem;
  padding: 0.5rem 0.75rem; border-radius: 8px;
  border: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surfaceHigh};
  color: ${p => p.theme.colors.text};
  resize: vertical; min-height: 70px;
  &:focus { outline: none; border-color: ${p => p.theme.colors.violet}; }
`;

const NativeSelect = styled.select`
  font: inherit; font-size: 0.85rem;
  padding: 0.5rem 0.75rem; border-radius: 8px;
  border: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surfaceHigh};
  color: ${p => p.theme.colors.text};
  cursor: pointer;
  &:focus { outline: none; border-color: ${p => p.theme.colors.violet}; }
`;

const ChipRow = styled.div`
  display: flex; gap: 0.35rem; flex-wrap: wrap;
`;

const Chip = styled.button<{ $active?: boolean }>`
  font: inherit; font-size: 0.72rem; font-weight: 600;
  padding: 0.25rem 0.65rem; border-radius: 6px; cursor: pointer;
  border: 1px solid ${p => p.$active ? p.theme.colors.violet : p.theme.colors.border};
  background: ${p => p.$active ? `${p.theme.colors.violet}28` : 'transparent'};
  color: ${p => p.$active ? p.theme.colors.violet : p.theme.colors.textMuted};
  &:hover { border-color: ${p => p.theme.colors.violet}; color: ${p => p.theme.colors.violet}; }
`;

const ImgPreview = styled.div<{ $url?: string }>`
  width: 100%; aspect-ratio: 1; border-radius: 10px; overflow: hidden;
  background: ${p => p.theme.colors.surfaceHigh};
  ${p => p.$url ? `background-image: url(${p.$url}); background-size: contain; background-repeat: no-repeat; background-position: center;` : ''}
  display: flex; align-items: center; justify-content: center;
  font-size: 0.75rem; color: ${p => p.theme.colors.textMuted};
  border: 1px solid ${p => p.theme.colors.border};
  position: relative;
`;

const GenOverlay = styled.div`
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center;
  font-size: 0.85rem; color: white; font-weight: 600; gap: 0.5rem;
`;

const ModalFooter = styled.div`
  padding: 1rem 1.75rem;
  border-top: 1px solid ${p => p.theme.colors.border};
  display: flex; gap: 0.75rem; justify-content: flex-end; align-items: center;
`;

const ErrorMsg = styled.div`
  font-size: 0.75rem; color: #ef4444; flex: 1;
`;

const Hint = styled.div`
  font-size: 0.68rem; color: ${p => p.theme.colors.textMuted};
`;

// ─── Component ────────────────────────────────────────────────────────────────

interface SubjectForm {
  name: string;
  categoryId: string;
  generationPrompt: string;
  imageUrl: string;
  notes: string;
}

const EMPTY_FORM: SubjectForm = { name: '', categoryId: '', generationPrompt: '', imageUrl: '', notes: '' };

export const BenchmarkSubjects: React.FC = () => {
  const { user } = useAuth();
  const email = user?.email || '';

  const [subjects, setSubjects] = useState<BenchmarkSubject[]>([]);
  const [categories, setCategories] = useState<BenchmarkCategory[]>([]);
  const [filterCat, setFilterCat] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SubjectForm>(EMPTY_FORM);
  const [genParams, setGenParams] = useState<GenParams>(DEFAULT_GEN);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [subs, cats] = await Promise.all([benchmarkApi.getSubjects(), benchmarkApi.getCategories()]);
      setSubjects(subs);
      const flat: BenchmarkCategory[] = [];
      const flatten = (nodes: BenchmarkCategory[]) => nodes.forEach(n => { flat.push(n); if (n.children) flatten(n.children); });
      flatten(cats);
      setCategories(flat);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditingId(null); setForm(EMPTY_FORM);
    setGenParams(DEFAULT_GEN); setGenError('');
    setShowModal(true);
  };

  const openEdit = (s: BenchmarkSubject) => {
    setEditingId(s.id);
    setForm({ name: s.name, categoryId: s.categoryId, generationPrompt: s.generationPrompt, imageUrl: s.imageUrl, notes: s.notes });
    setGenParams(DEFAULT_GEN); setGenError('');
    setShowModal(true);
  };

  const setParam = <K extends keyof GenParams>(key: K, val: GenParams[K]) =>
    setGenParams(p => ({ ...p, [key]: val }));

  const handleGenerate = async () => {
    if (!form.generationPrompt.trim()) { setGenError('Enter a prompt first'); return; }
    setGenerating(true); setGenError('');
    try {
      const px = ASPECT_PIXELS[genParams.aspect];
      const qs = new URLSearchParams({
        prompt:        form.generationPrompt.trim(),
        w:             String(px.w),
        h:             String(px.h),
        bg:            genParams.bg,
        view:          genParams.view,
        style:         genParams.style,
        material:      genParams.material,
        provider:      genParams.provider,
        strict_single: genParams.strictSingle ? '1' : '0',
        email,
      });
      if (genParams.negative.trim()) qs.set('negative', genParams.negative.trim());

      const r = await fetch(`/api/text2image?${qs}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      // Server returns the image as a blob; get the R2 key from the header
      // so we can store a permanent URL rather than a blob: URL.
      const imageKeyHdr = r.headers.get('X-Image-Key');
      if (imageKeyHdr) {
        const imageKey = decodeURIComponent(imageKeyHdr);
        setForm(f => ({ ...f, imageUrl: `/api/image?key=${encodeURIComponent(imageKey)}` }));
      } else {
        // Fallback: create a blob URL (won't survive reload)
        const blob = await r.blob();
        setForm(f => ({ ...f, imageUrl: URL.createObjectURL(blob) }));
      }
    } catch (e: any) {
      setGenError(e.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('email', email);
    const r = await fetch('/api/upload-image', { method: 'POST', body: fd });
    if (r.ok) {
      const { url } = await r.json();
      setForm(f => ({ ...f, imageUrl: url }));
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.categoryId) return;
    setSaving(true);
    try {
      if (editingId) {
        await benchmarkApi.updateSubject(email, editingId, form);
      } else {
        await benchmarkApi.createSubject(email, form);
      }
      setShowModal(false);
      await load();
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete subject "${name}"?`)) return;
    await benchmarkApi.deleteSubject(email, id);
    await load();
  };

  const allCats = categories;
  const topCats = categories.filter(c => !c.parentId);
  const filtered = filterCat
    ? subjects.filter(s => s.categoryId === filterCat || categories.find(c => c.id === s.categoryId)?.parentId === filterCat)
    : subjects;

  return (
    <Page>
      <TopBar>
        <PageTitle>Subject Library</PageTitle>
        <Btn $primary onClick={openNew}>+ New subject</Btn>
      </TopBar>

      <FilterBar>
        <FilterChip $active={!filterCat} onClick={() => setFilterCat('')}>All</FilterChip>
        {topCats.map(c => (
          <FilterChip key={c.id} $active={filterCat === c.id} onClick={() => setFilterCat(filterCat === c.id ? '' : c.id)}>
            {c.name}
          </FilterChip>
        ))}
      </FilterBar>

      {loading ? (
        <div style={{ color: '#71717a', fontSize: '0.85rem' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: '#71717a', fontSize: '0.85rem' }}>
          No subjects yet. Create one to build your benchmark image pool.
        </div>
      ) : (
        <Grid>
          {filtered.map(s => (
            <Card key={s.id}>
              <CardImg $url={s.imageUrl || undefined}>
                {!s.imageUrl && '📷'}
              </CardImg>
              <CardBody>
                <CardName>{s.name}</CardName>
                <CardCat>{s.parentCategoryName ? `${s.parentCategoryName} › ` : ''}{s.categoryName}</CardCat>
                {s.generationPrompt && (
                  <Tooltip text={s.generationPrompt} placement="top" multiline maxWidth={280}>
                    <div style={{ fontSize: '0.7rem', color: '#71717a', cursor: 'default',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.generationPrompt}
                    </div>
                  </Tooltip>
                )}
                <CardMeta>Used in {s.runCount ?? 0} run{s.runCount !== 1 ? 's' : ''}</CardMeta>
              </CardBody>
              <CardActions>
                <Tooltip text="Edit subject" placement="top"><IconBtn onClick={() => openEdit(s)}>✏️</IconBtn></Tooltip>
                <Tooltip text="Delete subject" placement="top"><IconBtn onClick={() => handleDelete(s.id, s.name)}>🗑</IconBtn></Tooltip>
              </CardActions>
            </Card>
          ))}
        </Grid>
      )}

      {showModal && (
        <Backdrop onClick={() => setShowModal(false)}>
          <Modal onClick={e => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>{editingId ? 'Edit subject' : 'New subject'}</ModalTitle>
            </ModalHeader>

            <ModalBody>
              {/* ── Left col: subject info ── */}
              <ModalCol>
                <ColTitle>Subject</ColTitle>

                <FieldGroup>
                  <Label>Name</Label>
                  <Input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Medieval sword"
                    autoFocus
                  />
                </FieldGroup>

                <FieldGroup>
                  <Label>Category</Label>
                  <NativeSelect value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}>
                    <option value="">— pick a category —</option>
                    {allCats.filter(c => !c.parentId).map(parent => (
                      <optgroup key={parent.id} label={parent.name}>
                        {allCats.filter(c => c.parentId === parent.id).map(child => (
                          <option key={child.id} value={child.id}>{child.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </NativeSelect>
                </FieldGroup>

                <FieldGroup>
                  <Label>Prompt</Label>
                  <Textarea
                    value={form.generationPrompt}
                    onChange={e => setForm(f => ({ ...f, generationPrompt: e.target.value }))}
                    placeholder="Describe the subject for image generation…"
                  />
                </FieldGroup>

                <FieldGroup>
                  <Label>Notes</Label>
                  <Input
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Optional notes"
                  />
                </FieldGroup>
              </ModalCol>

              {/* ── Right col: image generation ── */}
              <ModalCol>
                <ColTitle>Reference image</ColTitle>

                <ImgPreview $url={form.imageUrl || undefined}>
                  {!form.imageUrl && 'No image yet'}
                  {generating && <GenOverlay>⏳ Generating…</GenOverlay>}
                </ImgPreview>

                <FieldGroup>
                  <Label>Model</Label>
                  <NativeSelect value={genParams.provider} onChange={e => setParam('provider', e.target.value as Provider)}>
                    {PROVIDERS.map(p => (
                      <option key={p.value} value={p.value}>{p.label} — {p.hint}</option>
                    ))}
                  </NativeSelect>
                </FieldGroup>

                <FieldGroup>
                  <Label>Style</Label>
                  <ChipRow>
                    {STYLES.map(s => (
                      <Chip key={s.value} $active={genParams.style === s.value} onClick={() => setParam('style', s.value)}>
                        {s.label}
                      </Chip>
                    ))}
                  </ChipRow>
                </FieldGroup>

                <FieldGroup>
                  <Label>Background</Label>
                  <ChipRow>
                    {BACKGROUNDS.map(b => (
                      <Chip key={b.value} $active={genParams.bg === b.value} onClick={() => setParam('bg', b.value)}>
                        {b.label}
                      </Chip>
                    ))}
                  </ChipRow>
                </FieldGroup>

                <FieldGroup>
                  <Label>View</Label>
                  <ChipRow>
                    {VIEWS.map(v => (
                      <Chip key={v.value} $active={genParams.view === v.value} onClick={() => setParam('view', v.value)}>
                        {v.label}
                      </Chip>
                    ))}
                  </ChipRow>
                </FieldGroup>

                <FieldGroup>
                  <Label>Material</Label>
                  <ChipRow>
                    {MATERIALS.map(m => (
                      <Chip key={m.value} $active={genParams.material === m.value} onClick={() => setParam('material', m.value)}>
                        {m.label}
                      </Chip>
                    ))}
                  </ChipRow>
                </FieldGroup>

                <FieldGroup>
                  <Label>Aspect</Label>
                  <ChipRow>
                    {ASPECTS.map(a => (
                      <Chip key={a.value} $active={genParams.aspect === a.value} onClick={() => setParam('aspect', a.value)}>
                        {a.label}
                      </Chip>
                    ))}
                  </ChipRow>
                </FieldGroup>

                <FieldGroup>
                  <Label>Negative prompt</Label>
                  <Input
                    value={genParams.negative}
                    onChange={e => setParam('negative', e.target.value)}
                    placeholder="What to avoid…"
                  />
                </FieldGroup>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Btn
                    $primary
                    onClick={handleGenerate}
                    disabled={generating || !form.generationPrompt.trim()}
                    style={{ flex: 1 }}
                  >
                    {generating ? '⏳ Generating…' : form.imageUrl ? '↺ Regenerate' : '✦ Generate image'}
                  </Btn>
                  <Btn onClick={() => fileRef.current?.click()}>Upload</Btn>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
                </div>
                {form.imageUrl && (
                  <Hint>Image locked in — will be reused exactly as-is in every benchmark run.</Hint>
                )}
                {genError && <ErrorMsg>{genError}</ErrorMsg>}
              </ModalCol>
            </ModalBody>

            <ModalFooter>
              <ErrorMsg />
              <Btn onClick={() => setShowModal(false)}>Cancel</Btn>
              <Btn
                $primary
                onClick={handleSave}
                disabled={saving || !form.name.trim() || !form.categoryId}
              >
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create subject'}
              </Btn>
            </ModalFooter>
          </Modal>
        </Backdrop>
      )}
    </Page>
  );
};
