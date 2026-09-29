import { useRouter } from 'expo-router';
import { NativeScrollCompareScreen } from '../src/NativeScrollCompareScreen';

export default function NativeScrollBeforeDemo() {
  const router = useRouter();
  return (
    <NativeScrollCompareScreen
      version="published"
      onBack={() => router.back()}
    />
  );
}
