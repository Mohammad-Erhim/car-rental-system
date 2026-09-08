import { react } from '@carrental/config/eslint';

export default [...react, { ignores: ['.next/**', 'next-env.d.ts', 'node_modules/**'] }];
