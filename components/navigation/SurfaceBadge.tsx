import React from 'react';

type SurfaceBadgeProps = {
  label: string;
  detail?: string;
};

export function SurfaceBadge({ label, detail }: SurfaceBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-mono font-medium tracking-wider uppercase bg-[#b89bd312] text-[#d5beed] border border-[#b89bd326]"
      title={detail}
      aria-label={label}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-[#c6b1ef] shadow-[0_0_8px_#c6b1ef]" aria-hidden="true" />
      {label}
    </span>
  );
}
