import { ToastContainer, toast, Flip } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import {
  ExclamationCircleIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/solid';

export function infoToast(text, options) {
  toast.info(text, {
    icon: <InformationCircleIcon width={20} height={20} />,
    toastId: text,
    ...options,
  });
}

export function successToast(text, options) {
  toast.success(text, {
    icon: <CheckCircleIcon className="text-green-500" width={20} height={20} />,
    toastId: text,
    ...options,
  });
}

export function errorToast(text, options) {
  toast.error(text, {
    icon: (
      <ExclamationCircleIcon className="text-red-500" width={20} height={20} />
    ),
    toastId: text,
    autoClose: 500000000,
    className: 'whitespace-pre-wrap',
    ...options,
  });
}

export function StyledToastContainer() {
  return (
    <ToastContainer
      position="top-right"
      autoClose={3000}
      hideProgressBar
      draggablePercent={30}
      theme="light"
      limit={3}
      closeButton={false}
    />
  );
}
