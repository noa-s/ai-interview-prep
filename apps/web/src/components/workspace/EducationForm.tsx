'use client';

import { useState, useEffect } from 'react';
import type { Education } from '@cv-helper/shared-types';

interface Props {
  value: Education[];
  onChange: (value: Education[]) => void;
}

const EMPTY_EDU: Education = { school: '', degree: '', major: '', graduationYear: undefined };

export default function EducationForm({ value, onChange }: Props) {
  const [entries, setEntries] = useState<Education[]>(value);

  useEffect(() => { setEntries(value); }, [value]);

  function update(index: number, patch: Partial<Education>) {
    const next = entries.map((e, i) => (i === index ? { ...e, ...patch } : e));
    setEntries(next);
    onChange(next);
  }

  function addEntry() {
    const next = [...entries, { ...EMPTY_EDU }];
    setEntries(next);
    onChange(next);
  }

  function removeEntry(index: number) {
    const next = entries.filter((_, i) => i !== index);
    setEntries(next);
    onChange(next);
  }

  return (
    <section className="border border-gray-200 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500">Education</h2>
        <button
          type="button"
          onClick={addEntry}
          className="text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-300 rounded px-2 py-1"
        >
          + Add
        </button>
      </div>
      {entries.map((edu, i) => (
        <div key={i} className="border border-gray-100 rounded p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {([['school', 'School'], ['degree', 'Degree'], ['major', 'Major']] as const).map(([field, label]) => (
              <div key={field}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                <input
                  type="text"
                  value={(edu as Record<string, string | number | undefined>)[field] as string ?? ''}
                  onChange={(e) => update(i, { [field]: e.target.value })}
                  onBlur={() => onChange(entries)}
                  className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              </div>
            ))}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Graduation Year</label>
              <input
                type="number"
                value={edu.graduationYear ?? ''}
                onChange={(e) => update(i, { graduationYear: e.target.value ? Number(e.target.value) : undefined })}
                onBlur={() => onChange(entries)}
                placeholder="2024"
                className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => removeEntry(i)}
            className="text-xs text-red-400 hover:text-red-600"
          >
            Remove entry
          </button>
        </div>
      ))}
    </section>
  );
}
