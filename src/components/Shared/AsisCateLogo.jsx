import React from 'react';

export const AsisCateLogo = ({ className = "w-8 h-8" }) => (
  <svg 
    className={className} 
    viewBox="0 0 40 40" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="40" height="40" rx="10" fill="#991B1B" fillOpacity="0.12" />
    <path 
      d="M20 12L10 33" 
      stroke="#991B1B" 
      strokeWidth="4" 
      strokeLinecap="round" 
    />
    <path 
      d="M20 12L30 33" 
      stroke="#991B1B" 
      strokeWidth="4" 
      strokeLinecap="round" 
    />
    <path 
      d="M14 23H26" 
      stroke="#EF4444" 
      strokeWidth="3.5" 
      strokeLinecap="round" 
    />
    <path 
      d="M20 3V11M17 6H23" 
      stroke="#991B1B" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
    />
    <path 
      d="M25 22L28.5 25.5L35 16" 
      stroke="#10B981" 
      strokeWidth="3.5" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
    />
  </svg>
);
