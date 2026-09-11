let xlsxModulePromise;

export const loadXlsx = () => {
  xlsxModulePromise ||= import('xlsx').then(module => module.default || module);
  return xlsxModulePromise;
};
