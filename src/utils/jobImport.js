/**
 * Job Import Utility: Canonicalization, HTML Parsing, Pasted Text Segmentation, and Provenance.
 *
 * Adheres to HARD PRINCIPLES:
 * - Zero fabricated data: fields are strictly 'extracted', 'pasted', or 'missing'.
 * - No questions or criteria are ever hallucinated from LinkedIn postings.
 * - Robust URL validation and redirect/authwall error detection.
 */

import { generateId } from './id.js';

/**
 * Validates and canonicalizes a LinkedIn job posting URL.
 * Accepts:
 * - https://www.linkedin.com/jobs/view/<id>
 * - https://www.linkedin.com/jobs/search/?currentJobId=<id>
 *
 * @param {string} url
 * @returns {{ canonicalUrl: string, jobId: string }}
 * @throws {Error} with descriptive message if format is unsupported or ID is missing.
 */
export function canonicalizeLinkedInUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('Please enter a LinkedIn job posting URL.');
  }

  const trimmed = url.trim();
  let parsedUrl;
  try {
    parsedUrl = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error(
      'Invalid URL format. Please provide a valid LinkedIn job URL (e.g., https://www.linkedin.com/jobs/view/123456789).'
    );
  }

  const host = parsedUrl.hostname.toLowerCase();
  if (!host.includes('linkedin.com')) {
    throw new Error(
      'Unsupported URL host. Only public linkedin.com job URLs are supported.'
    );
  }

  let jobId = null;

  // Format 1: /jobs/view/<jobId>
  const viewMatch = parsedUrl.pathname.match(/\/jobs\/view\/([0-9]+)/i);
  if (viewMatch && viewMatch[1]) {
    jobId = viewMatch[1];
  }

  // Format 2: ?currentJobId=<jobId>
  if (!jobId) {
    const currentJobId = parsedUrl.searchParams.get('currentJobId');
    if (currentJobId && /^[0-9]+$/.test(currentJobId)) {
      jobId = currentJobId;
    }
  }

  // Format 3: /jobs/collections/.../?currentJobId=<jobId>
  if (!jobId) {
    const anyIdMatch = parsedUrl.href.match(/currentJobId=([0-9]+)/i);
    if (anyIdMatch && anyIdMatch[1]) {
      jobId = anyIdMatch[1];
    }
  }

  if (!jobId) {
    throw new Error(
      'Unsupported LinkedIn URL format. Please provide a URL containing a numeric job ID (e.g., https://www.linkedin.com/jobs/view/123456789 or ...?currentJobId=123456789).'
    );
  }

  return {
    canonicalUrl: `https://www.linkedin.com/jobs/view/${jobId}/`,
    jobId,
  };
}

/**
 * Strips HTML tags and unescapes entities safely without dangerouslySetInnerHTML.
 *
 * @param {string} html
 * @returns {string}
 */
export function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';

  let text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // Collapse excessive whitespace while preserving paragraphs
  return text
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Parses raw HTML returned from a LinkedIn job page.
 *
 * @param {string} html
 * @param {string} [sourceUrl='']
 * @param {number} [httpStatus=200]
 * @returns {object} Normalized job object with fieldProvenance
 */
