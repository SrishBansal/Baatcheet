import React from 'react';

/**
 * Inline SVG icons used throughout the application.
 * Keeps icons co-located, avoids icon-library dependency.
 *
 * All icons are 18x18 by default with currentColor fill/stroke.
 */

export function BriefcaseIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2" y="6" width="14" height="10" rx="2" />
      <path d="M6 6V4a2 2 0 012-2h2a2 2 0 012 2v2" />
      <path d="M2 10h14" />
    </svg>
  );
}

export function PlusIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" {...props}>
      <path d="M9 3v12M3 9h12" />
    </svg>
  );
}

export function PencilIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M11.5 3.5l3 3L6 15H3v-3L11.5 3.5z" />
    </svg>
  );
}

export function TrashIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 5h12M7 5V3h4v2M6 8v6M9 8v6M12 8v6" />
      <path d="M4 5l1 10a1 1 0 001 1h6a1 1 0 001-1l1-10" />
    </svg>
  );
}

export function HomeIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 7.5L9 2l6 5.5V15a1 1 0 01-1 1h-3v-4H7v4H4a1 1 0 01-1-1V7.5z" />
    </svg>
  );
}

export function ClipboardIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 2h6v2H6z" />
      <rect x="3" y="3" width="12" height="13" rx="1.5" />
      <path d="M6 8h6M6 11h4" />
    </svg>
  );
}

export function ChevronRightIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M7 4l5 5-5 5" />
    </svg>
  );
}

export function MenuIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" {...props}>
      <path d="M3 5h12M3 9h12M3 13h12" />
    </svg>
  );
}

export function SearchIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="8" cy="8" r="5" />
      <path d="M14 14l-2.5-2.5" />
    </svg>
  );
}

export function XIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" {...props}>
      <path d="M5 5l8 8M13 5l-8 8" />
    </svg>
  );
}

export function CheckIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 9l3.5 3.5L14 5" />
    </svg>
  );
}

export function TagIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M2 9.5V3a1 1 0 011-1h6.5L16 8.5 9.5 15 2 9.5z" />
      <circle cx="6" cy="6" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function QuestionIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="9" cy="9" r="7" />
      <path d="M7 7a2 2 0 013.5 1.5c0 1-1.5 1.5-1.5 1.5" />
      <circle cx="9" cy="13" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TargetIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="9" cy="9" r="7" />
      <circle cx="9" cy="9" r="4" />
      <circle cx="9" cy="9" r="1" />
    </svg>
  );
}
