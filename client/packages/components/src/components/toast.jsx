import { ToastContainer, toast } from 'react-toastify';
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

export function StyledToastContainer(props) {
  return (
    <ToastContainer
      theme={props.theme || 'light'}
      position="top-right"
      autoClose={3000}
      hideProgressBar
      draggablePercent={30}
      limit={3}
      closeButton={false}
    />
  );
}