export function parseJobPostingHtml(html, sourceUrl = '', httpStatus = 200) {
  if (!html || typeof html !== 'string' || !html.trim()) {
    throw new Error('LinkedIn response body was empty or unparseable.');
  }

  // 1. Authwall and Login Detection
  if (
    html.includes('Sign In | LinkedIn') ||
    html.includes('authwall-join-form') ||
    html.includes('/uas/login') ||
    html.includes('authwall?trk=')
  ) {
    throw new Error(
      'LinkedIn authwall detected. Public scraping is restricted by LinkedIn authentication.'
    );
  }

  // 2. Search for JSON-LD JobPosting schema
  let jsonLdPosting = null;
  const jsonLdRegex = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed) {
        if (parsed['@type'] === 'JobPosting') {
          jsonLdPosting = parsed;
          break;
        }
        if (Array.isArray(parsed['@graph'])) {
          const item = parsed['@graph'].find((g) => g['@type'] === 'JobPosting');
          if (item) {
            jsonLdPosting = item;
            break;
          }
        }
      }
    } catch {
      // Continue to next script block
    }
  }

  let title = '';
  let company = '';
  let rawDescription = '';

  if (jsonLdPosting) {
    title = jsonLdPosting.title || '';
    company = jsonLdPosting.hiringOrganization?.name || '';
    rawDescription = jsonLdPosting.description || '';
  } else {
    // Fallback: look for meta tags og:title / og:description
    const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i);
    const titleTagMatch = html.match(/<title>([^<]+)<\/title>/i);
    const rawTitle = ogTitleMatch ? ogTitleMatch[1] : titleTagMatch ? titleTagMatch[1] : '';

    // Check if title is search results rather than single job
    if (rawTitle.toLowerCase().includes('jobs in') || rawTitle.toLowerCase().includes('search results')) {
      throw new Error(
        'Could not find a structured JobPosting in the LinkedIn response. The posting may be expired, redirected, or require login.'
      );
    }

    title = rawTitle.replace(/\s*\|\s*LinkedIn.*$/i, '').trim();

    const ogDescMatch = html.match(
      /<meta\s+(?:property|name)=["'](?:og:description|description)["']\s+content=["']([\s\S]*?)["']/i
    );
    rawDescription = ogDescMatch ? ogDescMatch[1] : '';
  }

  if (!title.trim()) {
    throw new Error(
      'Could not find a structured JobPosting in the LinkedIn response. The posting may be expired, redirected, or require login.'
    );
  }

  const cleanDescription = stripHtml(rawDescription);

  // Extract skills/requirements from description bullet points if present
  const extractedSkills = extractSkillsFromDescription(cleanDescription);

  let canonicalUrl = '';
  try {
    if (sourceUrl) {
      canonicalUrl = canonicalizeLinkedInUrl(sourceUrl).canonicalUrl;
    }
  } catch {
    canonicalUrl = sourceUrl;
  }

  const fieldProvenance = {
    title: 'extracted',
    company: company.trim() ? 'extracted' : 'missing',
    description: cleanDescription ? 'extracted' : 'missing',
    requirements: extractedSkills.length > 0 ? 'extracted' : 'missing',
    questions: 'missing', // Questions are NEVER hallucinated from job postings
  };

  return {
    title: title.trim(),
    company: company.trim(),
    description: cleanDescription,
    skills: extractedSkills,
    questions: [], // Recruiter must configure structured screening questions
    criteria: [],
    source: {
      type: 'linkedin',
      url: sourceUrl,
      canonicalUrl,
      fetchedAt: new Date().toISOString(),
      httpStatus,
      fieldProvenance,
    },
    fieldProvenance,
  };
}

/**
 * First-class local parser for pasted job text.
 * Segments title, company, description, and requirement bullet points.
 *
 * @param {string} rawText
 * @returns {object} Normalized job object with fieldProvenance
 */
