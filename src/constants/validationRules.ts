export const validationRules = {
  required: (value: string) => value.trim().length > 0,
  email: (value: string) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  phone: (value: string) => !value || /^\+?[0-9()\-\s]{7,20}$/.test(value),
  url: (value: string) => !value || /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/.*)?$/.test(value),
};
