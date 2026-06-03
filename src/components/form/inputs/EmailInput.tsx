import { BaseInput } from "./BaseInput"; export const EmailInput = (props: { value: string; placeholder?: string; onChange: (value: string) => void }) => <BaseInput {...props} type="email" />;
