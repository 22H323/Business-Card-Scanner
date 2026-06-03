export const ValidationMessage = ({ message }: { message?: string }) => (message ? <p className="text-xs text-destructive">{message}</p> : null);
