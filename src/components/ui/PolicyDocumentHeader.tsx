import { Calendar } from "lucide-react";

interface PolicyDocumentHeaderProps {
  title: string;
  lastUpdated: string;
  description?: string;
}

function toDateTime(value: string): string | undefined {
  const match = value.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!match) return value;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

export function PolicyDocumentHeader({
  title,
  lastUpdated,
  description,
}: PolicyDocumentHeaderProps) {
  return (
    <header className="space-y-4 border-b border-brand-beige pb-6">
      <h1 className="text-3xl font-normal leading-tight tracking-[-0.01em] text-brand-charcoal sm:text-4xl">
        {title}
      </h1>
      {description && <p className="text-[15px] leading-7 text-brand-charcoal/70">{description}</p>}
      <div className="flex items-center gap-1.5 text-sm text-brand-charcoal/70">
        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
        <span>最近更新：</span>
        <time dateTime={toDateTime(lastUpdated)}>{lastUpdated}</time>
      </div>
    </header>
  );
}
