import type { NodeProps, Node } from "@xyflow/react";

export type PreviewNodeData = { src: string };

// Panel preview di tengah kanvas. Muncul hanya kalau VITE_PREVIEW_URL diisi.
export function PreviewNode({ data }: NodeProps<Node<PreviewNodeData>>) {
  const isVideo = /\.(mp4|webm|mov)$/i.test(data.src);
  return (
    <figure className="w-[360px] border border-signal/30 bg-panel p-1">
      {isVideo
        ? <video src={data.src} className="block w-full" autoPlay muted loop playsInline />
        : <img src={data.src} alt="Preview" className="block w-full" />}
      <figcaption className="px-2 py-1 text-[10px] uppercase tracking-widest text-dim">preview</figcaption>
    </figure>
  );
}
