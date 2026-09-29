import { useRouter } from 'expo-router';
import { NativeScrollCompareScreen } from '../src/NativeScrollCompareScreen';

export default function NativeScrollAfterDemo() {
  const router = useRouter();
  return (
    <NativeScrollCompareScreen version="beta" onBack={() => router.back()} />
  );
}
