import { useState } from 'react';
import { errorToast } from '../toast';

export type FormFieldStates<Schema> = {
  [K in keyof Schema]: {
    value: any;
    error: string | null;
  };
};

export type Form<Schema extends Record<string, any>> = {
  fieldStates: FormFieldStates<Schema>;
  isValid: boolean;
  isSubmitting: boolean;
  topLevelErrors: string[] | null;
  getError(n: keyof Schema): string | null;
  setTopLevelErrors: (m: string[]) => void;
  clearTopLevelErrors: () => void;
  setFieldError(name: keyof Schema, error: string): void;
  inputProps(name: keyof Schema): {
    name: keyof Schema;
    value: any;
    error: string | undefined;
    onChange(v: Schema[keyof Schema]): void;
  };
  formProps(): { onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> };
  submitButtonProps(): { type: 'submit'; disabled: boolean; children: string };
  reset(values?: Schema): void;
};

export type FormInput<Schema extends Record<string, any>> = {
  initial: Schema;
  onSubmit(values: Schema): any;
  canSubmit?: (states: {
    [K in keyof Schema]: {
      value: any;
      error: string | null;
    };
  }) => boolean;
  submitLabel?: string;
  submittingLabel?: string;
  validators?: {
    [K in keyof Schema]?: (v: Schema[K]) => { error: string } | void;
  };
  // TODO: validateAll - like `canSubmit`, but returns top-level error messages instead of a boolean
};

export function useForm<Schema extends Record<string, any>>({
  initial,
  onSubmit,
  canSubmit,
  submitLabel,
  submittingLabel,
  validators,
}: FormInput<Schema>): Form<Schema> {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [topLevelErrors, setTopLevelErrors] = useState<string[] | null>(null);
  const [fieldStates, setFieldStates] = useState<FormFieldStates<Schema>>(() =>
    getInitialFieldStates(initial),
  );

  function getValues() {
    return Object.fromEntries(
      Object.entries(fieldStates).map(([k, v]) => [k, v.value]),
    ) as Schema;
  }

  function getInitialFieldStates(vs: Schema) {
    return Object.fromEntries(
      Object.entries(vs).map(([k, value]) => [k, { value, error: null }]),
    ) as FormFieldStates<Schema>;
  }

  const hasErrors = Boolean(
    Object.values(fieldStates).filter((s) => s.error).length,
  );

  const isValid =
    !isSubmitting && !hasErrors && (canSubmit ? canSubmit(fieldStates) : true);

  return {
    fieldStates,
    isValid,
    isSubmitting,
    topLevelErrors,
    reset(values) {
      setFieldStates(getInitialFieldStates(values ?? initial));
    },
    getError(n: keyof Schema) {
      return fieldStates[n]?.error ?? null;
    },
    setTopLevelErrors: (m: string[]) => setTopLevelErrors(m),
    clearTopLevelErrors: () => setTopLevelErrors(null),
    setFieldError(name: keyof Schema, error: string) {
      setFieldStates((s) => ({
        ...s,
        [name]: {
          ...s[name],
          error,
        },
      }));
    },
    inputProps(name: keyof Schema) {
      return {
        name,
        value: fieldStates[name].value ?? '',
        error: fieldStates[name].error ?? undefined,
        onChange(v: Schema[typeof name]) {
          const error = validators?.[name]?.(v)?.error ?? null;

          setFieldStates((s) => ({
            ...s,
            [name]: {
              value: v,
              error,
            },
          }));
        },
      };
    },
    formProps() {
      return {
        async onSubmit(e: React.FormEvent<HTMLFormElement>) {
          e.preventDefault();

          setIsSubmitting(true);
          try {
            await onSubmit(getValues());
          } finally {
            setIsSubmitting(false);
          }
        },
      };
    },
    submitButtonProps() {
      return {
        type: 'submit' as const,
        disabled: !isValid,
        children: isSubmitting
          ? (submittingLabel ?? 'Submitting...')
          : (submitLabel ?? 'Submit'),
      };
    },
  };
}

export function displayInstantStandardError<T extends Record<string, any>>(
  errorRes: any,
  form: Form<T>,
  apiDataTypeNameToFormFieldName: Record<string, string>,
) {
  const body = errorRes?.body;
  const errType = body?.type;

  const message = body?.hint?.errors?.[0]?.message;
  const dtName = body?.hint?.['data-type'];
  const field = apiDataTypeNameToFormFieldName[dtName];

  if (errType === 'validation-failed' && field && message) {
    form.setFieldError(field as keyof T, message);
  } else {
    errorToast(message ?? 'An error occurred. Please try again.');
  }
}
