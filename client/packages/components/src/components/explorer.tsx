import React from 'react';
interface ExplorerProps {
  appId: string;
  adminToken: string;
  apiURI?: string;
  weboocketURI?: string;
}

export const Explorer = ({ appId, adminToken }: ExplorerProps) => {
  return (
    <div className="tw-preflight bg-blue-500 p-2">
      {adminToken}
      <p>This is the explorer</p>
    </div>
  );
};
