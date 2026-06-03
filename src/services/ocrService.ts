export const mockOCRExtraction = async (_file: File) => {
  await new Promise((resolve) => setTimeout(resolve, 900));
  return {
    fullName: "",
    designation: "",
    companyName: "",
    phoneNumber: "",
    secondaryPhoneNumber: "",
    emailAddress: "",
    secondaryEmailAddress: "",
    website: "",
    address: "",
  };
};
