import { BaseInput } from "./BaseInput"; export const TextInput = (props: { value: string; placeholder?: string; onChange: (value: string) => void }) => <BaseInput {...props} type="text" />;
