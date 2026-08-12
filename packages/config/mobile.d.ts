declare module 'expo-router' {
  export const useRouter: any;
  export const Stack: any;
  export const useLocalSearchParams: any;
  export const router: any;
  export default {};
}

declare module 'react-native' {
  export const View: any;
  export const Text: any;
  export const ScrollView: any;
  export const Pressable: any;
  export const StyleSheet: any;
  export const SafeAreaView: any;
  export const Platform: { select: any; OS: string };
  export const Alert: { alert: any };
  export const Dimensions: { get: any };
  export default {};
}

declare module 'react-native-safe-area-context' {
  export const SafeAreaProvider: any;
  export const useSafeAreaInsets: any;
  export default {};
}

declare module 'expo-constants' {
  export const Constants: { expoConfig: any; manifest: any };
  export default {};
}

declare module 'vitest' {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function expect<T>(actual: T): any;
  export function beforeAll(fn: () => void | Promise<void>): void;
  export function afterAll(fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
  export function vi: any;
  export default {};
}
