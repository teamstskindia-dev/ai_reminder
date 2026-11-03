import { Alert, Platform, ToastAndroid } from 'react-native';

/** Short, non-blocking feedback. Native toast on Android, alert elsewhere. */
export function toast(message: string): void {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert(message);
  }
}
