import { Toaster as Sonner, type ToasterProps } from 'sonner';

// theme comes from the caller: sonner's own default ('light') and 'system'
// would both ignore the app theme
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      // Always show the close X. Swipe-to-dismiss was non-obvious;
      // the X gives a discoverable affordance.
      closeButton
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)'
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
