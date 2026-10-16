import React from 'react';
import { LucideProps } from 'lucide-react';

export const SideFlowIcon: React.FC<LucideProps> = ({
  className = 'w-5 h-5',
  ...props
}) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Left Vertical Wavy Line (bows outward at center to cradle left arrowhead) */}
      <path
        d="M 5.75 3.75 C 7.6 6.2, 7.6 8.4, 5.6 10.2 C 3.8 11.8, 3.8 12.2, 5.6 13.8 C 7.6 15.6, 7.6 17.8, 5.75 20.25"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.92"
      />
      {/* Right Vertical Wavy Line (bows outward at center to cradle right arrowhead) */}
      <path
        d="M 18.25 3.75 C 16.4 6.2, 16.4 8.4, 18.4 10.2 C 20.2 11.8, 20.2 12.2, 18.4 13.8 C 16.4 15.6, 16.4 17.8, 18.25 20.25"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.92"
      />
      {/* Center Bidirectional Left-Right Arrow */}
      <path
        d="M 8 12 H 16 M 10.6 9.2 L 7.6 12 L 10.6 14.8 M 13.4 9.2 L 16.4 12 L 13.4 14.8"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default SideFlowIcon;
