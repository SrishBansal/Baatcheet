import React from 'react';
import './Input.css';

/**
 * Reusable input / textarea component.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {string} [props.id]
 * @param {string} [props.name]
 * @param {string} [props.type='text']
 * @param {string} [props.placeholder]
 * @param {string} [props.value]
 * @param {function} [props.onChange]
 * @param {boolean} [props.required=false]
 * @param {boolean} [props.disabled=false]
 * @param {boolean} [props.multiline=false]
 * @param {number} [props.rows=3]
 * @param {string} [props.error]
 * @param {string} [props.hint]
 * @param {string} [props.className]
 */
export default function Input({
  label,
  id,
  name,
  type = 'text',
  placeholder,
  value,
  onChange,
  required = false,
  disabled = false,
  multiline = false,
  rows = 3,
  error,
  hint,
  className = '',
  ...rest
}) {
  const inputId = id || name || label?.toLowerCase().replace(/\s+/g, '-');

  const inputClasses = [
    'input__field',
    error && 'input__field--error',
  ].filter(Boolean).join(' ');

  return (
    <div className={`input-group ${className}`}>
      {label && (
        <label htmlFor={inputId} className="input__label">
          {label}
          {required && <span className="input__required" aria-label="required"> *</span>}
        </label>
      )}
      {hint && <p className="input__hint">{hint}</p>}
      {multiline ? (
        <textarea
          id={inputId}
          name={name}
          className={inputClasses}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled}
          rows={rows}
          {...rest}
        />
      ) : (
        <input
          id={inputId}
          name={name}
          type={type}
          className={inputClasses}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled}
          {...rest}
        />
      )}
      {error && (
        <p className="input__error" role="alert">{error}</p>
      )}
    </div>
  );
}
