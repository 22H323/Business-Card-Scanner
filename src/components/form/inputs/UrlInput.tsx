import { BaseInput } from "./BaseInput"; export const UrlInput = (props: { value: string; placeholder?: string; onChange: (value: string) => void }) => <BaseInput {...props} type="url" />;
