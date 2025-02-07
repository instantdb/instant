let devBackend = false;
let instantLogs = false;
let localDevtoolIframe = false;

if (
  typeof window !== 'undefined' &&
  typeof window.localStorage !== 'undefined'
) {
  devBackend = !!window.localStorage.getItem('devBackend');
  instantLogs = !!window.localStorage.getItem('__instantLogging');
  localDevtoolIframe = !!window.localStorage.getItem('__localDevtoolIframe');
}

export { devBackend, instantLogs, localDevtoolIframe };
