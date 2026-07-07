"use client";

type PrintButtonProps = {
  children: React.ReactNode;
  className?: string;
};

export function PrintButton({ children, className }: PrintButtonProps) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      {children}
    </button>
  );
}
