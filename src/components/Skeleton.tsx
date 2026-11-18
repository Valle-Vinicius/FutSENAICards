export default function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-[var(--border)] rounded-xl ${className}`} />;
}
