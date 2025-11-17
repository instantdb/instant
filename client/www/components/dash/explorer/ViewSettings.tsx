import { Dialog, IconButton } from '@/components/ui';
import { useColumnVisibility } from '@/lib/hooks/useColumnVisibility';
import { Cog6ToothIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

interface ViewSettingsProps {
  visiblity: ReturnType<typeof useColumnVisibility>;
  className?: string;
}

export const ViewSettings = ({ visiblity, className }: ViewSettingsProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <>
      <IconButton
        icon={<Cog6ToothIcon width={16} />}
        label="View Settings"
        onClick={() => setDialogOpen(true)}
      />
      <Dialog onClose={() => setDialogOpen(false)} open={dialogOpen}>
        <div>View Settings</div>
      </Dialog>
    </>
  );
};
