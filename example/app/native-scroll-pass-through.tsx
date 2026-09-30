import { useRouter } from 'expo-router';
import { NativeScrollCompareScreen } from '../src/NativeScrollCompareScreen';

export default function NativeScrollPassThroughDemo() {
  const router = useRouter();
  return (
    <NativeScrollCompareScreen
      version="passThrough"
      onBack={() => router.back()}
    />
  );
}
