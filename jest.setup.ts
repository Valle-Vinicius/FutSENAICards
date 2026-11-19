import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder as any;
global.TextDecoder = TextDecoder as any;
(globalThis as typeof globalThis & { __APP_VERSION__: string }).__APP_VERSION__ = '1.0.0';
