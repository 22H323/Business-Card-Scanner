import { BaseInput } from "./BaseInput"; export const PhoneInput = (props: { value: string; placeholder?: string; onChange: (value: string) => void }) => <BaseInput {...props} type="tel" />;
