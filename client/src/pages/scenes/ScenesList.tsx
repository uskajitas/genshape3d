import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { confirm } from '../../components/ConfirmModal';
import { scenesApi, Scene } from './api';

// Dev-only auth bypass (matches SceneEditor) — inert in production builds.
const DEV_EMAIL: string | undefined = import.meta.env.DEV
  ? (import.meta.env.VITE_DEV_EMAIL as string | undefined)
  : undefined;

const Shell = styled.div`
  min-height: 100vh;
  background: ${p => p.theme.colors.background};
`;

const Nav = styled.nav`
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0 1.5rem;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surface};
`;

const Logo = styled(Link)`
  font-size: 0.88rem; font-weight: 800;
  color: ${p => p.theme.colors.text};
  text-decoration: none; padding: 0.9rem 0;
  span { color: ${p => p.theme.colors.violet}; }
`;

const Crumb = styled.div`
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.82rem; font-weight: 600;
`;

const Page = styled.div`
  padding: 2rem; max-width: 1040px; margin: 0 auto;
  display: flex; flex-direction: column; gap: 1.5rem;
`;

const TopBar = styled.div`
  display: flex; align-items: center; gap: 1rem;
`;

const PageTitle = styled.h1`
  font-size: 1.3rem; font-weight: 800; margin: 0; flex: 1;
  color: ${p => p.theme.colors.text};
`;

const Btn = styled.button`
  font: inherit; font-size: 0.82rem; font-weight: 600;
  padding: 0.55rem 1.15rem; border-radius: 8px; cursor: pointer;
  border: 1px solid ${p => p.theme.colors.violet};
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  color: white;
  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const Empty = styled.div`
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.85rem;
  padding: 2rem 0;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
`;

const Card = styled.div`
  display: flex; flex-direction: column;
  border-radius: 12px; overflow: hidden;
  border: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surface};
  transition: border-color 0.15s;
  &:hover { border-color: ${p => p.theme.colors.borderHigh}; }
`;

const CardThumb = styled(Link)<{ $url?: string }>`
  display: block;
  width: 100%; aspect-ratio: 16 / 10;
  background: ${p => p.theme.colors.surfaceHigh};
  ${p => p.$url ? `background-image: url(${p.$url}); background-size: cover; background-position: center;` : ''}
  display: flex; align-items: center; justify-content: center;
  font-size: 1.8rem; color: ${p => p.theme.colors.textMuted};
`;

const CardBody = styled.div`
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.7rem 0.85rem;
`;

const CardName = styled(Link)`
  flex: 1; min-width: 0;
  font-size: 0.86rem; font-weight: 700; color: ${p => p.theme.colors.text};
  text-decoration: none;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  &:hover { color: ${p => p.theme.colors.violet}; }
`;

const CardMeta = styled.div`
  font-size: 0.68rem; color: ${p => p.theme.colors.textMuted};
  padding: 0 0.85rem 0.7rem;
`;

const DeleteBtn = styled.button`
  appearance: none; border: 0; background: transparent; cursor: pointer;
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.9rem; line-height: 1; padding: 0.2rem;
  &:hover { color: ${p => p.theme.colors.violet}; }
`;

export const ScenesList: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const email = user?.email || DEV_EMAIL || '';

  useEffect(() => {
    if (!email) return;
    scenesApi.list(email).then(r => setScenes(r.scenes)).finally(() => setLoading(false));
  }, [email]);

  if (!isAuthenticated && !DEV_EMAIL) return <Navigate to="/login" replace />;

  const createScene = async () => {
    if (!email || creating) return;
    setCreating(true);
    try {
      const { scene } = await scenesApi.create(email, `Scene ${scenes.length + 1}`);
      navigate(`/scenes/${scene.id}`);
    } catch (e: any) {
      alert(`Couldn't create scene: ${e.message}`);
    } finally {
      setCreating(false);
    }
  };

  const removeScene = async (scene: Scene) => {
    if (!email) return;
    const ok = await confirm({
      title: 'Delete scene?',
      message: `"${scene.name}" will be removed. The 3D assets inside it are not affected.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    await scenesApi.remove(scene.id, email);
    setScenes(prev => prev.filter(s => s.id !== scene.id));
  };

  return (
    <Shell>
      <Nav>
        <Logo to="/dashboard">Gen<span>Shape</span>3D</Logo>
        <Crumb>/ Scenes</Crumb>
      </Nav>
      <Page>
        <TopBar>
          <PageTitle>Scenes</PageTitle>
          <Btn onClick={createScene} disabled={creating}>{creating ? 'Creating…' : '+ New scene'}</Btn>
        </TopBar>

        {loading ? (
          <Empty>Loading…</Empty>
        ) : scenes.length === 0 ? (
          <Empty>
            No scenes yet. A scene lets you place several of your generated 3D
            assets together, light them, frame a camera, and export a
            presentation-ready image. Start with "New scene".
          </Empty>
        ) : (
          <Grid>
            {scenes.map(scene => (
              <Card key={scene.id}>
                <CardThumb to={`/scenes/${scene.id}`} $url={scene.thumbnailUrl || undefined}>
                  {!scene.thumbnailUrl && '🎬'}
                </CardThumb>
                <CardBody>
                  <CardName to={`/scenes/${scene.id}`}>{scene.name}</CardName>
                  <DeleteBtn title="Delete scene" onClick={() => removeScene(scene)}>✕</DeleteBtn>
                </CardBody>
                <CardMeta>
                  {(scene.sceneData as any)?.nodes?.length ?? 0} object{((scene.sceneData as any)?.nodes?.length ?? 0) === 1 ? '' : 's'}
                  {' · '}updated {new Date(scene.updatedAt).toLocaleDateString()}
                </CardMeta>
              </Card>
            ))}
          </Grid>
        )}
      </Page>
    </Shell>
  );
};

export default ScenesList;
