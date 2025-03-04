let devBackend = false;
let instantLogs = false;
let devtoolLocalDashboard = false;

if (
  typeof window !== 'undefined' &&
  typeof window.localStorage !== 'undefined'
) {
  devBackend = !!window.localStorage.getItem('devBackend');
  instantLogs = !!window.localStorage.getItem('__instantLogging');
  devtoolLocalDashboard = !!window.localStorage.getItem('__devtoolLocalDash');
}

export { devBackend, instantLogs, devtoolLocalDashboard };
