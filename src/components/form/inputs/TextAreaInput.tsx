import { BaseInput } from "./BaseInput"; export const TextAreaInput = (props: { value: string; placeholder?: string; onChange: (value: string) => void }) => <BaseInput {...props} as="textarea" />;
