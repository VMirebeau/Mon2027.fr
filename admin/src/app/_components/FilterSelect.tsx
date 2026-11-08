"use client";

import Form from "next/form";

export type FilterOption = { value: string; label: string };

type Props = {
  name: string;
  label: string;
  current?: string;
  options: FilterOption[];
  sp: Record<string, string | undefined>;
};

/// <Form> de next/form et non <form> brut : il préfixe l'action du basePath
/// (/admin en prod) et navigue côté client. Un `<form action="/">` envoyait
/// les filtres de la liste vers l'app publique.
export function FilterSelect({ name, label, current, options, sp }: Props) {
  return (
    <Form action="/" className="flex items-center gap-1">
      {Object.entries(sp).map(([k, v]) =>
        k !== name && v ? (
          <input key={k} type="hidden" name={k} value={v} />
        ) : null
      )}
      <label className="text-xs text-muted-foreground" htmlFor={`filter-${name}`}>
        {label}
      </label>
      <select
        id={`filter-${name}`}
        name={name}
        defaultValue={current ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">Tous</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Form>
  );
}
