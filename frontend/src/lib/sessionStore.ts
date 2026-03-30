// Simple in-memory storage that survives Next.js route changes (SPA navigation)
// but resets on a hard page refresh (F5).

let jobSearchState: any = null;
let transientAnalysis: any = null;

export const setJobSearchState = (state: any) => {
  jobSearchState = state;
};

export const getJobSearchState = () => {
  return jobSearchState;
};

export const setTransientAnalysis = (analysis: any) => {
  transientAnalysis = analysis;
};

export const getTransientAnalysis = () => {
  return transientAnalysis;
};
