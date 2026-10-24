import React from 'react';
import './Badge.css';

/**
 * Status badge component.
 *
 * @param {object} props
 * @param {'default' | 'success' | 'warning' | 'danger' | 'info' | 'draft' | 'active' | 'archived'} [props.variant='default']
 * @param {'sm' | 'md'} [props.size='md']
 * @param {React.ReactNode} props.children
 * @param {string} [props.className]
 */
export default function Badge({
  variant = 'default',
  size = 'md',
  children,
  className = '',
}) {
  const classes = [
    'badge',
    `badge--${variant}`,
    `badge--${size}`,
    className,
  ].filter(Boolean).join(' ');

  return <span className={classes}>{children}</span>;
}
