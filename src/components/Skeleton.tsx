export default function Skeleton({ className = '', animated = true }: { className?: string; animated?: boolean }) {
  return <div style={animated ? undefined : { animation: 'none' }} className={`animate-pulse bg-[var(--border)] rounded-xl ${className}`} />;
}
