import { toast } from './ui';

export function infoToast(text: string) {
  toast(text);
}

export function successToast(text: string) {
  toast.success(text, {
    richColors: true,
  });
}

export function errorToast(text: string, options?: any) {
  toast.error(text, {
    duration: options?.autoClose,
    richColors: true,
  });
}
