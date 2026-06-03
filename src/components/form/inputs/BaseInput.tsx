import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
type Props = { as?: "input" | "textarea"; value: string; placeholder?: string; type?: string; onChange: (value: string) => void };
export const BaseInput = ({ as = "input", value, placeholder, type = "text", onChange }: Props) => { if (as === "textarea") return <Textarea value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="min-h-24 rounded-xl" />; return <Input value={value} placeholder={placeholder} type={type} onChange={(e) => onChange(e.target.value)} className="h-10 rounded-xl" />; };
