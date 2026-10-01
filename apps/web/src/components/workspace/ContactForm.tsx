'use client';

import { useState, useEffect } from 'react';
import type { ContactInfo } from '@cv-helper/shared-types';

interface Props {
  value: ContactInfo;
  onChange: (value: ContactInfo) => void;
  headline?: string;
  tagline?: string;
  onHeadlineChange?: (v: string) => void;
  onTaglineChange?: (v: string) => void;
}

export default function ContactForm({ value, onChange, headline, tagline, onHeadlineChange, onTaglineChange }: Props) {
  const [local, setLocal] = useState(value);
  const [headlineLocal, setHeadlineLocal] = useState(headline ?? '');
  const [taglineLocal, setTaglineLocal] = useState(tagline ?? '');

  useEffect(() => { setLocal(value); }, [value]);
  useEffect(() => { setHeadlineLocal(headline ?? ''); }, [headline]);
  useEffect(() => { setTaglineLocal(tagline ?? ''); }, [tagline]);

  function commit() { onChange(local); }

  return (
    <section className="border border-gray-200 rounded-lg p-4">
      <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-3">Contact Info</h2>
      <div className="grid grid-cols-2 gap-3">
        {([
          ['name', 'Full Name', 'text'],
          ['email', 'Email', 'email'],
          ['phone', 'Phone', 'tel'],
          ['location', 'Country', 'text'],
          ['linkedIn', 'LinkedIn URL', 'url'],
        ] as const).map(([field, label, type]) => (
          <div key={field} data-field={field} className={field === 'linkedIn' ? 'col-span-2' : ''}>
            <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
            <input
              type={type}
              value={(local as Record<string, string>)[field] ?? ''}
              onChange={(e) => setLocal((p) => ({ ...p, [field]: e.target.value }))}
              onBlur={commit}
              className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>
        ))}
      </div>
      {onHeadlineChange !== undefined && (
        <div className="mt-3" data-field="headline">
          <label className="block text-xs font-medium text-gray-600 mb-1">Headline</label>
          <input
            type="text"
            value={headlineLocal}
            onChange={(e) => setHeadlineLocal(e.target.value)}
            onBlur={() => onHeadlineChange(headlineLocal)}
            placeholder="e.g. Senior Software Engineer"
            className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        </div>
      )}
      {onTaglineChange !== undefined && (
        <div className="mt-2" data-field="tagline">
          <label className="block text-xs font-medium text-gray-600 mb-1">Tagline</label>
          <input
            type="text"
            value={taglineLocal}
            onChange={(e) => setTaglineLocal(e.target.value)}
            onBlur={() => onTaglineChange(taglineLocal)}
            placeholder="e.g. Distributed Systems | Cloud Platforms | AI Systems"
            className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        </div>
      )}
    </section>
  );
}
