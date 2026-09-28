/** Decorative landing backdrop: aurora, masked grid and grain. */
export default function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="aurora-blob aurora-blob--a" />
      <div className="aurora-blob aurora-blob--b" />
      <div className="aurora-blob aurora-blob--c" />
      <div className="grid-lines" />
      <div className="grain" />
    </div>
  );
}

/** Glowing "planet horizon" arc. Place inside a `relative isolate` wrapper; the arc sits at its top. */
export function Horizon({ offset = '-3.5rem' }: { offset?: string }) {
  return <div className="horizon -z-10" style={{ top: offset }} aria-hidden="true" />;
}
