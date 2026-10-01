import type { CvDocument } from '@cv-helper/shared-types';

interface Props {
  cv: CvDocument;
}

export default function PrintPreview({ cv }: Props) {
  const { contactInfo, headline, tagline, professionalSummary, skills, experience, education } = cv;

  return (
    <div
      className="print-page bg-white shadow-lg"
      style={{ width: '210mm', minHeight: '297mm', padding: '16mm', fontFamily: 'Arial, Helvetica, sans-serif' }}
    >
      {/* Header */}
      <div className="mb-4 pb-3 border-b border-gray-300">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{contactInfo.name || 'Your Name'}</h1>
        {headline?.trim() && (
          <p className="text-base font-semibold text-gray-700 mt-0.5 mb-0.5">{headline.trim()}</p>
        )}
        {tagline?.trim() && (
          <p className="text-xs text-gray-500 mb-0.5">{tagline.trim()}</p>
        )}
        <p className="text-sm text-gray-600 mt-0.5 space-x-3">
          {contactInfo.email && <span>{contactInfo.email}</span>}
          {contactInfo.phone && <span>· {contactInfo.phone}</span>}
          {contactInfo.location && <span>· {contactInfo.location}</span>}
          {contactInfo.linkedIn && <span>· {contactInfo.linkedIn}</span>}
        </p>
      </div>

      {/* Summary */}
      {professionalSummary && (
        <div className="mb-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Summary</h2>
          <p className="text-sm text-gray-800 leading-relaxed">{professionalSummary}</p>
        </div>
      )}

      {/* Skills */}
      {skills.length > 0 && (
        <div className="mb-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Skills</h2>
          <p className="text-sm text-gray-800">{skills.join(' · ')}</p>
        </div>
      )}

      {/* Experience */}
      {experience.length > 0 && (
        <div className="mb-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Experience</h2>
          <div className="space-y-3">
            {experience.map((exp, i) => (
              <div key={i}>
                <div className="flex justify-between items-baseline">
                  <span className="text-sm font-bold text-gray-900">{exp.role}</span>
                  <span className="text-xs text-gray-500">{exp.dates.start}{exp.dates.end ? ` – ${exp.dates.end}` : ''}</span>
                </div>
                <p className="text-sm text-gray-600">{exp.company}{exp.location ? `, ${exp.location}` : ''}</p>
                <ul className="mt-1 space-y-0.5 list-disc list-inside">
                  {exp.bullets.filter(Boolean).map((b, bi) => (
                    <li key={bi} className="text-sm text-gray-800">{b}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Education */}
      {education.length > 0 && (
        <div className="mb-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Education</h2>
          <div className="space-y-2">
            {education.map((edu, i) => (
              <div key={i}>
                <div className="flex justify-between items-baseline">
                  <span className="text-sm font-bold text-gray-900">{edu.school}</span>
                  {edu.graduationYear && <span className="text-xs text-gray-500">{edu.graduationYear}</span>}
                </div>
                <p className="text-sm text-gray-600">{edu.degree}{edu.major ? ` — ${edu.major}` : ''}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
