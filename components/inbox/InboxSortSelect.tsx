import { INBOX_SORT_OPTIONS, type InboxSort } from "@/lib/inbox-sort";

export function InboxSortSelect({
  value,
  onChange,
}: {
  value: InboxSort;
  onChange: (value: InboxSort) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      Sort by
      <select
        className="min-h-11 cursor-pointer rounded-lg border border-current/20 bg-transparent px-2 font-medium focus-visible:outline-offset-2"
        value={value}
        onChange={(event) => onChange(event.target.value as InboxSort)}
      >
        {INBOX_SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
