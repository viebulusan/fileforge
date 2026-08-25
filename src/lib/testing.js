// While this flag is set, every Pro gate in the app is open so the whole
// product can be tested end-to-end. Remove the env var to re-arm paywalls.
export const UNLOCK_ALL = import.meta.env.VITE_TESTING_UNLOCK_ALL === '1'
