import type { CvDocument } from '@cv-helper/shared-types';

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildCvHtml(cv: CvDocument): string {
  const { contactInfo, headline, tagline, professionalSummary, skills, experience, education } = cv;

  const contactParts = [
    contactInfo.phone,
    contactInfo.email,
    contactInfo.location,
    contactInfo.linkedIn,
  ].filter(Boolean) as string[];

  const contactRowHtml = contactParts.map(escapeHtml).join(' | ');

  const headlineHtml = headline?.trim()
    ? `<div class="candidate-headline">${escapeHtml(headline.trim())}</div>`
    : '';
  const taglineHtml = tagline?.trim()
    ? `<div class="candidate-tagline">${escapeHtml(tagline.trim())}</div>`
    : '';

  const summarySection = professionalSummary?.trim()
    ? `<div class="section">
        <div class="section-title">Summary</div>
        <p class="skills-grid">${escapeHtml(professionalSummary)}</p>
      </div>`
    : '';

  const skillsSection = skills.length > 0
    ? `<div class="section">
        <div class="section-title">Skills</div>
        <p class="skills-grid">${escapeHtml(skills.join(' · '))}</p>
      </div>`
    : '';

  const experienceSection = experience.length > 0
    ? `<div class="section">
        <div class="section-title">Experience</div>
        ${experience.map((exp) => {
          const dateRange = exp.dates.end
            ? `${escapeHtml(exp.dates.start)} – ${escapeHtml(exp.dates.end)}`
            : escapeHtml(exp.dates.start);
          const companyLocation = exp.location
            ? `${escapeHtml(exp.company)}, ${escapeHtml(exp.location)}`
            : escapeHtml(exp.company);
          const bullets = exp.bullets
            .filter(Boolean)
            .map((b) => `<li class="bullet-item">${escapeHtml(b)}</li>`)
            .join('\n');
          return `<div class="job-card">
            <div class="job-header">
              <span class="job-company">${companyLocation}</span>
              <span class="job-dates">${dateRange}</span>
            </div>
            <div class="job-role">${escapeHtml(exp.role)}</div>
            <ul class="bullet-list">${bullets}</ul>
          </div>`;
        }).join('\n')}
      </div>`
    : '';

  const educationSection = education.length > 0
    ? `<div class="section">
        <div class="section-title">Education</div>
        ${education.map((edu) => {
          const degreeText = edu.major
            ? `${escapeHtml(edu.degree)} — ${escapeHtml(edu.major)}`
            : escapeHtml(edu.degree);
          return `<div class="job-card">
            <div class="job-header">
              <span class="job-company">${escapeHtml(edu.school)}</span>
              <span class="job-dates">${edu.graduationYear ? escapeHtml(String(edu.graduationYear)) : ''}</span>
            </div>
            <div class="job-role">${degreeText}</div>
          </div>`;
        }).join('\n')}
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(contactInfo.name || 'Resume')}</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 10.5pt; line-height: 1.4; color: #111827; background: #ffffff; }
.page { padding: 0.6in; max-width: 8.5in; margin: 0 auto; }
.section { margin-bottom: 14pt; }
.header-section { margin-bottom: 16pt; border-bottom: 2px solid #1f2937; padding-bottom: 8pt; }
.candidate-name { font-size: 24pt; font-weight: 700; letter-spacing: -0.05em; color: #111827; margin: 0 0 4pt 0; }
.candidate-headline { font-size: 14pt; font-weight: 600; color: #374151; margin: 2pt 0 1pt 0; letter-spacing: -0.01em; }
.candidate-tagline { font-size: 9.5pt; color: #6b7280; margin: 1pt 0 4pt 0; }
.contact-row { font-size: 9.5pt; color: #4b5563; display: flex; flex-wrap: wrap; gap: 12pt; }
.section-title { font-size: 12pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #1f2937; margin: 18pt 0 6pt 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 2pt; }
.job-card { margin-bottom: 12pt; page-break-inside: avoid; }
.job-header { display: flex; justify-content: space-between; font-weight: 700; font-size: 11pt; margin-bottom: 2pt; }
.job-company { color: #1f2937; }
.job-dates { color: #4b5563; font-weight: 500; font-size: 10pt; }
.job-role { font-style: italic; color: #374151; margin-bottom: 4pt; font-size: 10pt; }
.bullet-list { margin: 0; padding-left: 14pt; }
.bullet-item { margin-bottom: 3pt; text-align: justify; }
.skills-grid { font-size: 10pt; line-height: 1.5; text-align: justify; }
@media print {
  @page { margin: 0; size: A4; }
  body { margin: 0; padding: 0; font-size: 10.5pt; line-height: 1.4; -webkit-print-color-adjust: exact; }
  .page { padding: 0 0.6in; margin: 0; box-shadow: none; max-width: 100%; }
  /* thead/tfoot repeat on every printed page, acting as top/bottom margin spacers */
  .print-margin-top { display: table-header-group; }
  .print-margin-bottom { display: table-footer-group; }
  .print-margin-top td, .print-margin-bottom td { height: 0.6in; }
  .print-body { display: table-row-group; }
  .no-print { display: none !important; }
}
</style>
</head>
<body>
<table style="width:100%;border-collapse:collapse;">
  <thead class="print-margin-top"><tr><td></td></tr></thead>
  <tfoot class="print-margin-bottom"><tr><td></td></tr></tfoot>
  <tbody class="print-body"><tr><td>
<div class="page">
  <div class="header-section">
    <h1 class="candidate-name">${escapeHtml(contactInfo.name || 'Your Name')}</h1>
    ${headlineHtml}
    ${taglineHtml}
    <div class="contact-row">${contactRowHtml}</div>
  </div>
  ${summarySection}
  ${skillsSection}
  ${experienceSection}
  ${educationSection}
</div>
  </td></tr></tbody>
</table>
</body>
</html>`;
}
