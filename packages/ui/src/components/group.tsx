import { cn } from '@/lib/utils';
import { HelpCircle } from 'lucide-react';
import { memo } from 'react';
import { Label } from './label';
import { Tooltip } from './tooltip';

type TGroupProps = {
  label: string;
  children: React.ReactNode;
  description?: string;
  help?: React.ReactNode;
  required?: boolean;
  className?: string;
};

const Group = memo(
  ({
    label,
    children,
    description,
    help,
    required,
    className
  }: TGroupProps) => {
    // the header only reads label/required/help/description: the React
    // Compiler caches it while the field (children) changes per keystroke
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        <div className="flex flex-col">
          <div className="flex">
            <Label>
              {label} {required && <span className="text-red-500">*</span>}
            </Label>
            {help && (
              <Tooltip content={help}>
                <HelpCircle className="ml-1 inline-block h-3 w-3 text-muted-foreground" />
              </Tooltip>
            )}
          </div>
          {description && (
            <span className="text-sm text-muted-foreground">{description}</span>
          )}
        </div>
        <div className="flex flex-col gap-2">{children}</div>
      </div>
    );
  }
);
Group.displayName = 'Group';

export { Group };
