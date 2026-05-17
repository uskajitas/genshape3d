import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { useAuth } from '../../context/AuthContext';
import { Tooltip } from '../../components/Tooltip';
import { benchmarkApi, BenchmarkSubject, BenchmarkCategory } from './api';

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

const Btn = styled.button<{ $primary?: boolean; $danger?: boolean }>`
  font: inherit; font-size: 0.82rem; font-weight: 600;
  padding: 0.5rem 1.1rem; border-radius: 8px; cursor: pointer;
  border: 1px solid ${p =>
    p.$danger ? '#ef4444' : p.$primary ? p.theme.colors.violet : p.theme.colors.border};
  background: ${p =>
    p.$danger ? '#ef444422' :
    p.$primary ? `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})` :
    'transparent'};
  color: ${p => p.$danger ? '#ef4444' : p.theme.colors.text};
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
  border-radius: 14px; width: 100%; max-width: 520px;
  padding: 1.75rem; display: flex; flex-direction: column; gap: 1rem;
  box-shadow: 0 24px 64px rgba(0,0,0,0.55);
`;

const ModalTitle = styled.h2`
  margin: 0; font-size: 1.05rem; font-weight: 800; color: ${p => p.theme.colors.text};
`;

const FieldGroup = styled.div`
  display: flex; flex-direction: column; gap: 0.35rem;
`;

const Label = styled.label`
  font-size: 0.75rem; font-weight: 700; color: ${p => p.theme.colors.textMuted};
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
  resize: vertical; min-height: 80px;
  &:focus { outline: none; border-color: ${p => p.theme.colors.violet}; }
`;

const Select = styled.select`
  font: inherit; font-size: 0.85rem;
  padding: 0.5rem 0.75rem; border-radius: 8px;
  border: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surfaceHigh};
  color: ${p => p.theme.colors.text};
  cursor: pointer;
  &:focus { outline: none; border-color: ${p => p.theme.colors.violet}; }
`;

const ModalActions = styled.div`
  display: flex; gap: 0.75rem; justify-content: flex-end; padding-top: 0.5rem;
`;

const ImgPreview = styled.div<{ $url?: string }>`
  width: 100%; aspect-ratio: 16/9; border-radius: 8px; overflow: hidden;
  background: ${p => p.theme.colors.surfaceHigh};
  ${p => p.$url ? `background-image: url(${p.$url}); background-size: contain; background-repeat: no-repeat; background-position: center;` : ''}
  display: flex; align-items: center; justify-content: center;
  font-size: 0.75rem; color: ${p => p.theme.colors.textMuted};
  border: 1px solid ${p => p.theme.colors.border};
`;

const Hint = styled.div`
  font-size: 0.7rem; color: ${p => p.theme.colors.textMuted};
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
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [subs, cats] = await Promise.all([
        benchmarkApi.getSubjects(),
        benchmarkApi.getCategories(),
      ]);
      setSubjects(subs);
      // Flatten tree for filter chips
      const flat: BenchmarkCategory[] = [];
      const flatten = (nodes: BenchmarkCategory[]) => nodes.forEach(n => { flat.push(n); if (n.children) flatten(n.children); });
      flatten(cats);
      setCategories(flat);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditingId(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (s: BenchmarkSubject) => {
    setEditingId(s.id);
    setForm({ name: s.name, categoryId: s.categoryId, generationPrompt: s.generationPrompt, imageUrl: s.imageUrl, notes: s.notes });
    setShowModal(true);
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

  // Flat category list for the select
  const catOptions: BenchmarkCategory[] = [];
  const flattenSelect = (nodes: BenchmarkCategory[], depth = 0) =>
    nodes.forEach(n => { catOptions.push({ ...n, name: '  '.repeat(depth) + n.name }); if (n.children) flattenSelect(n.children, depth + 1); });
  const rootCats = categories.filter(c => !c.parentId);
  // Build nested for select — use a different approach
  const allCats = categories;

  const filtered = filterCat
    ? subjects.filter(s => s.categoryId === filterCat || categories.find(c => c.id === s.categoryId)?.parentId === filterCat)
    : subjects;

  // Top-level categories for filter chips
  const topCats = categories.filter(c => !c.parentId);

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
                <CardCat>
                  {s.parentCategoryName ? `${s.parentCategoryName} › ` : ''}{s.categoryName}
                </CardCat>
                {s.generationPrompt && (
                  <Tooltip text={s.generationPrompt} placement="top" multiline maxWidth={280}>
                    <div style={{ fontSize: '0.7rem', color: '#71717a', cursor: 'default',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.generationPrompt}
                    </div>
                  </Tooltip>
                )}
                <CardMeta>
                  Used in {s.runCount ?? 0} run{s.runCount !== 1 ? 's' : ''}
                </CardMeta>
              </CardBody>
              <CardActions>
                <Tooltip text="Edit subject" placement="top">
                  <IconBtn onClick={() => openEdit(s)}>✏️</IconBtn>
                </Tooltip>
                <Tooltip text="Delete subject" placement="top">
                  <IconBtn onClick={() => handleDelete(s.id, s.name)}>🗑</IconBtn>
                </Tooltip>
              </CardActions>
            </Card>
          ))}
        </Grid>
      )}

      {showModal && (
        <Backdrop onClick={() => setShowModal(false)}>
          <Modal onClick={e => e.stopPropagation()}>
            <ModalTitle>{editingId ? 'Edit subject' : 'New subject'}</ModalTitle>

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
              <Select
                value={form.categoryId}
                onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
              >
                <option value="">— pick a category —</option>
                {allCats.filter(c => !c.parentId).map(parent => (
                  <optgroup key={parent.id} label={parent.name}>
                    {allCats.filter(c => c.parentId === parent.id).map(child => (
                      <option key={child.id} value={child.id}>{child.name}</option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </FieldGroup>

            <FieldGroup>
              <Label>Generation prompt</Label>
              <Textarea
                value={form.generationPrompt}
                onChange={e => setForm(f => ({ ...f, generationPrompt: e.target.value }))}
                placeholder="Prompt used to generate the 2D reference image"
              />
              <Hint>This prompt is stored for reference — you generate and approve the image separately below.</Hint>
            </FieldGroup>

            <FieldGroup>
              <Label>Reference image</Label>
              {form.imageUrl ? (
                <ImgPreview $url={form.imageUrl} />
              ) : (
                <ImgPreview>No image yet</ImgPreview>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <Input
                  value={form.imageUrl}
                  onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                  placeholder="Paste image URL…"
                  style={{ flex: 1 }}
                />
                <Btn type="button" onClick={() => fileRef.current?.click()}>Upload</Btn>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
              </div>
              <Hint>Paste a URL, or upload directly. This image is frozen once saved — same image every run.</Hint>
            </FieldGroup>

            <FieldGroup>
              <Label>Notes</Label>
              <Input
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes about this subject"
              />
            </FieldGroup>

            <ModalActions>
              <Btn onClick={() => setShowModal(false)}>Cancel</Btn>
              <Btn
                $primary
                onClick={handleSave}
                disabled={saving || !form.name.trim() || !form.categoryId}
              >
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create subject'}
              </Btn>
            </ModalActions>
          </Modal>
        </Backdrop>
      )}
    </Page>
  );
};