export function parsePastedJobText(rawText) {
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    throw new Error('Pasted job text is empty.');
  }

  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error('Pasted job text contains no readable lines.');
  }

  let title = '';
  let company = '';
  const descriptionLines = [];
  const requirementCandidates = [];

  let inRequirementsSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect title from explicit label or first line
    if (!title) {
      const titleMatch = line.match(/^(?:job\s+title|role|position):\s*(.+)$/i);
      if (titleMatch) {
        title = titleMatch[1].trim();
        continue;
      }
      if (i === 0 && line.length < 100 && !line.includes(':')) {
        title = line;
        continue;
      }
    }

    // Detect company from explicit label
    if (!company) {
      const companyMatch = line.match(/^(?:company|organization|at):\s*(.+)$/i);
      if (companyMatch) {
        company = companyMatch[1].trim();
        continue;
      }
    }

    // Detect section headers for requirements
    const isRequirementsHeader =
      /^(?:requirements|qualifications|what\s+you'll\s+need|what\s+we're\s+looking\s+for|skills|must-haves):?$/i.test(
        line.replace(/[*#]/g, '').trim()
      );

    if (isRequirementsHeader) {
      inRequirementsSection = true;
      descriptionLines.push(line);
      continue;
    }

    // Detect section headers for other sections (responsibilities, about, benefits)
    const isOtherHeader =
      /^(?:responsibilities|what\s+you'll\s+do|about\s+the\s+team|about\s+us|benefits|perks):?$/i.test(
        line.replace(/[*#]/g, '').trim()
      );

    if (isOtherHeader && inRequirementsSection) {
      inRequirementsSection = false;
    }

    // If in requirements section and line is a bullet point
    if (inRequirementsSection && /^[-•*·]\s*(.+)/.test(line)) {
      const bulletText = line.replace(/^[-•*·]\s*/, '').trim();
      if (bulletText.length > 3 && bulletText.length < 200) {
        requirementCandidates.push(bulletText);
      }
    }

    descriptionLines.push(line);
  }

  if (!title) {
    title = lines[0].slice(0, 80);
  }

  const skills = requirementCandidates.slice(0, 10).map((name) => ({
    id: generateId('skill'),
    name,
    priority: 'required',
  }));

  const fieldProvenance = {
    title: 'pasted',
    company: company ? 'pasted' : 'missing',
    description: descriptionLines.length > 0 ? 'pasted' : 'missing',
    requirements: skills.length > 0 ? 'pasted' : 'missing',
    questions: 'missing',
  };

  return {
    title: title.trim(),
    company: company.trim(),
    description: descriptionLines.join('\n\n'),
    skills,
    questions: [],
    criteria: [],
    source: {
      type: 'pasted',
      fetchedAt: new Date().toISOString(),
      fieldProvenance,
    },
    fieldProvenance,
  };
}

/**
 * Helper to extract requirement lines from description text under Requirements/Qualifications headings.
 * @private
 */
function extractSkillsFromDescription(desc) {
  if (!desc) return [];

  const lines = desc.split('\n').map((l) => l.trim());
  const skills = [];
  let inReqSection = false;

  for (const line of lines) {
    if (
      /^(?:requirements|qualifications|what\s+you(?:'ll|\s+will)\s+need|key\s+qualifications|what\s+we\s+look\s+for):?$/i.test(
        line
      )
    ) {
      inReqSection = true;
      continue;
    }

    if (
      inReqSection &&
      /^(?:responsibilities|benefits|about\s+us|what\s+you(?:'ll|\s+will)\s+do):?$/i.test(line)
    ) {
      inReqSection = false;
      continue;
    }

    if (inReqSection && /^[-•*·]\s*(.+)/.test(line)) {
      const skillName = line.replace(/^[-•*·]\s*/, '').trim();
      if (skillName.length > 3 && skillName.length < 160) {
        skills.push({
          id: generateId('skill'),
          name: skillName,
          priority: 'required',
        });
      }
    }
  }

  return skills.slice(0, 8);
}

/**
 * Computes direct content word overlap ratio between extracted text and source text.
 * Requires >= 70% (0.70) overlap for verification without warning.
 *
 * @param {string} extractedText
 * @param {string} sourceText
 * @returns {{ ratio: number, verified: boolean, matchingCount: number, totalCount: number }}
 */
export function computeContentOverlap(extractedText, sourceText) {
  const getWords = (str) =>
    (str || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3);

  const sourceWords = new Set(getWords(sourceText));
  if (sourceWords.size === 0) {
    return { ratio: 0, verified: false, matchingCount: 0, totalCount: 0 };
  }

  const extractedWords = getWords(extractedText);
  if (extractedWords.length === 0) {
    return { ratio: 1, verified: true, matchingCount: 0, totalCount: 0 };
  }

  const matching = extractedWords.filter((w) => sourceWords.has(w));
  const ratio = matching.length / extractedWords.length;

  return {
    ratio,
    verified: ratio >= 0.7,
    matchingCount: matching.length,
    totalCount: extractedWords.length,
  };
}

