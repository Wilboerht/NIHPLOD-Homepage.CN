"use client";

interface Section {
  id: string;
  title: string;
}

interface TableOfContentsProps {
  sections: Section[];
  label?: string;
}

export default function TableOfContents({
  sections,
  label = "跳转到章节...",
}: TableOfContentsProps) {
  return (
    <select
      onChange={(e) => {
        const el = document.getElementById(e.target.value);
        if (el) el.scrollIntoView({ behavior: "smooth" });
      }}
      className="w-full cursor-pointer appearance-none rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#00263E]"
      defaultValue=""
      aria-label={label}
    >
      <option value="" disabled>
        {label}
      </option>
      {sections.map((section) => (
        <option key={section.id} value={section.id}>
          {section.title}
        </option>
      ))}
    </select>
  );
}
