import React from 'react';
import { Switch } from '@lib/components/ui';
import { Checkbox, Dialog, Divider, IconButton } from '@lib/components/ui';
import { useColumnVisibility } from '@lib/hooks/useColumnVisibility';
import { Cog6ToothIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

interface ViewSettingsProps {
  visiblity: ReturnType<typeof useColumnVisibility>;
  localDates: boolean;
  setLocalDates: (v: boolean | undefined) => void;
}

export const ViewSettings = ({
  visiblity,
  localDates,
  setLocalDates,
}: ViewSettingsProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <>
      <IconButton
        icon={<Cog6ToothIcon width={16} />}
        label="View Settings"
        onClick={() => setDialogOpen(true)}
      />
      <Dialog
        hideCloseButton={true}
        onClose={() => setDialogOpen(false)}
        open={dialogOpen}
      >
        <div className="flex items-center justify-between">
          <div className="text-lg">Explorer View Settings</div>
          <button onClick={() => setDialogOpen(false)}>
            <XMarkIcon className="h-4 w-4 cursor-pointer" />
          </button>
        </div>

        <div className="py-2">
          <div>Visible Columns</div>
          <div className="py-1">
            {visiblity.attrs?.map((attr) => (
              <div className="flex gap-2">
                <Checkbox
                  label={attr.name}
                  checked={visiblity.visibility[attr.id + attr.name] !== false}
                  onChange={(checked) =>
                    visiblity.setVisibility((prev) => ({
                      ...prev,
                      [attr.id + attr.name]: checked,
                    }))
                  }
                ></Checkbox>
              </div>
            ))}
          </div>
        </div>
        <Divider className="py-2" />

        <div className="flex items-center gap-2">
          <div>Show Dates in Local Time</div>
          <Switch
            onClick={(e) => {
              setLocalDates(!localDates);
            }}
            checked={localDates}
          ></Switch>
        </div>
        <div className="text-xs opacity-40">
          Copy to clipboard will still use the original value.
        </div>
      </Dialog>
    </>
  );
};
