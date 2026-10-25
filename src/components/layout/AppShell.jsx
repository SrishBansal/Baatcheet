import React, { useState, useCallback } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { HomeIcon, BriefcaseIcon, ClipboardIcon, MenuIcon } from '../ui/Icons.jsx';

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

      {/* Sidebar */}
      <aside className={`app-sidebar ${sidebarOpen ? 'app-sidebar--open' : ''}`}>
        <div className="app-sidebar__brand">
          <div className="app-sidebar__logo" aria-hidden="true">HP</div>
          <div>
            <div className="app-sidebar__title">HirePilot</div>
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
          <span className="app-sidebar__version">v0.1.0 — Phase 1</span>
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
          <div className="app-header__actions">
            {/* Future: user menu, notifications */}
          </div>
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
  return 'HirePilot AI';
}
