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
      className="w-full p-3 rounded-xl border border-zinc-200 bg-white text-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#00263E] appearance-none cursor-pointer"
      defaultValue=""
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
