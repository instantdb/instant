import React from 'react';

export function SetupPaths({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

export function DashboardPath({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h4>Via the dashboard</h4>
      {children}
    </div>
  );
}

export function TerminalPath({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h4>Via the terminal</h4>
      {children}
    </div>
  );
}
