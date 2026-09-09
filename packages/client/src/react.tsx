/**
 * `@carrental/client/react` — the React layer over the framework-agnostic core: the shared auth
 * provider and the form-error mapping hook. Needs `react`, `@tanstack/react-query`,
 * `@carrental/i18n` and `@carrental/ui` in the host app (all peers).
 */
export { AuthProvider, useAuth, type AuthContextValue, type AuthProviderProps } from './react/auth';
export { useFormErrors } from './react/use-form-errors';
