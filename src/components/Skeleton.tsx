export default function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-[#E9EAF0] rounded-xl ${className}`} />;
}
