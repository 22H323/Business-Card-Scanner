import { useCallback, useMemo, useState } from "react";
import type { LeadField } from "@/constants/formFields";
import { validateField, type ValidationErrors } from "@/utils/validators";

export type FormValues = Record<string, string>;

export const useForm = (fields: LeadField[], initialValues: FormValues) => {
  const [values, setValues] = useState<FormValues>(initialValues);
  const [errors, setErrors] = useState<ValidationErrors>({});

  const setValue = useCallback((name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  }, []);

  const setMany = useCallback((next: FormValues) => {
    setValues((prev) => ({ ...prev, ...next }));
  }, []);

  const validate = useCallback((overrides?: FormValues) => {
    let nextErrors: ValidationErrors = {};
    setValues((current) => {
      const merged = overrides ? { ...current, ...overrides } : current;
      nextErrors = fields.reduce<ValidationErrors>((acc, field) => {
        const message = validateField(field, merged[field.name] || "");
        if (message) acc[field.name] = message;
        return acc;
      }, {});
      return current;
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [fields]);

  return useMemo(
    () => ({ values, errors, setValue, setMany, validate }),
    [values, errors, setValue, setMany, validate],
  );
};
