declare module 'expo-router' {
  export const useRouter: any;
  export const Stack: any;
  export const Tabs: any;
  export const useLocalSearchParams: any;
  export const router: any;
  export const Link: any;
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
  export const Image: any;
  export const TextInput: any;
  export const TouchableOpacity: any;
  export const useColorScheme: any;
  export const ActivityIndicator: any;
  export const Switch: any;
  export default {};
}

declare module 'react-native-safe-area-context' {
  export const SafeAreaProvider: any;
  export const SafeAreaView: any;
  export const useSafeAreaInsets: any;
  export default {};
}

declare module 'expo-constants' {
  const Constants: { expoConfig: Record<string, any>; manifest: Record<string, any> };
  export default Constants;
}
