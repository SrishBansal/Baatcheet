import React, { useState, useCallback, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { HomeIcon, BriefcaseIcon, ClipboardIcon, MenuIcon } from '../ui/Icons.jsx';
import { health } from '../../data/engineApi.js';

/**
 * Application shell with sidebar navigation, header, and content area.
 * Responsive: sidebar collapses to a toggleable overlay on mobile.
 */

const NAV_ITEMS = [
  {
    section: 'Overview',
    links: [
      { to: '/', label: 'Dashboard', icon: HomeIcon },
    ],
  },
  {
    section: 'Recruitment',
    links: [
      { to: '/positions', label: 'Positions', icon: BriefcaseIcon },
      { to: '/interviews', label: 'Completed Interviews', icon: ClipboardIcon },
    ],
  },
];

/** Map route paths to page titles */
const PAGE_TITLES = {
  '/': 'Operational Overview',
  '/positions': 'Positions Directory',
  '/positions/new': 'Create Position',
  '/jobs': 'Positions Directory',
  '/jobs/new': 'Create Position',
  '/interviews': 'Completed Interviews',
};

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const [ai, setAi] = useState(null);
  useEffect(() => { health().then(setAi).catch(() => setAi({ error: true })); }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  // Determine page title from route
  const pageTitle = getPageTitle(location.pathname);

  return (
    <div className="app-layout">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="sidebar-overlay sidebar-overlay--visible" onClick={closeSidebar} />
      )}

      <aside className="app-rail" aria-label="Primary shortcuts">
        <div className="app-rail__mark" aria-hidden="true">B</div>
        <nav className="app-rail__nav">
          {NAV_ITEMS.flatMap((section) => section.links).map((link) => (
            <NavLink key={link.to} to={link.to} end={link.to === '/'} className={({ isActive }) => `app-rail__link ${isActive ? 'app-rail__link--active' : ''}`} aria-label={link.label}>
              <link.icon />
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Navigation panel */}
      <aside className={`app-sidebar ${sidebarOpen ? 'app-sidebar--open' : ''}`}>
        <div className="app-sidebar__brand">
          <div>
            <div className="app-sidebar__title">Baatcheet</div>
            <div className="app-sidebar__subtitle">AI Screening</div>
          </div>
        </div>

        <nav className="app-sidebar__nav" aria-label="Main navigation">
          {NAV_ITEMS.map((section) => (
            <div key={section.section}>
              <div className="app-sidebar__section-title">{section.section}</div>
              {section.links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === '/'}
                  className={({ isActive }) =>
                    `app-sidebar__link ${isActive ? 'app-sidebar__link--active' : ''}`
                  }
                  onClick={closeSidebar}
                >
                  <link.icon className="app-sidebar__link-icon" />
                  {link.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="app-sidebar__footer">
          <span className="app-sidebar__version">Recruiting workspace</span>
          <span className="ai-status-chip app-sidebar__ai-status">{ai?.error ? 'Server not reachable' : ai?.geminiConfigured ? `AI: Gemini connected (${ai.model || 'Gemini'})` : 'AI: NOT configured'}</span>
        </div>
      </aside>

      {/* Main content */}
      <div className="app-main">
        <header className="app-header">
          <button
            className="app-header__menu-toggle"
            onClick={toggleSidebar}
            aria-label="Toggle navigation"
            type="button"
          >
            <MenuIcon />
          </button>
          <h1 className="app-header__title">{pageTitle}</h1>
          <div className="app-header__actions" />
        </header>

        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/**
 * Resolve the page title for a given pathname.
 * Handles dynamic routes like /jobs/:id/edit.
 */
function getPageTitle(pathname) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.match(/^\/positions\/[^/]+$/)) return 'Position Details & Criteria';
  if (pathname.match(/^\/jobs\/[^/]+(\/edit)?$/)) return 'Position Details & Criteria';
  if (pathname.match(/^\/interviews\/[^/]+$/)) return 'Interview Report';
  return 'Baatcheet';
}
