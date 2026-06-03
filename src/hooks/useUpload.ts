import { useMemo, useState } from "react";

type UploadState = { file: File | null; previewUrl: string; error: string };

export const useUpload = () => {
  const [state, setState] = useState<UploadState>({ file: null, previewUrl: "", error: "" });

  const onFileSelect = (file: File | null) => {
    if (!file) return;
    if (!["image/jpeg", "image/jpg", "image/png"].includes(file.type)) return setState((prev) => ({ ...prev, error: "Upload JPG or PNG image only." }));
    if (file.size > 10 * 1024 * 1024) return setState((prev) => ({ ...prev, error: "File should be under 10MB." }));
    setState({ file, previewUrl: URL.createObjectURL(file), error: "" });
  };

  const clear = () => {
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    setState({ file: null, previewUrl: "", error: "" });
  };

  return useMemo(() => ({ ...state, onFileSelect, clear }), [state]);
};
