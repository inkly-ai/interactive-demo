import type { SVGProps } from 'react';

const baseProps: SVGProps<SVGSVGElement> = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
};

export function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps} {...props}>
      <polygon points="6 3 20 12 6 21" fill="currentColor" />
    </svg>
  );
}

export function PauseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps} fill="none" stroke="none" {...props}>
      <path d="M0 0h24v24H0z" fill="none" />
      <path
        fill="currentColor"
        fillRule="evenodd"
        transform="translate(12 12) scale(1.18) translate(-12 -12)"
        d="M10 18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1zm7 0a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1z"
      />
    </svg>
  );
}

export function ReplayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...baseProps}
      fill="none"
      stroke="none"
      {...props}
    >
      <path d="M0 0h24v24H0z" fill="none" />
      <path
        fill="currentColor"
        d="M8.488 21.288q-1.638-.713-2.85-1.925t-1.925-2.85T3 13h2q0 2.925 2.038 4.963T12 20t4.963-2.037T19 13t-2.037-4.962T12 6h-.15l1.55 1.55L12 9L8 5l4-4l1.4 1.45L11.85 4H12q1.875 0 3.513.713t2.85 1.925t1.925 2.85T21 13t-.712 3.513t-1.925 2.85t-2.85 1.925T12 22t-3.512-.712"
      />
    </svg>
  );
}

export function ChevronLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps} strokeWidth={2.5} {...props}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function ChevronRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps} strokeWidth={2.5} {...props}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function Volume2Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps} {...props}>
      <polygon
        points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"
        fill="currentColor"
      />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

export function VolumeXIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps} {...props}>
      <polygon
        points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"
        fill="currentColor"
      />
      <line x1="22" x2="16" y1="9" y2="15" />
      <line x1="16" x2="22" y1="9" y2="15" />
    </svg>
  );
}

export function ShareIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 14v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" />
    </svg>
  );
}

export function LinkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

export function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function FullscreenIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M4 9V5a1 1 0 0 1 1-1h4" />
      <path d="M20 9V5a1 1 0 0 0-1-1h-4" />
      <path d="M4 15v4a1 1 0 0 0 1 1h4" />
      <path d="M20 15v4a1 1 0 0 1-1 1h-4" />
    </svg>
  );
}

export function CaptionsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 15h2" />
      <path d="M11 15h2" />
      <path d="M15 15h2" />
      <path d="M7 11h4" />
      <path d="M13 11h4" />
    </svg>
  );
}
