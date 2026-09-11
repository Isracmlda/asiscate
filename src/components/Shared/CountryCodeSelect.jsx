import { useState, useEffect, useRef } from 'react';
import { COUNTRY_CODES } from '../../utils/validators';

export function CountryCodeSelect({ value, onChange, className }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const selectedCountry = COUNTRY_CODES.find(c => c.code === value) || COUNTRY_CODES[0];

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className="relative inline-block w-2/5">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-1.5 rounded-lg px-2.5 py-2 text-xs sm:text-sm font-semibold transition-all ${className}`}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <img 
            src={selectedCountry.flagUrl} 
            alt={selectedCountry.name} 
            className="w-5 h-3.5 object-cover rounded-sm flex-shrink-0 shadow-sm"
          />
          <span className="truncate">{selectedCountry.code}</span>
        </span>
        <span className="text-[10px] text-slate-400">▼</span>
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-56 max-h-56 overflow-y-auto rounded-xl bg-slate-800 border border-slate-700 shadow-2xl z-50 py-1 text-xs">
          {COUNTRY_CODES.map((c) => (
            <button
              key={`custom-select-${c.code}-${c.iso}`}
              type="button"
              onClick={() => {
                onChange(c.code);
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-700/80 transition-colors ${
                c.code === value ? 'bg-red-950/60 font-bold text-red-200' : 'text-slate-200'
              }`}
            >
              <img 
                src={c.flagUrl} 
                alt={c.name} 
                className="w-5 h-3.5 object-cover rounded-sm flex-shrink-0 shadow-sm"
              />
              <span className="flex-1 truncate">{c.name}</span>
              <span className="font-mono text-slate-400 text-[11px]">{c.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
