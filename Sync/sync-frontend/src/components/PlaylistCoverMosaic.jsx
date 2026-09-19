export default function PlaylistCoverMosaic({ tracks = [], size = '100%' }) {
  const arts = [...new Map(
    tracks.filter(t => t?.albumArt).map(t => [t.albumArt, t.albumArt])
  ).values()].slice(0, 4);

  if (arts.length === 0) return null;
  if (arts.length === 1) {
    return (
      <img src={arts[0]} alt=""
        style={{ width: size, height: size, objectFit: 'cover', display: 'block' }} />
    );
  }

  const cells = [...arts];
  while (cells.length < 4) cells.push(null);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gridTemplateRows: '1fr 1fr',
      width: size, height: size,
      overflow: 'hidden',
    }}>
      {cells.map((src, i) => (
        <div key={i} style={{ background: 'var(--bg-card)', overflow: 'hidden' }}>
          {src && <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
        </div>
      ))}
    </div>
  );
}
