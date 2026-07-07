"use client";

type ConfirmSubmitButtonProps = {
  children: React.ReactNode;
  message: string;
  className?: string;
};

export function ConfirmSubmitButton({ children, message, className }: ConfirmSubmitButtonProps) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
