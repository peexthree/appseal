/**
 * Fixed decorative backdrop for inner pages: aurora blobs + noise grain +
 * dot matrix. Purely presentational, mirrors the landing ambient layer so
 * every page shares the same depth instead of a flat #090d16 fill.
 */
export function Ambient() {
  return (
    <div className="appseal-ambient" aria-hidden>
      <div className="appseal-aurora">
        <span className="appseal-aurora-a" />
        <span className="appseal-aurora-b" />
        <span className="appseal-aurora-c" />
      </div>
      <div className="appseal-dots" />
      <div className="appseal-noise" />
    </div>
  );
}
