import React from 'react';
import { StyleMe } from '../StyleMe.js';
interface ExplorerProps {
  appId: string;
  adminToken: string;
  apiURI?: string;
  weboocketURI?: string;
}

export const Explorer = ({ appId, adminToken }: ExplorerProps) => {
  return (
    <StyleMe>
      <div className="tw-preflight bg-red-400 p-2">
        {adminToken}
        <p>This is the explorer</p>
      </div>
    </StyleMe>
  );
};
